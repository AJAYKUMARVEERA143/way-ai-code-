import { useState, useEffect, useRef, useCallback } from "react";
import ExtensionCard from "./ExtensionCard.jsx";
import ExtensionDetail from "./ExtensionDetail.jsx";
import {
  searchExt, loadFeatured, getExtDetail,
  loadInstalled, addInstalled, removeInstalled,
  checkForUpdates, CATEGORIES,
} from "./ExtensionStore.js";
import "./ExtensionsPanel.css";

export default function ExtensionsPanel({ onOpenExtension }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState([]);
  const [featured, setFeatured] = useState([]);
  const [installed, setInst]   = useState(() => loadInstalled());
  const [selected,  setSel]    = useState(null);
  const [detail,    setDetail] = useState(null);
  const [loading,   setLoad]   = useState(false);
  const [error,     setError]  = useState(null);
  const [category,  setCat]    = useState("All");
  const [updates,   setUpdates] = useState({});   // { [id]: latestExt }
  const [checkingUpdates, setCheckingUp] = useState(false);
  const timer = useRef(null);

  // Load featured on mount
  useEffect(() => {
    setLoad(true);
    loadFeatured()
      .then(setFeatured)
      .catch(() => setError("Could not load extensions."))
      .finally(() => setLoad(false));
  }, []);

  // Keep sidebar in sync when extension install state changes from editor preview tabs
  useEffect(() => {
    const onInstalledChanged = () => setInst(loadInstalled());
    window.addEventListener("wayai-ext-installed-changed", onInstalledChanged);
    return () => window.removeEventListener("wayai-ext-installed-changed", onInstalledChanged);
  }, []);

  // Check for updates whenever installed list changes
  const doCheckUpdates = useCallback(async (list) => {
    if (!list?.length) return;
    setCheckingUp(true);
    try { setUpdates(await checkForUpdates(list)); }
    catch {}
    finally { setCheckingUp(false); }
  }, []);

  useEffect(() => { doCheckUpdates(installed); }, [installed, doCheckUpdates]);

  // Debounced search
  const doSearch = useCallback((q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoad(true);
      try { setResults(await searchExt(q, 20)); setError(null); }
      catch { setError("Search failed. Check connection."); }
      finally { setLoad(false); }
    }, 400);
  }, []);

  // Click → get detail
  const handleSelect = useCallback(async (ext) => {
    setSel(ext.id);
    const d = ext.readme ? ext : (await getExtDetail(ext.id).catch(() => ext)) || ext;
    setDetail(d);
  }, []);

  const handleInstall = useCallback((ext) => {
    setInst(p => {
      const next = addInstalled(ext, p);
      window.dispatchEvent(new Event("wayai-ext-installed-changed"));
      return next;
    });
  }, []);

  const handleUninstall = useCallback((id) => {
    setInst(p => {
      const next = removeInstalled(id, p);
      window.dispatchEvent(new Event("wayai-ext-installed-changed"));
      return next;
    });
  }, []);

  const handleUpdate = useCallback((latestExt) => {
    setInst(p => {
      const next = addInstalled(latestExt, p);
      window.dispatchEvent(new Event("wayai-ext-installed-changed"));
      return next;
    });
    setUpdates(u => { const n={...u}; delete n[latestExt.id]; return n; });
  }, []);

  const handleUpdateAll = useCallback(() => {
    Object.values(updates).forEach(latestExt => handleUpdate(latestExt));
  }, [updates, handleUpdate]);

  const updateCount = Object.keys(updates).length;
  const showSearch = query.trim().length > 0;
  const shown      = showSearch
    ? results
    : featured.filter(e => category === "All" || e.categories?.includes(category));
  const installedExts = installed.filter(e => e && e.id);

  const cardOf = (ext) => (
    <ExtensionCard
      key={ext.id}
      ext={ext}
      installed={installed.some(e => e.id === ext.id)}
      selected={selected === ext.id}
      onClick={handleSelect}
      onInstall={handleInstall}
      onUninstall={handleUninstall}
    />
  );

  const installedCardOf = (ext) => (
    <ExtensionCard
      key={ext.id}
      ext={ext}
      installed={installed.some(e => e.id === ext.id)}
      selected={selected === ext.id}
      onClick={(e) => {
        handleSelect(e);
        onOpenExtension?.(e);
      }}
      onInstall={handleInstall}
      onUninstall={handleUninstall}
      updateAvailable={!!updates[ext.id]}
      onUpdate={() => handleUpdate(updates[ext.id])}
    />
  );

  return (
    <div className="extp-root">

      {/* ── Left sidebar ── */}
      <div className="extp-sidebar">

        {/* Header */}
        <div className="extp-header">
          <span className="extp-title">EXTENSIONS</span>
          <div className="extp-hbtns">
            <button
              className="extp-hbtn"
              title="Refresh"
              onClick={() => { setLoad(true); loadFeatured().then(setFeatured).finally(() => setLoad(false)); }}
            >⟳</button>
            <button className="extp-hbtn" title="Filter">⋯</button>
          </div>
        </div>

        {/* Search box */}
        <div className="extp-search">
          <span className="extp-search-icon">🔍</span>
          <input
            className="extp-search-inp"
            placeholder="Search Extensions in Marketplace"
            value={query}
            onChange={e => doSearch(e.target.value)}
          />
          {query && <button className="extp-search-x" onClick={() => doSearch("")}>×</button>}
        </div>

        {/* Category pills — only in browse mode */}
        {!showSearch && (
          <div className="extp-cats">
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={`extp-cat ${category === c ? "extp-cat-on" : ""}`}
                onClick={() => setCat(c)}
              >{c}</button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="extp-list">
          {error && <div className="extp-error">{error}</div>}

          {showSearch ? (
            <>
              <div className="extp-sec-head">
                RESULTS {loading ? "(loading…)" : `(${results.length})`}
              </div>
              {shown.map(cardOf)}
              {!loading && results.length === 0 && (
                <div className="extp-empty">No results for "{query}"</div>
              )}
            </>
          ) : (
            <>
              {/* Installed */}
              {installedExts.length > 0 && (
                <details open>
                  <summary className="extp-sec-head">
                    INSTALLED ({installedExts.length})
                    {updateCount > 0 && (
                      <button
                        className="extp-update-all"
                        title={`Update all (${updateCount})`}
                        onClick={e => { e.preventDefault(); handleUpdateAll(); }}
                      >
                        ↑ {updateCount}
                      </button>
                    )}
                    {checkingUpdates && <span className="extp-checking"> ⟳</span>}
                  </summary>
                  {installedExts.map(installedCardOf)}
                </details>
              )}

              {/* Recommended */}
              <details open>
                <summary className="extp-sec-head">
                  RECOMMENDED {loading ? "(loading…)" : `(${shown.filter(e => !installed.includes(e.id)).length})`}
                </summary>
                {shown.filter(e => !installed.includes(e.id)).map(cardOf)}
              </details>

              {/* MCP Servers */}
              <details>
                <summary className="extp-sec-head">MCP SERVERS</summary>
                <div className="extp-mcp">
                  <div className="extp-mcp-icon">⬡</div>
                  <div className="extp-mcp-title">MCP Servers</div>
                  <div className="extp-mcp-desc">
                    Browse and install Model Context Protocol servers to extend Way AI agent mode
                    with tools for databases, APIs, and more.
                  </div>
                  <button className="extp-mcp-btn">Enable MCP Servers Marketplace</button>
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      {detail && (
        <div className="extp-detail">
          <ExtensionDetail
            ext={detail}
            installed={installed.some(e => e.id === detail.id)}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onClose={() => { setSel(null); setDetail(null); }}
          />
        </div>
      )}
    </div>
  );
}
