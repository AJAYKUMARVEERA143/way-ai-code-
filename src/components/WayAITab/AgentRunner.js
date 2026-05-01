import { PROVIDERS } from "../../lib/AccountManager.js";

const PLANNER_SYSTEM = `You are Way AI, an expert coding agent.
Given a task description and project context, output a JSON plan.
Output ONLY valid JSON. No markdown, no explanation.

Format:
{
  "title": "short task title",
  "steps": [
    { "type": "read_file", "path": "src/App.jsx" },
    { "type": "ai_call", "goal": "analyze the file" },
    { "type": "write_file", "path": "src/App.jsx", "goal": "apply fix" }
  ]
}

Step types: read_file, write_file, search_files, ai_call, run_command`;

const BLOCKED_COMMAND_PATTERNS = [
  /(^|\s)rm\s+-rf(\s|$)/i,
  /(^|\s)del\s+\/f/i,
  /(^|\s)format\s+[a-z]:/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-fd/i,
  /(^|\s)shutdown(\s|$)/i,
  /(^|\s)reboot(\s|$)/i,
  /(^|\s)mkfs(\s|$)/i,
];

function extractJson(text = "") {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\n([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractFirstCodeBlock(content = "") {
  const match = String(content).match(/```[^\n`]*\n([\s\S]*?)```/);
  return (match ? match[1] : String(content)).trim();
}

function shortText(value, max = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function roughTokenCountEstimation(text = "", bytesPerToken = 4) {
  return Math.max(1, Math.round(String(text).length / bytesPerToken));
}

export class StreamingTokenCounter {
  constructor(model = "") {
    this.currentModel = model;
    this.reset();
  }

  start(inputTokens = 0, model = "") {
    this.reset();
    this.startTime = Date.now();
    this.inputTokens = inputTokens;
    this.currentModel = model || this.currentModel;
  }

  addChunk(delta) {
    if (!delta) return;
    this.accumulated += delta;
    this._recountAtWordBoundary();
  }

  _recountAtWordBoundary() {
    const unprocessed = this.accumulated.slice(this.lastCounted);
    if (!unprocessed) return;
    const searchStart = unprocessed[0] === " " ? 1 : 0;
    const nextSpace = unprocessed.indexOf(" ", searchStart);
    const shouldCount = nextSpace > 0 || unprocessed.length > 50;
    if (!shouldCount) return;
    const boundary = nextSpace > 0 ? this.lastCounted + nextSpace : this.accumulated.length;
    const toCount = this.accumulated.slice(0, boundary);
    this.cachedOutput = this._estimate(toCount);
    this.lastCounted = boundary;
  }

  finalize() {
    if (this.accumulated.length > this.lastCounted) {
      this.cachedOutput = this._estimate(this.accumulated);
      this.lastCounted = this.accumulated.length;
    }
    return this.cachedOutput;
  }

  _estimate(text) {
    return roughTokenCountEstimation(text, this._getBytesPerToken());
  }

  _getBytesPerToken() {
    const model = String(this.currentModel || "").toLowerCase();
    if (model.includes("claude")) return 3.5;
    if (model.includes("gpt-4")) return 4.0;
    if (model.includes("gpt-3")) return 4.0;
    if (model.includes("gemini")) return 3.5;
    if (model.includes("llama")) return 3.8;
    if (model.includes("deepseek")) return 3.5;
    if (model.includes("mistral")) return 3.5;
    return 4.0;
  }

  get total() { return this.inputTokens + this.cachedOutput; }
  get output() { return this.cachedOutput; }
  get elapsedMs() { return this.startTime > 0 ? Date.now() - this.startTime : 0; }
  get tokensPerSecond() { return this.elapsedMs ? (this.cachedOutput / this.elapsedMs) * 1000 : 0; }

  reset() {
    this.inputTokens = 0;
    this.accumulated = "";
    this.lastCounted = 0;
    this.cachedOutput = 0;
    this.startTime = 0;
  }
}

export class AgentRunner {
  constructor({ manager, fsApi, terminalApi, onStep, onToken, onComplete, onError }) {
    this.manager = manager;
    this.fsApi = fsApi;
    this.terminalApi = terminalApi;
    this.onStep = onStep;
    this.onToken = onToken;
    this.onComplete = onComplete;
    this.onError = onError;
    this.stopped = false;
    this.abortController = null;
  }

  stop() {
    this.stopped = true;
    this.abortController?.abort();
  }

  async run(taskDescription, context) {
    this.stopped = false;
    const plan = await this._plan(taskDescription, context);
    const task = {
      id: `task_${Date.now()}`,
      title: plan.title || shortText(taskDescription, 60),
      description: taskDescription,
      status: "running",
      steps: plan.steps.map((step, index) => ({
        id: `step_${index}_${Date.now()}`,
        type: step.type,
        label: this._stepLabel(step),
        status: "pending",
        input: this._sanitizeStepInput(step),
        output: "",
        tokens: 0,
      })),
      totalTokens: 0,
      totalCost: 0,
      startedAt: Date.now(),
      completedAt: null,
      accountId: this.manager.getStatus()?.activeId || null,
    };

    const memory = { fileContents: {}, lastAiResponse: "", searchResults: [], lastCommand: null, context };
    this.onStep?.({ kind: "task_started", task: structuredClone(task) });

    try {
      for (let index = 0; index < plan.steps.length; index += 1) {
        if (this.stopped) {
          task.status = "stopped";
          break;
        }
        const rawStep = plan.steps[index];
        task.steps[index].status = "running";
        this.onStep?.({ kind: "step_started", index, step: { ...task.steps[index] }, task: structuredClone(task) });
        let result;
        try {
          result = await this._executeStep(rawStep, context, memory);
        } catch (error) {
          task.steps[index] = {
            ...task.steps[index],
            status: this.stopped ? "stopped" : "error",
            output: shortText(error?.message || error),
          };
          this.onStep?.({ kind: "step_completed", index, step: { ...task.steps[index] }, task: structuredClone(task) });
          throw error;
        }
        task.steps[index] = {
          ...task.steps[index],
          status: "done",
          output: result.summary,
          tokens: result.tokens || 0,
        };
        task.totalTokens += result.tokens || 0;
        task.totalCost += result.cost || 0;
        if (result.accountId) task.accountId = result.accountId;
        this.onStep?.({ kind: "step_completed", index, step: { ...task.steps[index] }, task: structuredClone(task) });
      }

      task.completedAt = Date.now();
      if (task.status !== "stopped") task.status = "done";
      this.onComplete?.(task);
      return task;
    } catch (error) {
      task.status = this.stopped ? "stopped" : "error";
      task.completedAt = Date.now();
      this.onError?.(error, task);
      throw error;
    }
  }

  async _plan(taskDescription, context) {
    const userPrompt = `Task: ${taskDescription}\nOpen files: ${(context.openFiles || []).join(", ") || "none"}\nActive file: ${context.activeFile || "none"}\nLanguage: ${context.language || "plaintext"}`;
    const prompt = `${PLANNER_SYSTEM}\n\n${userPrompt}`;
    const counter = new StreamingTokenCounter(this.manager.getStatus()?.active?.model || "");
    counter.start(roughTokenCountEstimation(prompt));
    try {
      const response = await this._aiCall(prompt, counter, { label: "Planning task", systemPrompt: PLANNER_SYSTEM });
      const parsed = JSON.parse(extractJson(response.result));
      if (!Array.isArray(parsed.steps) || !parsed.steps.length) throw new Error("Planner returned no steps");
      return parsed;
    } catch {
      const activeFile = context.activeFile;
      const fallbackSteps = [];
      if (activeFile) fallbackSteps.push({ type: "read_file", path: activeFile });
      if ((context.openFiles || []).length > 1) fallbackSteps.push({ type: "search_files", query: context.language || "src", maxResults: 8 });
      fallbackSteps.push({ type: "ai_call", goal: taskDescription });
      if (/fix|update|write|change|refactor|add|implement/i.test(taskDescription) && activeFile) {
        fallbackSteps.push({ type: "write_file", path: activeFile, goal: taskDescription });
      }
      return { title: shortText(taskDescription, 60), steps: fallbackSteps };
    }
  }

  async _executeStep(step, context, memory) {
    if (this.stopped) throw new Error("Task stopped");
    switch (step.type) {
      case "read_file":
        return this._readFileStep(step, memory);
      case "write_file":
        return this._writeFileStep(step, memory);
      case "search_files":
      case "search":
        return this._searchFilesStep(step, context, memory);
      case "run_command":
        return this._runCommandStep(step, context, memory);
      case "ai_call":
      default:
        return this._aiCallStep(step, context, memory);
    }
  }

  async _readFileStep(step, memory) {
    const content = await this.fsApi.readFile(step.path);
    memory.fileContents[step.path] = content;
    return {
      summary: `Read ${step.path}`,
      tokens: roughTokenCountEstimation(content),
      cost: 0,
    };
  }

  async _writeFileStep(step, memory) {
    const nextContent = step.content || extractFirstCodeBlock(memory.lastAiResponse);
    if (!nextContent) throw new Error(`No generated content available for ${step.path}`);
    const previous = memory.fileContents[step.path] || "";
    await this.fsApi.writeFile(step.path, nextContent);
    memory.fileContents[step.path] = nextContent;
    return {
      summary: `Wrote ${step.path}`,
      tokens: roughTokenCountEstimation(nextContent),
      cost: 0,
      diff: this._simpleDiff(previous, nextContent),
    };
  }

  async _searchFilesStep(step, context, memory) {
    const files = await this.fsApi.searchFiles(context.projectRoot, step.query || "", step.maxResults || 12);
    memory.searchResults = files;
    return {
      summary: `Found ${files.length} matches for ${step.query || "query"}`,
      tokens: roughTokenCountEstimation(files.map(file => file.path || file.name).join("\n")),
      cost: 0,
    };
  }

  async _runCommandStep(step, context, memory) {
    if (!this.terminalApi?.run) throw new Error("Terminal API unavailable");
    this._validateCommand(step.command || "");
    const result = await this.terminalApi.run(context.projectRoot, step.command || "", step.timeoutSecs || 45);
    memory.lastCommand = result;
    return {
      summary: `Ran ${step.command}`,
      tokens: roughTokenCountEstimation(`${result.stdout || ""}\n${result.stderr || ""}`),
      cost: 0,
    };
  }

  async _aiCallStep(step, context, memory) {
    const fileSummaries = Object.entries(memory.fileContents)
      .slice(-3)
      .map(([path, content]) => `File: ${path}\n\`\`\`\n${String(content).slice(0, 5000)}\n\`\`\``)
      .join("\n\n");
    const searchSummary = (memory.searchResults || []).slice(0, 8).map(item => item.path || item.name).join(", ");
    const prompt = [
      `Task goal: ${step.goal || context.taskDescription}`,
      `Language: ${context.language}`,
      context.activeFile ? `Active file: ${context.activeFile}` : "",
      searchSummary ? `Search results: ${searchSummary}` : "",
      fileSummaries,
      "When changing code, return the full replacement code block for the target file.",
    ].filter(Boolean).join("\n\n");
    const counter = new StreamingTokenCounter(this.manager.getStatus()?.active?.model || "");
    counter.start(roughTokenCountEstimation(prompt), this.manager.getStatus()?.active?.model || "");
    const response = await this._aiCall(prompt, counter, { label: step.goal || "Analyzing task" });
    memory.lastAiResponse = response.result;
    return {
      summary: shortText(response.result),
      tokens: response.tokens,
      cost: response.cost,
      accountId: response.account?.id || null,
    };
  }

  async _aiCall(prompt, counter, meta = {}, attempt = 0) {
    if (this.stopped) throw new Error("Task stopped");
    await this._ensureBestAccount();
    const active = this.manager.getStatus()?.active;
    const activeAccountId = active?.id || this.manager.getStatus()?.activeId || null;
    const activeModel = active?.model || counter.currentModel;
    this.abortController = new AbortController();
    counter.currentModel = active?.model || counter.currentModel;
    try {
      const { result, account } = await this.manager.call(prompt, {
        signal: this.abortController.signal,
        onToken: (chunk) => {
          counter.addChunk(chunk);
          this.onToken?.({
            chunk,
            inputTokens: counter.inputTokens,
            outputTokens: counter.output,
            totalTokens: counter.total,
            tokensPerSecond: counter.tokensPerSecond,
            accountId: activeAccountId,
            model: activeModel,
            meta,
          });
        },
      });
      counter.finalize();
      const provider = PROVIDERS[account.provider] || {};
      const cost = (((counter.inputTokens + counter.output) / 1000) * (provider.costPer1k || 0));
      return { result, account, tokens: counter.total, cost };
    } catch (error) {
      if (error?.name === "AbortError" || this.stopped) throw new Error("Task stopped");
      if (attempt >= Math.max(2, this.manager.getAll().length)) throw error;
      const nextBefore = this.manager.getStatus()?.active;
      await this._ensureBestAccount({ emit: true, previous: nextBefore });
      return this._aiCall(prompt, counter, meta, attempt + 1);
    } finally {
      this.abortController = null;
    }
  }

  async _ensureBestAccount({ emit = false, previous = null } = {}) {
    const accounts = this.manager.getAll();
    const cloudReady = accounts.filter(acc => !PROVIDERS[acc.provider]?.local && acc.status === "active");
    const localReady = accounts.filter(acc => PROVIDERS[acc.provider]?.local && acc.status === "active");
    const offline = !navigator.onLine || cloudReady.length === 0;
    if (offline) {
      const local = localReady[0];
      if (!local) throw new Error("All accounts exhausted and no local model available.");
      if (this.manager.getStatus()?.activeId !== local.id) {
        this.manager.setActive(local.id);
        if (emit) {
          this.onStep?.({
            kind: "info",
            message: previous ? `Switched to offline mode: ${previous.label} → ${local.label}` : `Switched to offline mode: ${local.label}`,
          });
        }
      }
      return local;
    }

    const active = this.manager.getStatus()?.active;
    if (active?.status === "active") return active;
    const best = cloudReady[0] || localReady[0] || null;
    if (!best) throw new Error("All accounts exhausted — add more API keys.");
    if (active?.id !== best.id) {
      this.manager.setActive(best.id);
      if (emit) {
        this.onStep?.({ kind: "info", message: `Switching: ${active?.label || "unknown"} → ${best.label}...` });
      }
    }
    return best;
  }

  _simpleDiff(before = "", after = "") {
    const oldLines = String(before).split("\n");
    const newLines = String(after).split("\n");
    const lines = ["--- before", "+++ after"];
    const max = Math.max(oldLines.length, newLines.length);
    for (let index = 0; index < max; index += 1) {
      if (oldLines[index] === newLines[index]) continue;
      if (oldLines[index] != null) lines.push(`-${oldLines[index]}`);
      if (newLines[index] != null) lines.push(`+${newLines[index]}`);
      if (lines.length > 30) break;
    }
    return lines.join("\n");
  }

  _validateCommand(command) {
    const text = String(command || "").trim();
    if (!text) throw new Error("Command step missing command text");
    const blocked = BLOCKED_COMMAND_PATTERNS.find(pattern => pattern.test(text));
    if (blocked) throw new Error(`Blocked unsafe command: ${text}`);
  }

  _sanitizeStepInput(step) {
    const safe = { ...step };
    delete safe.content;
    delete safe.systemPrompt;
    return safe;
  }

  _stepLabel(step) {
    if (step.type === "read_file") return `Read ${step.path}`;
    if (step.type === "write_file") return `Write ${step.path}`;
    if (step.type === "search_files" || step.type === "search") return `Search ${step.query}`;
    if (step.type === "run_command") return `Run ${step.command}`;
    return step.goal || "Analyze and act";
  }
}