import { PROVIDERS } from "../../lib/AccountManager.js";

function fmt(value = 0) {
  return Number(value || 0).toLocaleString();
}

// Soft budget per session — warn at 80%, colour at 100%
const SESSION_BUDGET = 120_000;

function usagePct(tokensUsed) {
  return Math.min(100, Math.round((tokensUsed / SESSION_BUDGET) * 100));
}

const EMPTY_STATS = {
  currentInput: 0, currentOutput: 0,
  sessionInput: 0, sessionOutput: 0,
  tokensPerSecond: 0, estimatedCost: 0,
  sessionCost: 0, activeAccountId: null,
  perAccount: {}, rotationMessage: "",
};

export default function TokenTracker({ stats, accounts, activeAccountId }) {
  const s = stats || EMPTY_STATS;
  const active = (accounts || []).find(a => a.id === activeAccountId) || (accounts || []).find(a => a.id === s.activeAccountId) || null;
  const provider = PROVIDERS[active?.provider] || {};
  const isLocal = !!provider.local;
  const dot = s.rotationMessage ? "↻" : (isLocal ? "○" : "●");
  const cost = isLocal ? "FREE" : `$${Number(s.estimatedCost || 0).toFixed(4)}`;
  const tps = `${Number(s.tokensPerSecond || 0).toFixed(s.tokensPerSecond >= 10 ? 0 : 1)} tok/s`;

  // Per-account usage for the breakdown
  const perAccountEntries = Object.entries(s.perAccount || {});
  const sessionTotal = (s.sessionInput || 0) + (s.sessionOutput || 0);
  const pct = usagePct(sessionTotal);
  const nearLimit = pct >= 80;
  const atLimit = pct >= 100;

  return (
    <div className="wayai-token-bar" title={s.rotationMessage || "Token usage"}>
      {s.rotationMessage && (
        <div className="wayai-switch-banner">
          <span className="wayai-switch-icon">↻</span>
          {s.rotationMessage}
        </div>
      )}

      <div className={`wayai-token-line ${isLocal ? "local" : "cloud"}`}>
        <span className="wayai-token-dot">{dot}</span>
        <span className="wayai-token-name">{active?.label || "No active account"}</span>
        <span className="wayai-token-main">{fmt(s.currentInput)} ↑ · {fmt(s.currentOutput)} ↓</span>
        <span className="wayai-token-cost">{cost}</span>
        <span className="wayai-token-rate">{tps}</span>
      </div>

      {/* Session budget progress bar */}
      <div className="wayai-budget-rail" title={`Session: ${fmt(sessionTotal)} / ${fmt(SESSION_BUDGET)} tokens`}>
        <div
          className={`wayai-budget-fill${atLimit ? " limit" : nearLimit ? " warn" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="wayai-token-sub">
        Session: {fmt(s.sessionInput)} in · {fmt(s.sessionOutput)} out
        {" · "}${Number(s.sessionCost || 0).toFixed(4)}
        {nearLimit && !atLimit && <span className="wayai-budget-warn"> · ⚠ {100 - pct}% left — next account ready</span>}
        {atLimit && <span className="wayai-budget-limit"> · ⛔ limit reached — auto-switching</span>}
      </div>

      {/* Per-account token breakdown */}
      {!!perAccountEntries.length && (
        <div className="wayai-account-breakdown">
          {perAccountEntries.map(([accountId, entry]) => {
            const acc = (accounts || []).find(a => a.id === accountId);
            const accProv = PROVIDERS[acc?.provider] || {};
            const total = (entry.input || 0) + (entry.output || 0);
            const accPct = usagePct(total);
            return (
              <div key={accountId} className="wayai-acc-row">
                <span className="wayai-acc-dot">{accProv.local ? "○" : "●"}</span>
                <span className="wayai-acc-label">{acc?.label || accountId}</span>
                <div className="wayai-acc-rail">
                  <div
                    className={`wayai-acc-fill${accPct >= 100 ? " limit" : accPct >= 80 ? " warn" : ""}`}
                    style={{ width: `${accPct}%` }}
                  />
                </div>
                <span className="wayai-acc-tokens">{fmt(total)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}