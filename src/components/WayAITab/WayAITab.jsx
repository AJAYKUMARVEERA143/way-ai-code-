import { useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS } from "../../lib/AccountManager.js";
import { MOCK_ROOT, readFile, searchFiles, writeFile, runToolCommand } from "../../lib/fs.js";
import { AgentRunner } from "./AgentRunner.js";
import TokenTracker from "./TokenTracker.jsx";
import TaskHistory from "./TaskHistory.jsx";

const HISTORY_KEY = "wayai_task_history";

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

export default function WayAITab({ manager, accStatus, editorRef, code, lang, projectRoot, activeFile, openFiles }) {
  const [taskInput, setTaskInput] = useState("");
  const [currentTask, setCurrentTask] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [streaming, setStreaming] = useState(false);
  const [tokenStats, setTokenStats] = useState({
    currentInput: 0,
    currentOutput: 0,
    sessionInput: 0,
    sessionOutput: 0,
    tokensPerSecond: 0,
    estimatedCost: 0,
    sessionCost: 0,
    activeAccountId: accStatus.activeId,
    perAccount: {},
    rotationMessage: "",
  });
  const runnerRef = useRef(null);

  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => {
    setTokenStats(prev => ({ ...prev, activeAccountId: accStatus.activeId || prev.activeAccountId }));
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
      steps: (task.steps || []).map(step => ({
        id: step.id,
        label: step.label,
        status: step.status,
        tokens: step.tokens,
        input: step.input,
        output: step.output,
      })),
    };
    setHistory(prev => [safeTask, ...prev].slice(0, 50));
  };

  const buildRunner = () => new AgentRunner({
    manager,
    fsApi: { readFile, writeFile, searchFiles },
    terminalApi: { run: (root, command, timeoutSecs) => runToolCommand(root || projectRoot || MOCK_ROOT, command.split(" ")[0] || command, command.split(" ").slice(1), timeoutSecs) },
    onStep: (event) => {
      if (event.kind === "task_started") {
        setCurrentTask(event.task);
        setStreaming(true);
        return;
      }
      if (event.kind === "step_started" || event.kind === "step_completed") {
        setCurrentTask(event.task);
        return;
      }
      if (event.kind === "info") {
        setTokenStats(prev => ({ ...prev, rotationMessage: event.message }));
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
      if (task) {
        setCurrentTask(task);
        appendHistory(task);
      }
    },
  });

  const runAgent = async (input = taskInput) => {
    if (!input.trim() || streaming) return;
    const selection = currentSelection(editorRef);
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
      });
    } catch (error) {
      setCurrentTask(prev => prev ? { ...prev, status: "error", error: String(error?.message || error) } : null);
    }
  };

  const stopAgent = () => {
    runnerRef.current?.stop();
    setStreaming(false);
    setCurrentTask(prev => prev ? { ...prev, status: "stopped", completedAt: Date.now() } : prev);
  };

  const active = accStatus.accounts?.find(account => account.id === accStatus.activeId) || accStatus.active;
  const activeProvider = PROVIDERS[active?.provider] || {};
  const cloudReady = (accStatus.accounts || []).some(account => !PROVIDERS[account.provider]?.local && account.status === "active");
  const localReady = (accStatus.accounts || []).some(account => PROVIDERS[account.provider]?.local && account.status === "active");
  const offline = !cloudReady && localReady;

  return (
    <div className="wayai-tab">
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
          <button className="btn-primary" disabled={streaming || !taskInput.trim()} onClick={() => runAgent()}>{streaming ? "Running…" : "Run Agent"}</button>
          <button className="btn-secondary" disabled={streaming} onClick={() => { const prompt = quickPrompt("fix", code, lang, currentSelection(editorRef)); setTaskInput(prompt); runAgent(prompt); }}>Quick Fix</button>
          <button className="btn-secondary" disabled={streaming} onClick={() => { const prompt = quickPrompt("explain", code, lang, currentSelection(editorRef)); setTaskInput(prompt); runAgent(prompt); }}>Explain</button>
          <button className="btn-secondary" disabled={!streaming} onClick={stopAgent}>Stop</button>
        </div>
      </div>

      <div className="wayai-current">
        <div className="wayai-section-head"><span>CURRENT TASK</span><span className="wayai-info">{currentTask?.status || "idle"}</span></div>
        {currentTask ? (
          <>
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
            <TokenTracker stats={tokenStats} accounts={accStatus.accounts || []} activeAccountId={accStatus.activeId} />
          </>
        ) : <div className="wayai-empty">No active task</div>}
      </div>

      <TaskHistory
        history={history}
        onResume={(description) => { setTaskInput(description); runAgent(description); }}
        onClear={() => setHistory([])}
      />
    </div>
  );
}