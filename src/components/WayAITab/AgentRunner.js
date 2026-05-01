import { PROVIDERS } from "../../lib/AccountManager.js";

// ── Input sanitization ─────────────────────────────────────────────────────
const MAX_TASK_LENGTH = 2000;
const MAX_FILE_SIZE = 1_000_000;
const MAX_DIFF_LINES = 200;

const INJECTION_PATTERNS = [
  /ignore (previous|above|all) instructions/i,
  /you are now/i,
  /new persona/i,
  /system prompt/i,
  /\bsudo\b/i,
  /curl\s+https?:\/\//i,
  /wget\s+https?:\/\//i,
  /base64\s*-d/i,
  /\/etc\/shadow/i,
  /\/etc\/passwd/i,
  /rm\s+-rf/i,
  /(;|\|{1,2}|&&)\s*(curl|wget|nc|bash|sh|python|node)/i,
];

const ALLOWED_STEP_TYPES = new Set(["read_file", "write_file", "search_files", "ai_call", "run_command", "search", "create_file", "delete_file"]);

// ── Command whitelist ──────────────────────────────────────────────────────
const ALLOWED_COMMANDS = {
  git: ["status", "log", "diff", "add", "commit", "push", "pull", "branch", "checkout", "clone", "fetch", "stash", "reset", "restore"],
  npm: ["install", "run", "test", "build", "audit", "ci", "ls"],
  node: ["-e", "-v", "--version", "-p"],
  cargo: ["build", "test", "check", "run", "fmt", "clippy"],
  python: ["-m", "-c", "--version", "-V"],
  python3: ["--version", "-V", "-m", "-c"],
};

const ALWAYS_BLOCKED = [
  /\$\(/, /`/, /&&/, /\|\|/, />>?/, /<</, /;/,
  /\/dev\//, /\/proc\//, /\/sys\//,
  /curl|wget|nc\b|ncat|socat|ssh|scp|sftp/i,
];

const PLANNER_SYSTEM = `You are Way AI, a senior software engineer coding agent.
You plan tasks as a Planner → Executor → Verifier loop.

Rules:
- Always read before writing. Never guess file contents.
- Prefer minimal, surgical edits. Do not rewrite files unnecessarily.
- For new features: search existing patterns first, then create/write.
- For bugs: read the file, ai_call to analyze, write_file with fix.
- Use create_file only for genuinely new files that don't exist yet.
- Use delete_file only when explicitly asked; mark it for confirmation.
- Workspace paths must be relative to the project root.
- Max 12 steps. Output ONLY valid JSON.

Step types:
  read_file   - read an existing file (path required)
  write_file  - overwrite/update a file (path required; content from prior ai_call)
  create_file - create a new file (path required; content from prior ai_call)
  delete_file - delete a file (path required; always shown as preview, requires confirmation)
  search_files - search workspace for files matching a query
  ai_call     - call AI to analyze/generate code (goal required)
  run_command - run an allowed CLI command (command required)

Output format:
{
  "title": "short task title",
  "steps": [
    { "type": "read_file", "path": "src/App.jsx" },
    { "type": "ai_call", "goal": "analyze and produce the fix" },
    { "type": "write_file", "path": "src/App.jsx", "goal": "apply fix" }
  ]
}`;

function sanitizeTaskInput(input) {
  if (typeof input !== "string") throw new Error("Task must be a string.");
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error("Task description cannot be empty.");
  if (trimmed.length > MAX_TASK_LENGTH) throw new Error(`Task too long (max ${MAX_TASK_LENGTH} chars).`);
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) throw new Error("Task description contains disallowed content.");
  }
  return trimmed.replace(/`/g, "'").replace(/\$\{/g, "$(");
}

function extractJson(text = "") {
  const source = String(text || "");
  const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  const objMatch = source.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  try { return JSON.parse(source.trim()); } catch {}
  throw new Error(`Agent did not return valid JSON. Raw response: ${source.slice(0, 200)}`);
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object") throw new Error("Agent returned invalid plan.");
  if (typeof plan.title !== "string" || plan.title.length > 200) throw new Error("Invalid plan title.");
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) throw new Error("Plan has no steps.");
  if (plan.steps.length > 20) throw new Error("Plan too many steps (max 20).");
  for (const step of plan.steps) {
    if (!ALLOWED_STEP_TYPES.has(step.type)) throw new Error(`Unknown step type: ${step.type}`);
    if ((step.type === "read_file" || step.type === "write_file") && typeof step.path !== "string") {
      throw new Error("Step missing path.");
    }
  }
  return plan;
}

function assertWithinWorkspace(filePath, workspaceRoot) {
  if (!workspaceRoot) return;
  const normalize = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/g, "");
  const norm = normalize(filePath);
  const root = normalize(workspaceRoot);
  if (!norm.startsWith(`${root}/`) && norm !== root) {
    throw new Error(`Access denied: "${filePath}" is outside workspace "${workspaceRoot}"`);
  }
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
  constructor({ manager, fsApi, terminalApi, workspaceRoot, onStep, onToken, onComplete, onError }) {
    this.manager = manager;
    this.fsApi = fsApi;
    this.terminalApi = terminalApi;
    this.workspaceRoot = workspaceRoot || "";
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
    const safeTask = sanitizeTaskInput(taskDescription);
    const plan = await this._plan(safeTask, context);
    const task = {
      id: `task_${Date.now()}`,
      title: plan.title || shortText(safeTask, 60),
      description: safeTask,
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
      dryRun: !!context.dryRun,
      forecast: { reads: 0, writes: 0, searches: 0, commands: 0, aiCalls: 0 },
      previews: [],
    };

    for (const step of plan.steps) {
      if (step.type === "read_file") task.forecast.reads += 1;
      else if (step.type === "write_file") task.forecast.writes += 1;
      else if (step.type === "search_files" || step.type === "search") task.forecast.searches += 1;
      else if (step.type === "run_command") task.forecast.commands += 1;
      else task.forecast.aiCalls += 1;
    }

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
        if (result.preview) task.previews.push(result.preview);
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
      const parsed = extractJson(response.result);
      return validatePlan(parsed);
    } catch {
      const activeFile = context.activeFile;
      const fallbackSteps = [];
      if (activeFile) fallbackSteps.push({ type: "read_file", path: activeFile });
      if ((context.openFiles || []).length > 1) fallbackSteps.push({ type: "search_files", query: context.language || "src", maxResults: 8 });
      fallbackSteps.push({ type: "ai_call", goal: taskDescription });
      if (/fix|update|write|change|refactor|add|implement/i.test(taskDescription) && activeFile) {
        fallbackSteps.push({ type: "write_file", path: activeFile, goal: taskDescription });
      }
      return validatePlan({ title: shortText(taskDescription, 60), steps: fallbackSteps });
    }
  }

  async _executeStep(step, context, memory) {
    if (this.stopped) throw new Error("Task stopped");
    switch (step.type) {
      case "read_file":
        return this._readFileStep(step, memory);
      case "write_file":
        return this._writeFileStep(step, memory);
      case "create_file":
        return this._createFileStep(step, memory);
      case "delete_file":
        return this._deleteFileStep(step, memory);
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

  async _createFileStep(step, memory) {
    assertWithinWorkspace(step.path, this.workspaceRoot || memory.context?.projectRoot);
    if (!step.path) throw new Error("create_file step missing path");
    const content = step.content || extractFirstCodeBlock(memory.lastAiResponse) || "";
    if (content.length > MAX_FILE_SIZE) throw new Error(`File too large for ${step.path}`);
    if (!memory.context?.dryRun) {
      await this.fsApi.writeFile(step.path, content);
    }
    memory.fileContents[step.path] = content;
    return {
      summary: `${memory.context?.dryRun ? "Would create" : "Created"} ${step.path}`,
      tokens: roughTokenCountEstimation(content),
      cost: 0,
      preview: { kind: "create", path: step.path, simulated: !!memory.context?.dryRun, summary: `${memory.context?.dryRun ? "Would create" : "Created"}: ${step.path}` },
    };
  }

  async _deleteFileStep(step, memory) {
    assertWithinWorkspace(step.path, this.workspaceRoot || memory.context?.projectRoot);
    if (!step.path) throw new Error("delete_file step missing path");
    // Deletes always show as preview/confirmation required unless step.confirmed === true
    const doDelete = !memory.context?.dryRun && step.confirmed === true;
    if (!doDelete) {
      return {
        summary: `Delete ${step.path} — awaiting confirmation`,
        tokens: 0, cost: 0,
        preview: { kind: "delete", path: step.path, simulated: true, summary: `Pending confirmation: delete ${step.path}` },
      };
    }
    if (this.fsApi.deleteEntry) await this.fsApi.deleteEntry(step.path);
    return {
      summary: `Deleted ${step.path}`,
      tokens: 0, cost: 0,
      preview: { kind: "delete", path: step.path, simulated: false, summary: `Deleted: ${step.path}` },
    };
  }

  async _readFileStep(step, memory) {
    assertWithinWorkspace(step.path, this.workspaceRoot || memory.context?.projectRoot);
    const content = await this.fsApi.readFile(step.path);
    memory.fileContents[step.path] = content;
    return {
      summary: `Read ${step.path}`,
      tokens: roughTokenCountEstimation(content),
      cost: 0,
    };
  }

  async _writeFileStep(step, memory) {
    assertWithinWorkspace(step.path, this.workspaceRoot || memory.context?.projectRoot);
    const nextContent = step.content || extractFirstCodeBlock(memory.lastAiResponse);
    if (!nextContent) throw new Error(`No generated content available for ${step.path}`);
    if (nextContent.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${nextContent.length} chars exceeds limit of ${MAX_FILE_SIZE}`);
    }
    const previous = memory.fileContents[step.path] || "";
    if (!memory.context?.dryRun) {
      await this.fsApi.writeFile(step.path, nextContent);
    }
    memory.fileContents[step.path] = nextContent;
    return {
      summary: `${memory.context?.dryRun ? "Simulated write" : "Wrote"} ${step.path}`,
      tokens: roughTokenCountEstimation(nextContent),
      cost: 0,
      diff: this._simpleDiff(previous, nextContent),
      preview: {
        kind: "write",
        path: step.path,
        simulated: !!memory.context?.dryRun,
        summary: shortText(nextContent, 140),
      },
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
    if (context.dryRun) {
      return {
        summary: `Simulated command ${step.command}`,
        tokens: roughTokenCountEstimation(step.command || ""),
        cost: 0,
        preview: {
          kind: "command",
          simulated: true,
          command: step.command,
          summary: `Would run: ${step.command}`,
        },
      };
    }
    const result = await this.terminalApi.run(context.projectRoot, step.command || "", step.timeoutSecs || 45);
    memory.lastCommand = result;
    return {
      summary: `Ran ${step.command}`,
      tokens: roughTokenCountEstimation(`${result.stdout || ""}\n${result.stderr || ""}`),
      cost: 0,
      preview: {
        kind: "command",
        simulated: false,
        command: step.command,
        summary: shortText(`${result.stdout || ""}\n${result.stderr || ""}`, 140),
      },
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
      if (lines.length > MAX_DIFF_LINES) {
        lines.push(`... (${Math.max(0, max - index - 1)} more lines — accept to see full change)`);
        break;
      }
    }
    return lines.join("\n");
  }

  _validateCommand(command) {
    const text = String(command || "").trim();
    if (!text) throw new Error("Command step missing command text");
    for (const pattern of ALWAYS_BLOCKED) {
      if (pattern.test(text)) throw new Error(`Blocked shell pattern in command: ${text}`);
    }
    const parts = text.split(/\s+/).filter(Boolean);
    const cmd = parts[0];
    const args = parts.slice(1);
    const allowed = ALLOWED_COMMANDS[cmd];
    if (!allowed) throw new Error(`Command not allowed: ${cmd}. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(", ")}`);
    const sub = args[0];
    if (sub && !allowed.includes(sub)) throw new Error(`Subcommand not allowed: ${cmd} ${sub}`);
  }

  _sanitizeStepInput(step) {
    const safe = { ...step };
    delete safe.content;
    delete safe.systemPrompt;
    return safe;
  }

  _stepLabel(step) {
    if (step.type === "read_file")   return `Read ${step.path}`;
    if (step.type === "write_file")  return `Write ${step.path}`;
    if (step.type === "create_file") return `Create ${step.path}`;
    if (step.type === "delete_file") return `Delete ${step.path}`;
    if (step.type === "search_files" || step.type === "search") return `Search ${step.query}`;
    if (step.type === "run_command") return `Run ${step.command}`;
    return step.goal || "Analyze and act";
  }
}