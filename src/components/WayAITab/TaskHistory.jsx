import { useState } from "react";

function timeAgo(ts) {
  if (!ts) return "just now";
  const delta = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

export default function TaskHistory({ history, onResume, onClear }) {
  const [openId, setOpenId] = useState(null);

  return (
    <div className="wayai-history">
      <div className="wayai-section-head">
        <span>HISTORY</span>
        <button className="btn-tiny" onClick={onClear} title="Clear history">Clear</button>
      </div>
      {history.length ? history.map(task => {
        const isOpen = openId === task.id;
        const icon = task.status === "done" ? "✓" : task.status === "error" ? "✕" : task.status === "stopped" ? "■" : "⟳";
        return (
          <div key={task.id} className="wayai-history-item">
            <button className="wayai-history-main" onClick={() => setOpenId(isOpen ? null : task.id)}>
              <span className={`wayai-history-icon ${task.status}`}>{icon}</span>
              <span className="wayai-history-title">{task.title}</span>
              <span className="wayai-history-meta">{timeAgo(task.completedAt || task.startedAt)} · {Number(task.totalTokens || 0).toLocaleString()} tok</span>
            </button>
            {isOpen && (
              <div className="wayai-history-detail">
                <div className="wayai-history-actions">
                  <button className="btn-secondary" onClick={() => onResume(task.description)}>Resume</button>
                  <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(task.description || "")}>Copy Prompt</button>
                </div>
                {(task.steps || []).map(step => (
                  <div key={step.id} className="wayai-history-step">
                    <span>{step.status === "done" ? "✓" : step.status === "error" ? "✕" : "○"}</span>
                    <div className="wayai-history-step-body">
                      <span className="wayai-history-step-label">{step.label}</span>
                      {step.input ? <span className="wayai-history-step-preview">In: {JSON.stringify(step.input)}</span> : null}
                      {step.output ? <span className="wayai-history-step-preview">Out: {step.output}</span> : null}
                    </div>
                    <span className="wayai-history-step-meta">{Number(step.tokens || 0).toLocaleString()} tok</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }) : <div className="wayai-empty">No agent runs yet</div>}
    </div>
  );
}