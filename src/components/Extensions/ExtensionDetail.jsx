import { useState, useEffect } from "react";
import { fmtDownloads, fmtRating, starsStr } from "./ExtensionStore.js";

const TABS = ["DETAILS","FEATURES","CHANGELOG","EXTENSION PACK"];

export default function ExtensionDetail({ ext, installed, onInstall, onUninstall, onClose }) {
  const [tab,     setTab]     = useState("DETAILS");
  const [readme,  setReadme]  = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ext) return;
    setTab("DETAILS");
    if (ext.readme) {
      setLoading(true);
      fetch(ext.readme).then(r=>r.text()).then(setReadme).catch(()=>setReadme(ext.description||"")).finally(()=>setLoading(false));
    } else {
      setReadme(ext.description || "No description.");
    }
  }, [ext?.id]);

  if (!ext) return (
    <div className="exd-empty">
      <div className="exd-empty-icon">⊞</div>
      <div>Select an extension to view details</div>
    </div>
  );

  return (
    <div className="exd-root">
      {/* Header */}
      <div className="exd-header">
        <div className="exd-icon">
          {ext.icon
            ? <img src={ext.icon} alt="" width={80} height={80} style={{borderRadius:6}}/>
            : <div className="exd-icon-fallback">{(ext.name[0]||"?").toUpperCase()}</div>}
        </div>
        <div className="exd-meta">
          <div className="exd-name">{ext.name}</div>
          <div className="exd-pub-row">
            <span className="exd-publisher"><span className="exd-verified">✓</span> {ext.publisher}</span>
            {ext.downloads>0 && <span className="exd-dl">☁ {fmtDownloads(ext.downloads)}</span>}
            {ext.rating>0 && <span className="exd-rating" title={`${fmtRating(ext.rating)}/5`}>{starsStr(ext.rating)} ({ext.ratingCount})</span>}
          </div>
          <div className="exd-desc">{ext.description}</div>
          <div className="exd-actions">
            {!installed
              ? <button className="exd-btn-install" onClick={()=>onInstall?.(ext.id)}>Install</button>
              : <>
                  <button className="exd-btn-secondary">Disable ▾</button>
                  <button className="exd-btn-secondary" onClick={()=>onUninstall?.(ext.id)}>Uninstall ▾</button>
                </>
            }
            <button className="exd-btn-gear">⚙</button>
            {installed && <label className="exd-autoupdate"><input type="checkbox" defaultChecked/> Auto Update</label>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="exd-tabs">
        {TABS.map(t=>(
          <button key={t} className={`exd-tab ${tab===t?"exd-tab-on":""}`} onClick={()=>setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div className="exd-content">
        {tab==="DETAILS" && (
          <div className="exd-body">
            <div className="exd-readme">
              {loading ? "Loading…" : <pre>{readme}</pre>}
            </div>
            <div className="exd-sidebar">
              {ext.categories?.length>0 && (
                <div className="exd-sb-section">
                  <div className="exd-sb-title">Categories</div>
                  {ext.categories.map(c=><div key={c} className="exd-sb-tag">{c}</div>)}
                </div>
              )}
              <div className="exd-sb-section">
                <div className="exd-sb-title">Resources</div>
                {ext.repository && <a href={ext.repository} target="_blank" rel="noreferrer" className="exd-sb-link">⎋ Repository</a>}
                {ext.license && <div className="exd-sb-link">⎋ License ({ext.license})</div>}
                <a href={`https://open-vsx.org/extension/${ext.namespace}/${ext.extName}`} target="_blank" rel="noreferrer" className="exd-sb-link">⎋ Open VSX</a>
              </div>
              <div className="exd-sb-section">
                <div className="exd-sb-title">More Info</div>
                <div className="exd-sb-info">Version: {ext.version}</div>
                <div className="exd-sb-info">Publisher: {ext.publisher}</div>
              </div>
            </div>
          </div>
        )}
        {tab!=="DETAILS" && <div className="exd-placeholder">No {tab.toLowerCase()} available.</div>}
      </div>
    </div>
  );
}
