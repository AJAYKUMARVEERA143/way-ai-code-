import { PROVIDERS } from "../../lib/AccountManager.js";

function fmt(value = 0) {
  return Number(value || 0).toLocaleString();
}

export default function TokenTracker({ stats, accounts, activeAccountId }) {
  const active = accounts.find(account => account.id === activeAccountId) || accounts.find(account => account.id === stats.activeAccountId) || null;
  const provider = PROVIDERS[active?.provider] || {};
  const isLocal = !!provider.local;
  const dot = stats.rotationMessage ? "↻" : (isLocal ? "○" : "●");
  const line = `${fmt(stats.currentInput)} ↑ · ${fmt(stats.currentOutput)} ↓`;
  const cost = isLocal ? "FREE" : `$${Number(stats.estimatedCost || 0).toFixed(4)}`;
  const tps = `${Number(stats.tokensPerSecond || 0).toFixed(stats.tokensPerSecond >= 10 ? 0 : 1)} tok/s`;

  return (
    <div className="wayai-token-bar" title={stats.rotationMessage || "Token usage"}>
      <div className={`wayai-token-line ${isLocal ? "local" : "cloud"}`}>
        <span className="wayai-token-dot">{dot}</span>
        <span className="wayai-token-name">{active?.label || "No active account"}</span>
        <span className="wayai-token-main">{line}</span>
        <span className="wayai-token-cost">{cost}</span>
        <span className="wayai-token-rate">{tps}</span>
      </div>
      <div className="wayai-token-sub">
        Session: {fmt(stats.sessionInput)} in · {fmt(stats.sessionOutput)} out · ${Number(stats.sessionCost || 0).toFixed(4)}
      </div>
      {!!Object.keys(stats.perAccount || {}).length && (
        <div className="wayai-token-breakdown">
          {Object.entries(stats.perAccount).map(([accountId, entry]) => {
            const account = accounts.find(item => item.id === accountId);
            const accProvider = PROVIDERS[account?.provider] || {};
            return (
              <span key={accountId} className="wayai-break-item">
                {accProvider.local ? "○" : "●"} {account?.label || accountId} {fmt(entry.input + entry.output)} tok
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}