import { useState, useEffect } from "react";
import { fmtDownloads, fmtRating, starsStr, getExtDetail } from "./ExtensionStore.js";
import "./ExtensionPreviewTab.css";

const TABS = ["DETAILS", "FEATURES", "CHANGELOG", "EXTENSION PACK"];

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
  let inCode = false, codeLang = '', codeLines = [];
  let listLines = [], listOrdered = false;

  const flushList = () => {
    if (!listLines.length) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag} class="md-list">${listLines.map(l=>`<li>${l}</li>`).join('')}</${tag}>`);
    listLines = [];
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) { flushList(); inCode = true; codeLang = line.slice(3).trim(); codeLines = []; }
      else {
        out.push(`<pre class="md-code-block"><code>${escHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false;
      }
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

export default function ExtensionPreviewTab({ ext: extProp, installed, onInstall, onUninstall }) {
  const [ext, setExt] = useState(extProp);
  const [tab, setTab] = useState("DETAILS");
  const [readme, setReadme] = useState("");
  const [readmeLoad, setRLoad] = useState(false);
  const [changelogContent, setChangelogContent] = useState("");
  const [changelogLoad, setCLoad] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    if (!extProp) return;
    setTab("DETAILS");
    setExt(extProp);
    setChangelogContent("");

    const loadContent = async (e) => {
      if (e.readme) {
        setRLoad(true);
        try {
          const t = await fetch(e.readme).then(r => r.text());
          setReadme(t);
        } catch {
          setReadme(e.description || "");
        } finally { setRLoad(false); }
      } else if (e.id) {
        setRLoad(true);
        try {
          const full = await getExtDetail(e.id);
          if (full) {
            setExt(full);
            if (full.readme) {
              const t = await fetch(full.readme).then(r => r.text());
              setReadme(t);
            } else {
              setReadme(full.description || e.description || "");
            }
          } else {
            setReadme(e.description || "");
          }
        } catch {
          setReadme(e.description || "");
        } finally { setRLoad(false); }
      } else {
        setReadme(e.description || "");
      }
    };

    loadContent(extProp);
  }, [extProp?.id]);

  // Fetch changelog on demand when tab changes
  useEffect(() => {
    if (tab !== "CHANGELOG" || !ext?.changelog || changelogContent) return;
    setCLoad(true);
    fetch(ext.changelog).then(r => r.text()).then(setChangelogContent).catch(() => setChangelogContent("")).finally(() => setCLoad(false));
  }, [tab, ext?.changelog]);

  const handleInstall = async () => {
    if (installing || installed) return;
    setInstalling(true);
    await new Promise((r) => setTimeout(r, 700));
    onInstall?.(ext);
    setInstalling(false);
    setJustDone(true);
    setTimeout(() => setJustDone(false), 2500);
  };

  const handleUninstall = () => { onUninstall?.(ext.id); setJustDone(false); };

  if (!ext) {
    return (
      <div className="expt-empty">
        <div className="expt-empty-icon">◈</div>
        <div className="expt-empty-text">No extension selected</div>
      </div>
    );
  }

  const isInstalled = installed || justDone;

  return (
    <div className="expt-root">
      {/* ── Hero header ── */}
      <div className="expt-hero">
        <div className="expt-hero-bg" />
        <div className="expt-hero-content">
          <div className="expt-hero-icon">
            {ext.icon ? (
              <img src={ext.icon} alt={ext.name} width={80} height={80}
                style={{ borderRadius: 10, display: "block" }}
                onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }} />
            ) : null}
            <div className="expt-icon-fallback" style={{ display: ext.icon ? "none" : "flex" }}>
              {(ext.name?.[0] || "?").toUpperCase()}
            </div>
          </div>

          <div className="expt-hero-info">
            <div className="expt-hero-name">{ext.name}</div>
            <div className="expt-hero-pub-row">
              <span className="expt-hero-pub">
                <span className="expt-verified-icon">✓</span>
                {ext.publisher}
              </span>
              {ext.downloads > 0 && <span className="expt-hero-stat">☁ {fmtDownloads(ext.downloads)}</span>}
              {ext.rating > 0 && (
                <span className="expt-hero-stat expt-stars" title={`${fmtRating(ext.rating)}/5`}>
                  {starsStr(ext.rating)} <span className="expt-rating-n">({ext.ratingCount || 0})</span>
                </span>
              )}
              <span className="expt-hero-stat expt-version">v{ext.version}</span>
            </div>
            <div className="expt-hero-desc">{ext.description}</div>

            <div className="expt-hero-actions">
              {!isInstalled ? (
                <button className={`expt-install-btn${installing ? " installing" : ""}`} onClick={handleInstall} disabled={installing}>
                  <span className="expt-install-ring" />
                  <span className="expt-install-label">{installing ? "Installing…" : "Install"}</span>
                </button>
              ) : (
                <div className="expt-installed-row">
                  <div className="expt-installed-badge"><span className="expt-installed-check">✓</span> Installed</div>
                  <button className="expt-disable-btn">Disable</button>
                  <button className="expt-uninstall-btn" onClick={handleUninstall}>Uninstall</button>
                </div>
              )}
              <button className="expt-gear-btn" title="Extension Settings">⚙</button>
              {isInstalled && <label className="expt-autoupdate"><input type="checkbox" defaultChecked /> Auto Update</label>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="expt-tabbar">
        {TABS.map(t => (
          <button key={t} className={`expt-tab${tab === t ? " expt-tab-on" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="expt-body">
        {tab === "DETAILS" && (
          <div className="expt-details">
            {/* Left: README */}
            <div className="expt-readme-wrap">
              {readmeLoad
                ? <div className="expt-loading">Loading documentation…</div>
                : <div className="expt-readme" dangerouslySetInnerHTML={{ __html: renderMarkdown(readme) }} />
              }
            </div>

            {/* Right: Metadata sidebar */}
            <div className="expt-info-sidebar">
              {ext.categories?.length > 0 && (
                <div className="expt-info-section">
                  <div className="expt-info-title">Categories</div>
                  <div className="expt-info-tags">
                    {ext.categories.map(c => <span key={c} className="expt-info-tag">{c}</span>)}
                  </div>
                </div>
              )}

              <div className="expt-info-section">
                <div className="expt-info-title">Installation</div>
                <div className="expt-info-row"><span className="expt-info-key">Identifier</span><span className="expt-info-val expt-id-val">{ext.id}</span></div>
                <div className="expt-info-row"><span className="expt-info-key">Version</span><span className="expt-info-val">{ext.version}</span></div>
                <div className="expt-info-row"><span className="expt-info-key">Publisher</span><span className="expt-info-val">{ext.publisher}</span></div>
              </div>

              {ext.downloads > 0 && (
                <div className="expt-info-section">
                  <div className="expt-info-title">Marketplace</div>
                  <div className="expt-info-row"><span className="expt-info-key">Downloads</span><span className="expt-info-val">{fmtDownloads(ext.downloads)}</span></div>
                  {ext.rating > 0 && <div className="expt-info-row"><span className="expt-info-key">Rating</span><span className="expt-info-val">{fmtRating(ext.rating)}/5</span></div>}
                </div>
              )}

              <div className="expt-info-section">
                <div className="expt-info-title">Resources</div>
                {ext.repository && <a href={ext.repository} target="_blank" rel="noreferrer" className="expt-info-link">⎋ Repository</a>}
                {ext.license && <div className="expt-info-link">⎋ License ({ext.license})</div>}
                <a href={`https://open-vsx.org/extension/${ext.namespace}/${ext.extName}`} target="_blank" rel="noreferrer" className="expt-info-link">⎋ Open VSX</a>
              </div>
            </div>
          </div>
        )}

        {tab === "FEATURES" && (
          <div className="expt-features">
            {ext.tags?.length > 0 && (
              <div className="expt-feat-section">
                <div className="expt-feat-title">Tags & Keywords</div>
                <div className="expt-feat-tags">
                  {ext.tags.map(t => <span key={t} className="expt-feat-tag">{t}</span>)}
                </div>
              </div>
            )}
            {ext.categories?.length > 0 && (
              <div className="expt-feat-section">
                <div className="expt-feat-title">Categories</div>
                <div className="expt-feat-tags">
                  {ext.categories.map(c => <span key={c} className="expt-feat-tag expt-feat-tag-cat">{c}</span>)}
                </div>
              </div>
            )}
            <div className="expt-feat-section">
              <div className="expt-feat-title">Marketplace</div>
              <div className="expt-feat-stat-grid">
                <div className="expt-feat-stat"><span className="expt-feat-stat-n">{fmtDownloads(ext.downloads)}</span><span className="expt-feat-stat-l">Downloads</span></div>
                <div className="expt-feat-stat"><span className="expt-feat-stat-n">{fmtRating(ext.rating)}/5</span><span className="expt-feat-stat-l">Rating</span></div>
                <div className="expt-feat-stat"><span className="expt-feat-stat-n">v{ext.version}</span><span className="expt-feat-stat-l">Version</span></div>
                <div className="expt-feat-stat"><span className="expt-feat-stat-n">{ext.ratingCount || 0}</span><span className="expt-feat-stat-l">Reviews</span></div>
              </div>
            </div>
            <div className="expt-feat-section">
              <div className="expt-feat-title">Resources</div>
              {ext.repository && <a href={ext.repository} target="_blank" rel="noreferrer" className="expt-info-link">⎋ Repository</a>}
              {ext.license && <div className="expt-info-link">⎋ License: {ext.license}</div>}
              <a href={`https://open-vsx.org/extension/${ext.namespace}/${ext.extName}`} target="_blank" rel="noreferrer" className="expt-info-link">⎋ Open VSX Marketplace</a>
            </div>
          </div>
        )}

        {tab === "CHANGELOG" && (
          <div className="expt-readme-wrap">
            {changelogLoad ? (
              <div className="expt-loading">Loading changelog…</div>
            ) : changelogContent ? (
              <div className="expt-readme" dangerouslySetInnerHTML={{ __html: renderMarkdown(changelogContent) }} />
            ) : (
              <div className="expt-placeholder">
                <div className="expt-placeholder-icon">📋</div>
                <div>No changelog available for {ext.name}</div>
                {ext.repository && <a href={ext.repository + "/releases"} target="_blank" rel="noreferrer" className="expt-info-link" style={{marginTop:4}}>View Releases ↗</a>}
                <div className="expt-placeholder-sub">Check the repository for release notes</div>
              </div>
            )}
          </div>
        )}

        {tab === "EXTENSION PACK" && (
          <div className="expt-features">
            <div className="expt-feat-section">
              <div className="expt-feat-title">Pack Information</div>
              {ext.tags?.includes("pack") ? (
                <>
                  <div style={{fontSize:13,color:"var(--t2)",marginBottom:10}}>{ext.name} is an extension pack.</div>
                  <a href={`https://open-vsx.org/extension/${ext.namespace}/${ext.extName}`} target="_blank" rel="noreferrer" className="expt-info-link">View included extensions on Open VSX ↗</a>
                </>
              ) : (
                <div style={{fontSize:13,color:"var(--t3)"}}>{ext.name} is not an extension pack.</div>
              )}
            </div>
            <div className="expt-feat-section">
              <div className="expt-feat-title">Publisher</div>
              <div style={{fontSize:13,color:"var(--t2)"}}>{ext.publisher}</div>
              {ext.repository && <a href={ext.repository} target="_blank" rel="noreferrer" className="expt-info-link" style={{marginTop:4}}>⎋ Publisher Repository</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
