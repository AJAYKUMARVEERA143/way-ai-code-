import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS } from "../../lib/AccountManager.js";
import { MOCK_ROOT, readFile, searchFiles, writeFile, createFile, deleteEntry, runToolCommand } from "../../lib/fs.js";
import { AgentRunner } from "./AgentRunner.js";
import TokenTracker from "./TokenTracker.jsx";
import TaskHistory from "./TaskHistory.jsx";

const HISTORY_KEY = "wayai_task_history";
const DEBUG_LOG_LIMIT = 80;
const SENSITIVE_PATTERNS = [
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /bearer\s+\S+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /AIza[a-zA-Z0-9_-]{35}/g,
];

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch {}
}

function sanitizeForHistory(text) {
  let safe = String(text || "");
  for (const pattern of SENSITIVE_PATTERNS) {
    safe = safe.replace(pattern, "[REDACTED]");
  }
  return safe.slice(0, 500);
}

function currentSelection(editorRef) {
  const editor = editorRef?.current;
  if (!editor) return "";
  const model = editor.getModel?.();
  const selection = editor.getSelection?.();
  if (!model || !selection) return "";
  return model.getValueInRange(selection)?.trim() || "";
}

function quickPrompt(kind, code, lang, selection) {
  const target = selection || code || "";
  if (kind === "fix") return `Fix this ${lang} code and apply the smallest safe change needed.\n\n\`\`\`${lang}\n${target}\n\`\`\``;
  if (kind === "explain") return `Explain this ${lang} code, highlight risks, and propose next edits if needed.\n\n\`\`\`${lang}\n${target}\n\`\`\``;
  return `Review this ${lang} code and suggest a pragmatic implementation plan.\n\n\`\`\`${lang}\n${target}\n\`\`\``;
}

function analyzeTaskDNA(taskInput, context) {
  const text = String(taskInput || "").toLowerCase();
  const tokens = text.split(/\s+/).filter(Boolean);
  const destructive = /(delete|remove|drop|wipe|truncate|kill|destroy|reset|rewrite all|replace entire)/.test(text);
  const commandHeavy = /(build|run|npm|cargo|python|terminal|command|shell|script)/.test(text);
  const multiFile = /(across|project|workspace|all files|entire app|system|repo|repository|cross-file)/.test(text) || (context.openFiles?.length || 0) > 3;
  const intent = destructive ? "destructive" : /refactor|cleanup|rename|restructure/.test(text) ? "refactor" : /explain|why|understand|walkthrough/.test(text) ? "explain" : /test|spec|coverage/.test(text) ? "test" : /fix|bug|issue|error|debug/.test(text) ? "debug" : commandHeavy ? "operate" : "build";
  const scope = multiFile ? "project-wide" : context.activeFile ? "active-file" : "open-context";
  const risk = destructive ? "high" : commandHeavy || multiFile ? "medium" : "low";
  const confidence = Math.max(18, Math.min(96,
    38 +
    (context.activeFile ? 16 : 0) +
    ((context.selectionLength || 0) > 0 ? 12 : 0) +
    ((context.openFiles?.length || 0) > 1 ? 8 : 0) +
    (context.offlineReady ? 6 : 0) -
    (risk === "high" ? 24 : risk === "medium" ? 10 : 0)
  ));

  const tags = [
    `${tokens.length || 0} words`,
    context.language || "plaintext",
    context.activeProviderLabel || "No provider",
    context.offlineReady ? "offline-ready" : "cloud-only",
    commandHeavy ? "tool-aware" : "code-first",
  ];

  return { intent, scope, risk, confidence, commandHeavy, destructive, tags };
}

function blueprintPrompt(kind, context) {
  const file = context.activeFile || "the active file";
  const selection = context.selection || context.code || "";
  if (kind === "pulse") {
    return `Perform a Patch Pulse on ${file}. Detect the smallest high-impact improvement, explain the risk, then implement only the minimal safe change.\n\n\`\`\`${context.language}\n${selection}\n\`\`\``;
  }
  if (kind === "map") {
    return `Create a System Map for ${file}. Explain the controlling code path, dependencies, likely failure points, and the next safest edit slice.\n\n\`\`\`${context.language}\n${selection}\n\`\`\``;
  }
  return `Run a Risk Scan on ${file}. Identify security, reliability, and regression risks first. Then propose the smallest fix plan.\n\n\`\`\`${context.language}\n${selection}\n\`\`\``;
}

function stamp() {
  return new Date().toLocaleTimeString();
}

const DEFAULT_TOKEN_STATS = {
  currentInput: 0, currentOutput: 0,
  sessionInput: 0, sessionOutput: 0,
  tokensPerSecond: 0, estimatedCost: 0,
  sessionCost: 0, activeAccountId: null,
  perAccount: {}, rotationMessage: "",
};

function mkSession(name = "Chat 1") {
  return {
    id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    taskInput: "",
    currentTask: null,
    streaming: false,
    shadowMode: false,
    debugLog: [],
    tokenStats: { ...DEFAULT_TOKEN_STATS },
  };
}

export default function WayAITab({ manager, accStatus, editorRef, code, lang, projectRoot, activeFile, openFiles }) {
  const [history, setHistory] = useState(loadHistory);
  const [chatSessions, setChatSessions] = useState(() => [mkSession("Chat 1")]);
  const [activeChatId, setActiveChatId] = useState(null);

  const patchSession = useCallback((id, updater) => {
    setChatSessions(prev => prev.map(s =>
      s.id === id ? (typeof updater === "function" ? updater(s) : { ...s, ...updater }) : s
    ));
  }, []);

  const activeSession = chatSessions.find(s => s.id === activeChatId) || chatSessions[0] || mkSession("Chat 1");
  const sid = activeSession.id;

  // Derived state — reads active session
  const taskInput   = activeSession.taskInput;
  const currentTask = activeSession.currentTask;
  const streaming   = activeSession.streaming;
  const shadowMode  = activeSession.shadowMode;
  const debugLog    = activeSession.debugLog;
  const tokenStats  = activeSession.tokenStats;

  // Setter shims — each captures the `sid` at the time it is called (render-time)
  const setTaskInput   = (v) => patchSession(sid, s => ({ taskInput:   typeof v === "function" ? v(s.taskInput)   : v }));
  const setCurrentTask = (v) => patchSession(sid, s => ({ currentTask: typeof v === "function" ? v(s.currentTask) : v }));
  const setStreaming    = (v) => patchSession(sid, { streaming: v });
  const setShadowMode  = (v) => patchSession(sid, { shadowMode: v });
  const setDebugLog    = (v) => patchSession(sid, s => ({ debugLog:   typeof v === "function" ? v(s.debugLog)   : v }));
  const setTokenStats  = (v) => patchSession(sid, s => ({ tokenStats: typeof v === "function" ? v(s.tokenStats) : v }));

  const runnerRefs    = useRef({});
  const isRunningRefs = useRef({});
  // Per-session ref shims so existing code using runnerRef/isRunningRef works unchanged
  const runnerRef    = { get current() { return runnerRefs.current[sid];    }, set current(v) { runnerRefs.current[sid] = v;    } };
  const isRunningRef = { get current() { return !!isRunningRefs.current[sid]; }, set current(v) { isRunningRefs.current[sid] = v; } };

  const addSession = () => {
    const s = mkSession(`Chat ${chatSessions.length + 1}`);
    setChatSessions(prev => [...prev, s]);
    setActiveChatId(s.id);
  };

  const removeSession = (id) => {
    const remaining = chatSessions.filter(s => s.id !== id);
    setChatSessions(remaining.length ? remaining : [mkSession("Chat 1")]);
    if (activeChatId === id) setActiveChatId(remaining[0]?.id ?? null);
  };

  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => {
    setChatSessions(prev => prev.map(s => ({
      ...s,
      tokenStats: { ...s.tokenStats, activeAccountId: accStatus.activeId || s.tokenStats.activeAccountId },
    })));
  }, [accStatus.activeId]);

  const accountOptions = useMemo(() => {
    const grouped = {};
    for (const account of accStatus.accounts || []) {
      const label = PROVIDERS[account.provider]?.label || account.provider;
      grouped[label] = grouped[label] || [];
      grouped[label].push(account);
    }
    return grouped;
  }, [accStatus.accounts]);

  const appendHistory = (task) => {
    const safeTask = {
      ...task,
      title: sanitizeForHistory(task.title),
      description: sanitizeForHistory(task.description),
      steps: (task.steps || []).map(step => ({
        id: step.id,
        label: step.label,
        status: step.status,
        tokens: step.tokens,
        input: sanitizeForHistory(step.input ? JSON.stringify(step.input) : ""),
        output: "",
      })),
    };
    setHistory(prev => [safeTask, ...prev].slice(0, 50));
  };

  const pushDebug = (message, tone = "info") => {
    setDebugLog(prev => [{ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: stamp(), tone, message }, ...prev].slice(0, DEBUG_LOG_LIMIT));
  };

  const buildRunner = () => new AgentRunner({
    manager,
    fsApi: { readFile, writeFile, searchFiles, createFile, deleteEntry },
    terminalApi: { run: (root, command, timeoutSecs) => runToolCommand(root || projectRoot || MOCK_ROOT, command.split(" ")[0] || command, command.split(" ").slice(1), timeoutSecs) },
    workspaceRoot: projectRoot || MOCK_ROOT,
    onStep: (event) => {
      if (event.kind === "task_started") {
        setCurrentTask(event.task);
        setStreaming(true);
        pushDebug(`Task started: ${event.task.title}`, "info");
        return;
      }
      if (event.kind === "step_started") {
        setCurrentTask(event.task);
        pushDebug(`Step started: ${event.step.label}`, "info");
        return;
      }
      if (event.kind === "step_completed") {
        setCurrentTask(event.task);
        pushDebug(`Step ${event.step.status}: ${event.step.label}${event.step.output ? ` — ${event.step.output}` : ""}`, event.step.status === "error" ? "error" : event.step.status === "done" ? "ok" : "warn");
        return;
      }
      if (event.kind === "info") {
        setTokenStats(prev => ({ ...prev, rotationMessage: event.message }));
        pushDebug(event.message, "warn");
      }
    },
    onToken: (sample) => {
      setTokenStats(prev => {
        const nextPerAccount = { ...prev.perAccount };
        const current = nextPerAccount[sample.accountId] || { input: 0, output: 0, cost: 0 };
        const activeAccount = (accStatus.accounts || []).find(account => account.id === sample.accountId);
        const rate = PROVIDERS[activeAccount?.provider]?.costPer1k || 0;
        nextPerAccount[sample.accountId] = {
          input: Math.max(current.input, sample.inputTokens || 0),
          output: Math.max(current.output, sample.outputTokens || 0),
          cost: ((sample.totalTokens || 0) / 1000) * rate,
        };
        return {
          ...prev,
          currentInput: sample.inputTokens || 0,
          currentOutput: sample.outputTokens || 0,
          tokensPerSecond: sample.tokensPerSecond || 0,
          activeAccountId: sample.accountId || prev.activeAccountId,
          estimatedCost: ((sample.totalTokens || 0) / 1000) * rate,
          perAccount: nextPerAccount,
        };
      });
    },
    onComplete: (task) => {
      setStreaming(false);
      setCurrentTask(task);
      pushDebug(`Task completed: ${task.title} · ${Number(task.totalTokens || 0).toLocaleString()} tok`, "ok");
      setTokenStats(prev => ({
        ...prev,
        sessionInput: prev.sessionInput + prev.currentInput,
        sessionOutput: prev.sessionOutput + prev.currentOutput,
        sessionCost: prev.sessionCost + prev.estimatedCost,
        rotationMessage: "",
      }));
      appendHistory(task);
    },
    onError: (_error, task) => {
      setStreaming(false);
      pushDebug(`Task error: ${String(_error?.message || _error)}`, "error");
      if (task) {
        setCurrentTask(task);
        appendHistory(task);
      }
    },
  });

  const runAgent = async (input = taskInput, options = {}) => {
    if (!input.trim() || streaming || isRunningRef.current) return;
    isRunningRef.current = true;
    const selection = currentSelection(editorRef);
    const dryRun = !!options.dryRun;
    setShadowMode(dryRun);
    pushDebug(`${dryRun ? "Shadow run" : "Run"} requested: ${input.slice(0, 120)}`, "info");
    setTokenStats(prev => ({ ...prev, currentInput: 0, currentOutput: 0, tokensPerSecond: 0, estimatedCost: 0, rotationMessage: "" }));
    const runner = buildRunner();
    runnerRef.current = runner;
    try {
      await runner.run(input, {
        taskDescription: input,
        openFiles: openFiles || [],
        activeFile: activeFile || "",
        projectRoot: projectRoot || MOCK_ROOT,
        language: lang,
        selectedCode: selection,
        dryRun,
      });
    } catch (error) {
      if (String(error?.message || error) === "Task stopped") {
        pushDebug("Task stopped by user", "warn");
        setCurrentTask(prev => prev ? { ...prev, status: "stopped", completedAt: Date.now() } : prev);
        return;
      }
      pushDebug(`Unhandled task error: ${String(error?.message || error)}`, "error");
      setCurrentTask(prev => prev ? { ...prev, status: "error", error: String(error?.message || error), completedAt: Date.now() } : null);
    } finally {
      runnerRef.current = null;
      isRunningRef.current = false;
    }
  };

  const stopAgent = () => {
    runnerRef.current?.stop();
    pushDebug("Stop requested", "warn");
    setStreaming(false);
    setCurrentTask(prev => prev ? { ...prev, status: "stopped", completedAt: Date.now() } : prev);
  };

  const active = accStatus.accounts?.find(account => account.id === accStatus.activeId) || accStatus.active;
  const activeProvider = PROVIDERS[active?.provider] || {};
  const cloudReady = (accStatus.accounts || []).some(account => !PROVIDERS[account.provider]?.local && account.status === "active");
  const localReady = (accStatus.accounts || []).some(account => PROVIDERS[account.provider]?.local && account.status === "active");
  const offline = !cloudReady && localReady;
  const selection = currentSelection(editorRef);
  const taskDNA = useMemo(() => analyzeTaskDNA(taskInput, {
    activeFile,
    openFiles,
    language: lang,
    offlineReady: localReady,
    activeProviderLabel: active?.label,
    selectionLength: selection.length,
  }), [taskInput, activeFile, openFiles, lang, localReady, active?.label, selection.length]);
  const capsules = [
    activeFile ? { label: "File", value: activeFile.split(/[\\/]/).pop() } : null,
    { label: "Lang", value: lang },
    { label: "Open", value: `${openFiles?.length || 0} files` },
    { label: "Selection", value: selection ? `${selection.split(/\n/).length} lines` : "none" },
    { label: "Provider", value: active?.label || "none" },
    { label: "Mode", value: offline ? "offline" : "online" },
  ].filter(Boolean);

  return (
    <div className="wayai-tab">
      <div className="wayai-chats-bar">
        {chatSessions.map(s => (
          <button
            key={s.id}
            className={`wayai-chat-tab${s.id === (activeChatId || chatSessions[0]?.id) ? " active" : ""}${s.streaming ? " streaming" : ""}`}
            onClick={() => setActiveChatId(s.id)}
            title={s.name}
          >
            {s.streaming && <span className="wayai-chat-spin">⟳</span>}
            <span className="wayai-chat-tab-name">{s.name}</span>
            {chatSessions.length > 1 && (
              <span className="wayai-chat-close" onClick={e => { e.stopPropagation(); removeSession(s.id); }}>×</span>
            )}
          </button>
        ))}
        <button className="wayai-chat-new" onClick={addSession} title="New chat">＋</button>
      </div>
      <div className="wayai-header">
        <div className="wayai-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polygon points="12 2 22 12 12 22 2 12"/></svg>
          <span>Way AI</span>
        </div>
        <div className="wayai-header-actions">
          <select className="wayai-model-select" value={accStatus.activeId || ""} onChange={e => manager.setActive(e.target.value)}>
            {(Object.entries(accountOptions)).map(([providerLabel, accounts]) => (
              <optgroup key={providerLabel} label={providerLabel}>
                {accounts.map(account => {
                  const provider = PROVIDERS[account.provider] || {};
                  const status = provider.local ? "local" : account.status;
                  const price = provider.local ? "FREE" : `$${Number(provider.costPer1k || 0).toFixed(3)}/1K`;
                  return (
                    <option key={account.id} value={account.id}>
                      {(provider.local ? "○" : "●")} {account.label} — {account.model} — {price} {status !== "active" ? `— ${status}` : ""}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          <button className="icon-btn" title="Refresh task context" onClick={() => setCurrentTask(null)}>⚙</button>
        </div>
      </div>

      <div className="wayai-account-bar">
        <span className={`acc-pill ${activeProvider.local ? "local" : "cloud"}`}>{activeProvider.local ? "○" : "●"} {active?.label || "No account"}</span>
        <span className={`acc-pill ${tokenStats.rotationMessage ? "rotating" : "cloud"}`}>{tokenStats.rotationMessage ? "↻ rotating" : "↻ auto"}</span>
        <span className={`acc-pill ${offline ? "local" : "cloud"}`}>{offline ? "○ offline" : "● online"}</span>
        {!cloudReady && !localReady && <span className="acc-pill exhausted">⚠ exhausted</span>}
      </div>

      <div className="wayai-input-area">
        <textarea
          className="wayai-task-input"
          placeholder="Describe what you want Way AI to do…"
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
        />
        <div className="wayai-btn-row">
          <button className="btn-primary" disabled={streaming || isRunningRef.current || !taskInput.trim()} onClick={() => runAgent()}>{streaming ? "Running…" : "Run Agent"}</button>
          <button className={`btn-secondary ${shadowMode ? "on" : ""}`} disabled={streaming || isRunningRef.current || !taskInput.trim()} onClick={() => runAgent(taskInput, { dryRun: true })}>Shadow Run</button>
          <button className="btn-secondary" disabled={streaming} onClick={() => { const prompt = quickPrompt("fix", code, lang, currentSelection(editorRef)); setTaskInput(prompt); runAgent(prompt); }}>Quick Fix</button>
          <button className="btn-secondary" disabled={streaming} onClick={() => { const prompt = quickPrompt("explain", code, lang, currentSelection(editorRef)); setTaskInput(prompt); runAgent(prompt); }}>Explain</button>
          <button className="btn-secondary" disabled={!streaming} onClick={stopAgent}>Stop</button>
        </div>
        <div className="wayai-blueprints">
          <button className="wayai-blueprint" disabled={streaming} onClick={() => { const prompt = blueprintPrompt("pulse", { activeFile, selection, code, language: lang }); setTaskInput(prompt); runAgent(prompt); }}>
            <strong>Patch Pulse</strong>
            <span>smallest high-impact fix</span>
          </button>
          <button className="wayai-blueprint" disabled={streaming} onClick={() => { const prompt = blueprintPrompt("map", { activeFile, selection, code, language: lang }); setTaskInput(prompt); runAgent(prompt); }}>
            <strong>System Map</strong>
            <span>trace the controlling path</span>
          </button>
          <button className="wayai-blueprint" disabled={streaming} onClick={() => { const prompt = blueprintPrompt("risk", { activeFile, selection, code, language: lang }); setTaskInput(prompt); runAgent(prompt); }}>
            <strong>Risk Scan</strong>
            <span>surface breakpoints first</span>
          </button>
        </div>
      </div>

      <div className="wayai-intel">
        <div className="wayai-section-head"><span>TASK DNA</span><span className={`wayai-risk ${taskDNA.risk}`}>{taskDNA.risk} risk</span></div>
        <div className="wayai-dna-grid">
          <div className="wayai-dna-card">
            <span className="wayai-dna-k">Intent</span>
            <strong>{taskDNA.intent}</strong>
          </div>
          <div className="wayai-dna-card">
            <span className="wayai-dna-k">Scope</span>
            <strong>{taskDNA.scope}</strong>
          </div>
          <div className="wayai-dna-card">
            <span className="wayai-dna-k">Confidence</span>
            <strong>{taskDNA.confidence}%</strong>
          </div>
          <div className="wayai-dna-card">
            <span className="wayai-dna-k">Execution</span>
            <strong>{taskDNA.commandHeavy ? "tool + code" : "code-first"}</strong>
          </div>
        </div>
        <div className="wayai-confidence-rail">
          <div className="wayai-confidence-fill" style={{ width: `${taskDNA.confidence}%` }}/>
        </div>
        <div className="wayai-capsules">
          {capsules.map(capsule => <span key={`${capsule.label}:${capsule.value}`} className="wayai-capsule"><span>{capsule.label}</span><strong>{capsule.value}</strong></span>)}
        </div>
        <div className="wayai-tags">
          {taskDNA.tags.map(tag => <span key={tag} className="wayai-tag">{tag}</span>)}
        </div>
        {taskDNA.destructive && <div className="wayai-guard-banner">Guard rail active: destructive intent detected. Command execution will be blocked for dangerous operations.</div>}
      </div>

      <div className="wayai-current">
        <div className="wayai-section-head"><span>CURRENT TASK</span><span className="wayai-info">{currentTask?.dryRun ? "shadow" : currentTask?.status || "idle"}</span></div>
        {currentTask ? (
          <>
            <div className="wayai-forecast">
              <span>reads {currentTask.forecast?.reads || 0}</span>
              <span>writes {currentTask.forecast?.writes || 0}</span>
              <span>search {currentTask.forecast?.searches || 0}</span>
              <span>commands {currentTask.forecast?.commands || 0}</span>
              <span>ai {currentTask.forecast?.aiCalls || 0}</span>
            </div>
            <div className="wayai-steps">
              {currentTask.steps.map(step => {
                const icon = step.status === "done" ? "✓" : step.status === "error" ? "✕" : step.status === "running" ? "⟳" : step.status === "stopped" ? "■" : "○";
                return (
                  <div key={step.id} className={`wayai-step ${step.status}`}>
                    <span className="wayai-step-icon">{icon}</span>
                    <span className="wayai-step-label">{step.label}</span>
                    <span className="wayai-step-meta">{step.status === "running" ? "~~~" : `${Number(step.tokens || 0).toLocaleString()} tok`}</span>
                  </div>
                );
              })}
            </div>
            {!!currentTask.previews?.length && (
              <div className="wayai-shadow-preview">
                <div className="wayai-section-head"><span>IMPACT PREVIEW</span><span className="wayai-info">{currentTask.dryRun ? "simulated" : "executed"}</span></div>
                <div className="wayai-preview-list">
                  {currentTask.previews.map((preview, index) => (
                    <div key={`${preview.kind}_${index}`} className="wayai-preview-item">
                      <span className="wayai-preview-kind">{preview.kind}</span>
                      <div className="wayai-preview-main">
                        <strong>{preview.path || preview.command || "agent output"}</strong>
                        <span>{preview.summary}</span>
                      </div>
                      <span className={`wayai-preview-state ${preview.simulated ? "simulated" : "live"}`}>{preview.simulated ? "simulated" : "live"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <TokenTracker stats={tokenStats} accounts={accStatus.accounts || []} activeAccountId={accStatus.activeId} />
          </>
        ) : <div className="wayai-empty">No active task</div>}
      </div>

      <div className="wayai-debug">
        <div className="wayai-section-head">
          <span>DEBUG LOG</span>
          <button className="btn-tiny" onClick={() => setDebugLog([])} title="Clear debug log">Clear</button>
        </div>
        <div className="wayai-debug-list">
          {debugLog.length ? debugLog.map(entry => (
            <div key={entry.id} className={`wayai-debug-item ${entry.tone}`}>
              <span className="wayai-debug-time">{entry.at}</span>
              <span className="wayai-debug-msg">{entry.message}</span>
            </div>
          )) : <div className="wayai-empty">No debug events yet</div>}
        </div>
      </div>

      <TaskHistory
        history={history}
        onResume={(description) => { setTaskInput(description); runAgent(description); }}
        onClear={() => setHistory([])}
      />
    </div>
  );
}