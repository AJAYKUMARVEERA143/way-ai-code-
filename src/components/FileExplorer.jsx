/**
 * Way AI Code — FileExplorer.jsx
 * Way AI Code — file explorer — fixed path handling
 * Auto-opens /way-ai-code (the actual project root)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  IS_TAURI, readDir, readFile, createFile, deleteEntry,
  renamePath, createDir, getHomeDir, searchFiles, openFolderDialog,
  formatSize, pathJoin, pathDir, pathName, pathExt,
  langFromPath, langColor, MOCK_ROOT,
} from "../lib/fs.js";

const WORKSPACE_STORAGE_KEY = "wayai_workspace_root_v1";

function loadWorkspaceRoot() {
  try { return localStorage.getItem(WORKSPACE_STORAGE_KEY) || ""; } catch { return ""; }
}

function saveWorkspaceRoot(path) {
  try { localStorage.setItem(WORKSPACE_STORAGE_KEY, path); } catch {}
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const FolOpen = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const FolCls  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const FileIc  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
const ChevR   = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>;
const ChevD   = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>;
const RefIc   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const NewFIc  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/></svg>;
const NewDIc  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>;
const ColIc   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/></svg>;
const SrchIc  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const OpnFIc  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;

// ── Context menu ──────────────────────────────────────────────────────────────
function CtxMenu({ x, y, entry, onClose, onAction }) {
  const ref = useRef(null);
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);

  const items = [
    { label:"New File",   key:"newfile",  icon:"+" },
    { label:"New Folder", key:"newfolder",icon:"+" },
    null,
    { label:"Rename",     key:"rename",   icon:"✎" },
    { label:"Delete",     key:"delete",   icon:"×", danger:true },
    null,
    { label:"Copy Path",  key:"copypath", icon:"⎘" },
    { label:"Copy Name",  key:"copyname", icon:"⎘" },
  ];

  return (
    <div ref={ref} className="ctx-menu" style={{ left:x, top:y }} onContextMenu={e=>e.preventDefault()}>
      {items.map((it,i) => it === null
        ? <div key={i} className="ctx-sep"/>
        : <button key={it.key} className={`ctx-item ${it.danger?"danger":""}`} onClick={()=>{onAction(it.key,entry);onClose();}}>
            <span className="ctx-icon">{it.icon}</span>{it.label}
          </button>
      )}
    </div>
  );
}

// ── Inline input ──────────────────────────────────────────────────────────────
function InlineInput({ defaultValue="", placeholder="", onConfirm, onCancel }) {
  const [val, setVal] = useState(defaultValue);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="inline-input" value={val} placeholder={placeholder}
      onChange={e=>setVal(e.target.value)}
      onKeyDown={e=>{
        if (e.key==="Enter"&&val.trim()) { e.preventDefault(); onConfirm(val.trim()); }
        if (e.key==="Escape") { e.preventDefault(); onCancel(); }
      }}
      onBlur={()=>{ if(val.trim()) onConfirm(val.trim()); else onCancel(); }}
    />
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────
function TreeNode({ entry, depth, active, expanded, loading, onSelect, onToggle, onCtxMenu, onRename, renaming, creating, onCreateConfirm, onCreateCancel }) {
  const pad = 6 + depth * 16;
  const ext  = pathExt(entry.path);
  const dotColor = entry.is_dir ? "#dcb67a" : langColor(ext);

  return (
    <div>
      <div
        className={`fe-row ${active ? "fe-active" : ""}`}
        style={{ paddingLeft: pad }}
        onClick={() => entry.is_dir ? onToggle(entry.path) : onSelect(entry)}
        onContextMenu={e => { e.preventDefault(); onCtxMenu(e, entry); }}
        title={entry.path}
      >
        <span className="fe-chev">
          {entry.is_dir ? (expanded ? <ChevD/> : <ChevR/>) : null}
        </span>
        <span className="fe-icon" style={{ color: dotColor }}>
          {entry.is_dir ? (expanded ? <FolOpen/> : <FolCls/>) : <FileIc/>}
        </span>
        {renaming
          ? <InlineInput defaultValue={entry.name} onConfirm={n=>onRename(entry,n)} onCancel={()=>onRename(null,null)}/>
          : <span className="fe-name">{entry.name}</span>
        }
        {!entry.is_dir && entry.size > 0 && <span className="fe-size">{formatSize(entry.size)}</span>}
      </div>

      {/* Children */}
      {entry.is_dir && expanded && (
        <div>
          {/* Inline create inside this dir */}
          {creating?.parentPath === entry.path && (
            <div className="fe-row" style={{ paddingLeft: pad + 16 }}>
              <span className="fe-chev"/>
              <span className="fe-icon">{creating.type==="file" ? <FileIc/> : <FolCls/>}</span>
              <InlineInput
                placeholder={creating.type==="file" ? "filename.js" : "folder-name"}
                onConfirm={onCreateConfirm}
                onCancel={onCreateCancel}
              />
            </div>
          )}
          {loading
            ? <div className="fe-loading" style={{ paddingLeft: pad+20 }}>loading…</div>
            : null}
        </div>
      )}
    </div>
  );
}

// ── Main FileExplorer ─────────────────────────────────────────────────────────
export default function FileExplorer({ onOpenFile, activeFile, onRootChange }) {
  const [rootPath, setRootPath]   = useState(null);
  const [rootName, setRootName]   = useState("(no folder)");
  const [tree,    setTree]        = useState({});      // path → FileEntry[]
  const [expanded,setExpanded]    = useState({});      // path → bool
  const [loading, setLoading]     = useState({});      // path → bool
  const [ctxMenu, setCtxMenu]     = useState(null);
  const [renaming,setRenaming]    = useState(null);    // path
  const [creating,setCreating]    = useState(null);    // {parentPath, type}
  const [searchQ, setSearchQ]     = useState("");
  const [searchRes,setSearchRes]  = useState(null);
  const [searchLoading,setSL]     = useState(false);
  const [error,   setError]       = useState(null);

  // Load a directory
  const loadDir = useCallback(async (path) => {
    setLoading(l => ({ ...l, [path]: true }));
    try {
      const entries = await readDir(path, false);
      setTree(t => ({ ...t, [path]: entries }));
      setError(null);
      return true;
    } catch(e) {
      setError(String(e));
      return false;
    } finally {
      setLoading(l => ({ ...l, [path]: false }));
    }
  }, []);

  // Open a folder (from dialog or given path)
  const openFolder = useCallback(async (path, options = {}) => {
    const { persist = true } = options;
    const target = path || await openFolderDialog();
    if (!target) return false;
    setRootPath(target);
    setRootName(pathName(target) || target);
    onRootChange?.(target);
    setTree({}); setExpanded({ [target]: true });
    setSearchRes(null); setSearchQ("");
    const opened = await loadDir(target);
    if (opened && persist) saveWorkspaceRoot(target);
    return opened;
  }, [loadDir, onRootChange]);

  // On mount: restore the last workspace, then fall back to a safe platform root.
  useEffect(() => {
    let cancelled = false;
    const openInitialWorkspace = async () => {
      const savedRoot = loadWorkspaceRoot();
      if (savedRoot && !cancelled && await openFolder(savedRoot, { persist:false })) return;
      const fallbackRoot = IS_TAURI ? await getHomeDir().catch(() => MOCK_ROOT) : MOCK_ROOT;
      if (!cancelled) await openFolder(fallbackRoot, { persist:false });
    };
    openInitialWorkspace();
    return () => { cancelled = true; };
  }, [openFolder]);

  // Toggle folder open/close
  const toggleDir = useCallback(async (path) => {
    const isOpen = !!expanded[path];
    if (!isOpen && !tree[path]) await loadDir(path);
    setExpanded(e => ({ ...e, [path]: !isOpen }));
  }, [expanded, tree, loadDir]);

  // Open a file in editor
  const handleSelect = useCallback(async (entry) => {
    try {
      const content = await readFile(entry.path);
      onOpenFile({
        name:    entry.name,
        path:    entry.path,
        lang:    langFromPath(entry.path),
        content,
      });
    } catch(e) {
      setError(String(e));
    }
  }, [onOpenFile]);

  // Context menu actions
  const handleCtxAction = useCallback(async (action, entry) => {
    const parentPath = entry.is_dir ? entry.path : pathDir(entry.path);
    switch(action) {
      case "newfile":
        if (!tree[parentPath]) await loadDir(parentPath);
        setExpanded(e => ({ ...e, [parentPath]: true }));
        setCreating({ parentPath, type:"file" });
        break;
      case "newfolder":
        if (!tree[parentPath]) await loadDir(parentPath);
        setExpanded(e => ({ ...e, [parentPath]: true }));
        setCreating({ parentPath, type:"dir" });
        break;
      case "rename":
        setRenaming(entry.path);
        break;
      case "delete":
        if (confirm(`Delete "${entry.name}"?`)) {
          await deleteEntry(entry.path);
          await loadDir(pathDir(entry.path));
        }
        break;
      case "copypath":
        navigator.clipboard?.writeText(entry.path);
        break;
      case "copyname":
        navigator.clipboard?.writeText(entry.name);
        break;
    }
  }, [tree, loadDir]);

  // Rename confirm
  const handleRename = useCallback(async (entry, newName) => {
    setRenaming(null);
    if (!entry || !newName || newName === entry.name) return;
    const newPath = pathJoin(pathDir(entry.path), newName);
    try {
      await renamePath(entry.path, newPath);
      await loadDir(pathDir(entry.path));
    } catch(e) { setError(String(e)); }
  }, [loadDir]);

  // Create confirm
  const handleCreate = useCallback(async (name) => {
    if (!creating || !name) { setCreating(null); return; }
    const newPath = pathJoin(creating.parentPath, name);
    try {
      if (creating.type === "file") {
        await createFile(newPath);
        await loadDir(creating.parentPath);
        onOpenFile({ name, path: newPath, lang: langFromPath(newPath), content: "" });
      } else {
        await createDir(newPath);
        await loadDir(creating.parentPath);
        setExpanded(e => ({ ...e, [newPath]: false }));
      }
    } catch(e) { setError(String(e)); }
    setCreating(null);
  }, [creating, loadDir, onOpenFile]);

  // Search
  const handleSearch = useCallback(async (q) => {
    setSearchQ(q);
    if (!q.trim() || !rootPath) { setSearchRes(null); return; }
    setSL(true);
    try {
      const results = await searchFiles(rootPath, q.trim(), 60);
      setSearchRes(results);
    } finally { setSL(false); }
  }, [rootPath]);

  const refresh = useCallback(async () => {
    if (!rootPath) return;
    setTree({});
    await loadDir(rootPath);
  }, [rootPath, loadDir]);

  const collapseAll = useCallback(() => {
    setExpanded(rootPath ? { [rootPath]: true } : {});
  }, [rootPath]);

  // Recursive renderer
  const renderEntries = (entries, depth = 0) => {
    return entries.map(entry => {
      const key  = entry.path;
      const isExpanded = !!expanded[key];
      const children   = isExpanded ? (tree[key] || []) : [];

      return (
        <div key={key}>
          <TreeNode
            entry={entry}
            depth={depth}
            active={activeFile === entry.path}
            expanded={isExpanded}
            loading={loading[key]}
            renaming={renaming === entry.path}
            creating={creating}
            onSelect={handleSelect}
            onToggle={toggleDir}
            onCtxMenu={(e,en) => setCtxMenu({ x:e.clientX, y:e.clientY, entry:en })}
            onRename={handleRename}
            onCreateConfirm={handleCreate}
            onCreateCancel={() => setCreating(null)}
          />
          {isExpanded && children.length > 0 && renderEntries(children, depth+1)}
        </div>
      );
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="file-explorer">
      {/* Toolbar */}
      <div className="fe-toolbar">
        <span className="fe-root-name" title={rootPath||""}>{rootName}</span>
        <div className="fe-toolbar-btns">
          <button className="fe-tbtn" title="New File"     onClick={()=>rootPath&&setCreating({parentPath:rootPath,type:"file"})}><NewFIc/></button>
          <button className="fe-tbtn" title="New Folder"   onClick={()=>rootPath&&setCreating({parentPath:rootPath,type:"dir"})}><NewDIc/></button>
          <button className="fe-tbtn" title="Refresh"      onClick={refresh}><RefIc/></button>
          <button className="fe-tbtn" title="Collapse All" onClick={collapseAll}><ColIc/></button>
          <button className="fe-tbtn" title="Open Folder"  onClick={()=>openFolder()}><OpnFIc/></button>
        </div>
      </div>

      {/* Search */}
      <div className="fe-search-bar">
        <span className="fe-search-icon"><SrchIc/></span>
        <input className="fe-search-inp" placeholder="Search files…" value={searchQ}
          onChange={e=>handleSearch(e.target.value)}/>
        {searchQ && <button className="fe-search-clear" onClick={()=>{setSearchQ("");setSearchRes(null);}}>×</button>}
      </div>

      {/* Error */}
      {error && <div className="fe-error">{error}<button onClick={()=>setError(null)}>×</button></div>}

      {/* Tree */}
      <div className="fe-tree">
        {!rootPath ? (
          <div className="fe-empty">
            <button className="fe-open-btn" onClick={()=>openFolder()}>Open Folder</button>
            <div className="fe-empty-hint">or drop a folder here</div>
          </div>
        ) : searchRes !== null ? (
          <>
            {searchLoading
              ? <div className="fe-empty">Searching…</div>
              : <>
                  <div className="fe-search-count">{searchRes.length} results</div>
                  {searchRes.map(entry=>(
                    <div key={entry.path} className={`fe-row ${activeFile===entry.path?"fe-active":""}`}
                      style={{paddingLeft:8}} onClick={()=>!entry.is_dir&&handleSelect(entry)} title={entry.path}>
                      <span className="fe-icon" style={{color:langColor(pathExt(entry.path))}}><FileIc/></span>
                      <span className="fe-name">{entry.name}</span>
                      <span className="fe-size">{entry.path.replace(rootPath,"").replace(/^\/[^/]+\//,"…/")}</span>
                    </div>
                  ))}
                </>
            }
          </>
        ) : (
          <>
            {/* Root-level create input */}
            {creating?.parentPath === rootPath && (
              <div className="fe-row" style={{paddingLeft:8}}>
                <span className="fe-chev"/>
                <span className="fe-icon">{creating.type==="file"?<FileIc/>:<FolCls/>}</span>
                <InlineInput
                  placeholder={creating.type==="file"?"filename.js":"folder-name"}
                  onConfirm={handleCreate}
                  onCancel={()=>setCreating(null)}
                />
              </div>
            )}
            {tree[rootPath]
              ? renderEntries(tree[rootPath], 0)
              : <div className="fe-loading" style={{padding:"8px 12px"}}>Loading…</div>
            }
          </>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} entry={ctxMenu.entry}
          onClose={()=>setCtxMenu(null)} onAction={handleCtxAction}/>
      )}
    </div>
  );
}
