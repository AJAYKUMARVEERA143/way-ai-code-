import { fmtDownloads, starsStr, fmtRating } from "./ExtensionStore.js";

export default function ExtensionCard({ ext, installed, selected, onClick, onInstall, onUninstall, updateAvailable, onUpdate }) {
  return (
    <div
      className={`exc-card ${selected?"exc-selected":""}`}
      onClick={() => onClick?.(ext)}
    >
      {/* Icon */}
      <div className="exc-icon-wrap">
        {ext.icon
          ? <img src={ext.icon} alt="" width={40} height={40} className="exc-icon-img"
              onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
          : null}
        <div className="exc-icon-fallback" style={{display:ext.icon?"none":"flex"}}>
          {(ext.name[0]||"?").toUpperCase()}
        </div>
      </div>

      {/* Info */}
      <div className="exc-info">
        <div className="exc-name">{ext.name}</div>
        <div className="exc-desc">{ext.description}</div>
        <div className="exc-meta">
          <span className="exc-publisher">{ext.publisher}</span>
          {ext.downloads>0 && <span className="exc-dl">☁ {fmtDownloads(ext.downloads)}</span>}
          {ext.rating>0 && (
            <span className="exc-stars" title={`${fmtRating(ext.rating)}/5 (${ext.ratingCount})`}>
              {starsStr(ext.rating)}
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="exc-action" onClick={e=>e.stopPropagation()}>
        {installed ? (
          updateAvailable
            ? <button className="exc-btn-update" title="Update available" onClick={()=>onUpdate?.()}>↑</button>
            : <button className="exc-btn-gear" title="Settings">⚙</button>
        ) : (
          <button className="exc-btn-dl" title="Install" onClick={()=>onInstall?.(ext)}>↓</button>
        )}
      </div>
      {updateAvailable && <span className="exc-update-dot" title="Update available" />}
    </div>
  );
}
