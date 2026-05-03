import { useState, useEffect } from "react";
import { fmtDownloads, fmtRating, starsStr, getExtDetail } from "./ExtensionStore.js";

const TABS = ["DETAILS","FEATURES","CHANGELOG","EXTENSION PACK"];

function renderMarkdown(raw) {
  if (!raw) return '<p class="md-p" style="color:var(--t3)">No description available.</p>';
  const escHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = (text) => escHtml(text)
    .replace(/`([^`\n]+)`/g, '<code class="md-ic">$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1</a>');
  const lines = raw.split('\n');
  const out = [];
  let inCode = false, codeLines = [], listLines = [], listOrdered = false;
  const flushList = () => {
    if (!listLines.length) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag} class="md-list">${listLines.map(l=>`<li>${l}</li>`).join('')}</${tag}>`);
    listLines = [];
  };
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) { flushList(); inCode = true; codeLines = []; }
      else { out.push(`<pre class="md-code-block"><code>${escHtml(codeLines.join('\n'))}</code></pre>`); inCode = false; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!line.trim()) { flushList(); continue; }
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { flushList(); out.push(`<h${hm[1].length} class="md-h${hm[1].length}">${inline(hm[2])}</h${hm[1].length}>`); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushList(); out.push('<hr class="md-hr"/>'); continue; }
    if (/^[\s]*[-*+]\s+/.test(line)) { if (!listLines.length) listOrdered = false; listLines.push(inline(line.replace(/^[\s]*[-*+]\s+/, ''))); continue; }
    if (/^[\s]*\d+\.\s+/.test(line)) { if (!listLines.length) listOrdered = true; listLines.push(inline(line.replace(/^[\s]*\d+\.\s+/, ''))); continue; }
    if (line.startsWith('> ')) { flushList(); out.push(`<blockquote class="md-bq">${inline(line.slice(2))}</blockquote>`); continue; }
    flushList();
    out.push(`<p class="md-p">${inline(line)}</p>`);
  }
  flushList();
  return out.join('');
}

export default function ExtensionDetail({ ext: extProp, installed, onInstall, onUninstall, onClose }) {
  const [ext, setExt] = useState(extProp);
  const [tab,     setTab]     = useState("DETAILS");
  const [readme,  setReadme]  = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!extProp) return;
    setTab("DETAILS");
    setExt(extProp);

    const loadContent = async (e) => {
      if (e.readme) {
        setLoading(true);
        try { setReadme(await fetch(e.readme).then(r=>r.text())); }
        catch { setReadme(e.description || ""); }
        finally { setLoading(false); }
      } else if (e.id) {
        setLoading(true);
        try {
          const full = await getExtDetail(e.id);
          if (full) {
            setExt(full);
            if (full.readme) setReadme(await fetch(full.readme).then(r=>r.text()).catch(() => full.description || ""));
            else setReadme(full.description || e.description || "");
          } else { setReadme(e.description || ""); }
        } catch { setReadme(e.description || ""); }
        finally { setLoading(false); }
      } else {
        setReadme(e.description || "No description.");
      }
    };

    loadContent(extProp);
  }, [extProp?.id]);

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
            ? <img src={ext.icon} alt="" width={80} height={80} style={{borderRadius:8}}
                onError={e=>{e.target.style.display="none";if(e.target.nextSibling)e.target.nextSibling.style.display="flex";}}/>
            : null}
          <div className="exd-icon-fallback" style={{display:ext.icon?"none":"flex"}}>{(ext.name[0]||"?").toUpperCase()}</div>
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
              ? <button className="exd-btn-install" onClick={()=>onInstall?.(ext)}>Install</button>
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
              {loading
                ? <div style={{color:"var(--t3)",fontSize:12,padding:"20px 0"}}>Loading…</div>
                : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(readme) }} />
              }
            </div>
            <div className="exd-sidebar">
              {ext.categories?.length>0 && (
                <div className="exd-sb-section">
                  <div className="exd-sb-title">Categories</div>
                  {ext.categories.map(c=><div key={c} className="exd-sb-tag">{c}</div>)}
                </div>
              )}
              <div className="exd-sb-section">
                <div className="exd-sb-title">Installation</div>
                <div className="exd-sb-info" style={{fontSize:11,wordBreak:"break-all"}}>{ext.id}</div>
                <div className="exd-sb-info">v{ext.version}</div>
              </div>
              <div className="exd-sb-section">
                <div className="exd-sb-title">Resources</div>
                {ext.repository && <a href={ext.repository} target="_blank" rel="noreferrer" className="exd-sb-link">⎋ Repository</a>}
                {ext.license && <div className="exd-sb-link">⎋ License ({ext.license})</div>}
                <a href={`https://open-vsx.org/extension/${ext.namespace}/${ext.extName}`} target="_blank" rel="noreferrer" className="exd-sb-link">⎋ Open VSX</a>
              </div>
            </div>
          </div>
        )}
        {tab!=="DETAILS" && <div className="exd-placeholder">No {tab.toLowerCase()} available.</div>}
      </div>
    </div>
  );
}
