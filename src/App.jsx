/**
 * Way AI Code — App.jsx
 * Way AI Code — main layout: ActivityBar + Sidebar + Editor Tabs + Terminal + Status Bar
 * All paths fixed to match actual project structure
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Editor from "@monaco-editor/react";
import { AccountManager, PROVIDERS, autoDetect } from "./lib/AccountManager.js";
import FileExplorer from "./components/FileExplorer.jsx";
import "./components/FileExplorer.css";
import TerminalPanel from "./components/Terminal.jsx";
import "./components/Terminal.css";
import WayAITab from "./components/WayAITab/WayAITab.jsx";
import "./components/WayAITab/WayAITab.css";
import {
  writeFile, langFromPath, langColor, pathExt, LANG_COLOR, MOCK_ROOT,
  detectTools, packageScripts, npmInstall, npmRunScript, pythonRunFile, gitClone,
  gitStatus, gitLog, gitStage, gitUnstage, gitCommit, gitPush, gitPull,
  gitPushWithToken, searchFiles, IS_TAURI,
} from "./lib/fs.js";
import { useDockPanel, FloatingPanel, DockPlaceholder, PanelHeader } from "./components/DockSystem.jsx";
import "./components/DockSystem.css";
import ExtensionsPanel from "./components/Extensions/ExtensionsPanel.jsx";
import ExtensionPreviewTab from "./components/Extensions/ExtensionPreviewTab.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./components/RightSidebar.css";

// ── Icons ─────────────────────────────────────────────────────────────────────
const Ic = {
  Files:   ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Search:  ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Git:     ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
  Ext:     ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>,
  Chat:    ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Accounts:()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  WayAI:   ()=>(
    <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M256 74L425 272H355L256 156L157 272H87L256 74Z"/>
      <path d="M87 272H152L256 378L360 272H425L256 446L87 272Z"/>
      <path d="M256 118L238 318L178 272L256 118Z" opacity=".55"/>
      <path d="M256 118L334 272L274 318L256 118Z" opacity=".55"/>
    </svg>
  ),
  Term:    ()=><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  X:       ()=><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Ref:     ()=><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Plus:    ()=><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Popout:  ()=><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>,
  Attach:  ()=><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>,
  Settings:()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

const LANG_DOT = LANG_COLOR;

// ── Git Panel ─────────────────────────────────────────────────────────────────
function GitPanel({ workspaceRoot, manager }) {
  const root = workspaceRoot || MOCK_ROOT;
  const [msg, setMsg]       = useState("");
  const [status, setStatus] = useState(null);
  const [commits,setCommits]= useState([]);
  const [busy, setBusy]     = useState(false);
  const [notice,setNotice]  = useState("");
  const [error, setError]   = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [nextStatus, nextLog] = await Promise.all([gitStatus(root), gitLog(root, 8)]);
      setStatus(nextStatus);
      setCommits(nextLog);
    } catch(e) {
      setStatus(null);
      setCommits([]);
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [root]);

  useEffect(() => { refresh(); }, [refresh]);

  const run = useCallback(async (label, fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(label);
      await refresh();
      setTimeout(()=>setNotice(""), 2500);
    } catch(e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const doCommit = () => run("Committed", async () => {
    await gitCommit(root, msg);
    setMsg("");
  });

  const doPush = async () => {
    run("Pushed", async () => {
      const token = await manager?.getGitHubToken?.();
      const ghUser = manager?.getGitHubUser?.();
      if (token && ghUser?.login) {
        await gitPushWithToken(root, ghUser.login, token);
      } else {
        await gitPush(root);
      }
    });
  };

  const fileRow = (file, staged = false) => (
    <div key={`${staged?"s":"u"}:${file.path}`} className="git-file-row" title={file.path}>
      <span className={`git-badge ${staged?"staged":"mod"}`}>{file.status}</span>
      <span>{file.path}</span>
      <button
        className="git-action"
        disabled={busy}
        title={staged ? "Unstage" : "Stage"}
        onClick={()=>run(staged ? "Unstaged" : "Staged", () => staged ? gitUnstage(root, file.path) : gitStage(root, file.path))}
      >
        {staged ? "-" : "+"}
      </button>
    </div>
  );

  const staged = status?.staged || [];
  const unstaged = [...(status?.unstaged || []), ...(status?.untracked || [])];

  return (
    <div className="panel-scroll">
      <div className="git-root" title={root}>
        <span>Branch: {status?.branch || "unknown"}</span>
        <button className="btn-tiny" onClick={refresh} disabled={busy}><Ic.Ref/></button>
      </div>
      <div className="git-area">
        <textarea className="git-msg" placeholder="Commit message (Ctrl+Enter)…" rows={3}
          value={msg} onChange={e=>setMsg(e.target.value)}
          onKeyDown={e=>{ if(e.ctrlKey&&e.key==="Enter"&&msg.trim()&&!busy) doCommit(); }}/>
        <div className="git-btns">
          <button className="btn-git-p" disabled={!msg.trim()||busy} onClick={doCommit}>✓ Commit</button>
          <button className="btn-git-s" disabled={busy} onClick={doPush}>↑ Push</button>
          <button className="btn-git-s" disabled={busy} onClick={()=>run("Pulled", () => gitPull(root))}>↓ Pull</button>
          <button className="btn-git-s" disabled={busy} onClick={refresh}>⟳ Refresh</button>
        </div>
        {notice&&<div className="git-ok">✓ {notice}</div>}
        {error&&<div className="git-error">{error}</div>}
      </div>
      <div className="git-section-hd">STAGED ({staged.length})</div>
      {staged.length ? staged.map(f=>fileRow(f, true)) : <div className="git-empty">No staged files</div>}
      <div className="git-section-hd">CHANGES ({unstaged.length})</div>
      {unstaged.length ? unstaged.map(f=>fileRow(f, false)) : <div className="git-empty">{status?.clean ? "Working tree clean" : "No unstaged files"}</div>}
      <div className="git-section-hd">RECENT COMMITS</div>
      {commits.length ? commits.map(c=>{
        const [hash, ...rest] = c.split(" ");
        return (
        <div key={c} className="git-commit-row">
          <span className="git-hash">{hash}</span>
          <span className="git-cmsg">{rest.join(" ")}</span>
        </div>
      );}) : <div className="git-empty">No commits to show</div>}
    </div>
  );
}

// ── Extensions Panel ──────────────────────────────────────────────────────────
const EXT_STORE_KEY = "wayai_extensions_v1";
const EXT_CATS = ["All","Languages","Formatters","Linters","Themes","AI","Tools"];
const EXTS = [
  {id:"python", name:"Python", desc:"Python syntax, snippets, run tasks, and interpreter hints", icon:"Py", category:"Languages", version:"1.4.0", latestVersion:"1.5.0", author:"Way", installed:true, enabled:true, tags:["python","django","flask"]},
  {id:"node", name:"Node.js", desc:"Package scripts, npm task discovery, and JS runtime helpers", icon:"JS", category:"Languages", version:"1.2.1", author:"Way", installed:true, enabled:true, tags:["node","npm","javascript"]},
  {id:"rust", name:"Rust Analyzer", desc:"Rust syntax, cargo tasks, and diagnostics integration", icon:"Rs", category:"Languages", version:"0.9.3", author:"Way", installed:false, enabled:false, tags:["rust","cargo","tauri"]},
  {id:"prettier", name:"Prettier", desc:"Format JavaScript, TypeScript, JSON, CSS, and Markdown", icon:"Pr", category:"Formatters", version:"3.2.0", latestVersion:"3.3.0", author:"Prettier", installed:true, enabled:true, tags:["format","javascript","css"]},
  {id:"eslint", name:"ESLint", desc:"JavaScript and TypeScript lint rules with quick fixes", icon:"Es", category:"Linters", version:"9.0.0", latestVersion:"9.1.0", author:"OpenJS", installed:true, enabled:true, tags:["lint","javascript","typescript"]},
  {id:"way-ai", name:"Way AI Tools", desc:"Inline edit, code suggestions, explain, tests, and refactor actions", icon:"AI", category:"AI", version:"1.0.0", author:"Way", installed:true, enabled:true, tags:["ai","autocomplete","diff"]},
  {id:"gpt-chat", name:"GPT Chat", desc:"OpenAI account routing, chat, inline edits, and completion prompts", icon:"GPT", category:"AI", version:"1.0.0", author:"Way", installed:true, enabled:true, tags:["openai","gpt","chatgpt"]},
  {id:"claude-chat", name:"Claude Chat", desc:"Anthropic Claude account routing, chat, and code edits", icon:"Cl", category:"AI", version:"1.0.0", author:"Way", installed:true, enabled:true, tags:["anthropic","claude"]},
  {id:"git-tools", name:"Git Tools", desc:"Source control view, branch status, stage, commit, push, and pull", icon:"Git", category:"Tools", version:"1.0.0", author:"Way", installed:true, enabled:true, tags:["git","source control"]},
  {id:"github", name:"GitHub Repositories", desc:"Connect GitHub, list repositories, clone, and push through Git", icon:"GH", category:"Tools", version:"0.8.0", author:"Way", installed:false, enabled:false, tags:["github","repo","clone"]},
  {id:"tailwind", name:"Tailwind CSS", desc:"Class name hints, color previews, and utility snippets", icon:"Tw", category:"Languages", version:"0.7.0", author:"Way", installed:false, enabled:false, tags:["tailwind","css"]},
  {id:"docker", name:"Docker", desc:"Dockerfile syntax, compose snippets, and container task shortcuts", icon:"Dk", category:"Tools", version:"0.5.1", author:"Way", installed:false, enabled:false, tags:["docker","compose"]},
  {id:"theme-quiet", name:"Quiet Dark Theme", desc:"Low-contrast professional dark theme for long coding sessions", icon:"Th", category:"Themes", version:"1.0.0", author:"Way", installed:false, enabled:false, tags:["theme","dark"]},
];

function loadExtState() {
  try { return JSON.parse(localStorage.getItem(EXT_STORE_KEY) || "{}"); } catch { return {}; }
}

function persistExtState(state) {
  try { localStorage.setItem(EXT_STORE_KEY, JSON.stringify(state)); } catch {}
}

function isExtensionEnabled(id) {
  const base = EXTS.find(e=>e.id===id);
  const state = loadExtState()[id] || {};
  return (state.installed ?? base?.installed) && (state.enabled ?? base?.enabled);
}

function formatToolOutput(out) {
  if (!out) return "";
  const parts = [];
  if (out.stdout) parts.push(out.stdout);
  if (out.stderr) parts.push(out.stderr);
  return parts.join("\n").trim() || `Exit code ${out.code}`;
}

function ExtPanel({ workspaceRoot, activeFile, onOpenSide, onOutput, manager, onDetach, onOpenExtension }) {
  return <ExtensionsPanel onOpenExtension={onOpenExtension} />;
}
function _ExtPanelOld({ workspaceRoot, activeFile, onOpenSide, onOutput, manager, onDetach }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [tab, setTab] = useState("extensions");
  const [selectedId, setSelectedId] = useState(null);
  const [state, setState] = useState(loadExtState);
  const [tools, setTools] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [githubToken, setGithubToken] = useState("");
  useEffect(() => {
    manager.getGitHubToken?.()
      .then(k => { if (k) setGithubToken(k); })
      .catch(() => {});
  }, [manager]);
  const [githubRepos, setGithubRepos] = useState([]);
  const [cloneTarget, setCloneTarget] = useState(workspaceRoot || MOCK_ROOT);

  useEffect(()=>persistExtState(state), [state]);
  useEffect(()=>setCloneTarget(workspaceRoot || MOCK_ROOT), [workspaceRoot]);

  const refreshTools = useCallback(async () => {
    setError("");
    try {
      const [nextTools, nextScripts] = await Promise.all([
        detectTools(),
        packageScripts(workspaceRoot || MOCK_ROOT),
      ]);
      setTools(nextTools || []);
      setScripts(nextScripts || []);
    } catch(e) {
      setError(String(e?.message || e));
    }
  }, [workspaceRoot]);

  useEffect(()=>{ refreshTools(); }, [refreshTools]);

  const merged = EXTS.map(ext => ({ ...ext, ...(state[ext.id] || {}) }));
  const hasUpdate = (e) => e.latestVersion && e.latestVersion !== e.version && e.installed;
  const updatable = merged.filter(hasUpdate);

  const filtered = merged.filter(e => {
    const text = `${e.name} ${e.desc} ${e.category} ${(e.tags||[]).join(" ")}`.toLowerCase();
    return (cat === "All" || e.category === cat) && (!q.trim() || text.includes(q.toLowerCase()));
  });
  const filteredInstalled = filtered.filter(e => e.installed);
  const filteredAvailable = filtered.filter(e => !e.installed);

  const patchExt = (id, patch) => setState(prev => ({...prev, [id]: {...(prev[id] || {}), ...patch}}));
  const toolById = Object.fromEntries((tools || []).map(t => [t.id, t]));
  const hasTool = id => !!toolById[id]?.installed;

  const runAction = async (label, fn) => {
    setBusy(label); setError(""); setNotice("");
    try {
      const out = await fn();
      const text = formatToolOutput(out);
      setNotice(`${label} completed`);
      onOutput?.(`${label}\n${text || "Done"}`);
    } catch(e) {
      const msg = String(e?.message || e);
      setError(msg);
      onOutput?.(`${label} failed\n${msg}`);
    } finally { setBusy(""); }
  };

  const saveGithubToken = async () => {
    try { await manager.setGitHubToken(githubToken.trim()); setNotice("GitHub token saved"); setTimeout(()=>setNotice(""),1800); }
    catch (e) { setError(String(e?.message || e)); }
  };

  const loadGithubRepos = async () => {
    if (!githubToken.trim()) { setError("GitHub token required"); return; }
    setBusy("GitHub repositories"); setError("");
    try {
      const res = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated", {
        headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${githubToken.trim()}` },
      });
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const repos = await res.json();
      setGithubRepos((repos||[]).map(r => ({ id:r.id, name:r.full_name, cloneUrl:r.clone_url, private:r.private, updatedAt:r.updated_at })));
      setNotice(`Loaded ${repos.length} repositories`);
    } catch(e) { setError(String(e?.message || e)); }
    finally { setBusy(""); }
  };

  const runScript = (name) => runAction(`npm run ${name}`, () => npmRunScript(workspaceRoot || MOCK_ROOT, name));
  const runPython = () => {
    if (!activeFile?.toLowerCase().endsWith(".py")) { setError("Open a Python file first"); return; }
    runAction(`python ${activeFile}`, () => pythonRunFile(workspaceRoot || MOCK_ROOT, activeFile));
  };

  const CAT_COLOR = { Languages:"#3b82f6", Formatters:"#8b5cf6", Linters:"#f59e0b", Themes:"#ec4899", AI:"#10b981", Tools:"#6b7280" };
  const selectedExt = selectedId ? merged.find(e => e.id === selectedId) : null;

  const ExtCard = ({ e }) => {
    const color = CAT_COLOR[e.category] || "#6b7280";
    const isSelected = selectedId === e.id;
    const showUpdate = hasUpdate(e);
    return (
      <div className={`ext2-card ${isSelected?"selected":""}`} onClick={() => setSelectedId(id => id === e.id ? null : e.id)}>
        <div className="ext2-icon" style={{ background: color + "22", color }}>
          {(e.icon||e.name.slice(0,2)).toUpperCase()}
        </div>
        <div className="ext2-info">
          <div className="ext2-name-row">
            <span className="ext2-name">{e.name}</span>
            <span className="ext2-version">v{e.version}</span>
            {showUpdate && <span className="ext2-update-badge">↑ {e.latestVersion}</span>}
          </div>
          <div className="ext2-desc">{e.desc}</div>
          <div className="ext2-meta">{e.category} · {e.author}</div>
        </div>
        <div className="ext2-actions">
          {e.installed ? (
            <>
              <button
                className={`ext2-btn ${e.enabled?"enabled":"disabled"}`}
                onClick={ev => { ev.stopPropagation(); patchExt(e.id, { enabled: !e.enabled }); }}
              >{e.enabled?"Enabled":"Disabled"}</button>
              {showUpdate && (
                <button className="ext2-btn update"
                  onClick={ev => { ev.stopPropagation(); patchExt(e.id, { version: e.latestVersion }); setNotice(`Updated ${e.name}`); }}
                >Update</button>
              )}
              <button className="ext2-btn uninstall"
                onClick={ev => { ev.stopPropagation(); patchExt(e.id, { installed:false, enabled:false }); setSelectedId(null); }}
              >Uninstall</button>
            </>
          ) : (
            <button className="ext2-btn install"
              onClick={ev => { ev.stopPropagation(); patchExt(e.id, { installed:true, enabled:true }); }}
            >Install</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="ext2-wrap">
      {/* Top tab switcher */}
      <div className="ext2-search-bar" style={{gap:6}}>
        <button className={`ext2-cat ${tab==="extensions"?"on":""}`} style={{borderRadius:4}} onClick={() => setTab("extensions")}>Extensions</button>
        <button className={`ext2-cat ${tab==="tools"?"on":""}`} style={{borderRadius:4}} onClick={() => setTab("tools")}>Tools</button>
        <div style={{flex:1}}/>
        {onDetach && (
          <button className="dp-panel-btn" title="Detach to floating window" onClick={onDetach} style={{flexShrink:0}}>
            <Ic.Popout/>
          </button>
        )}
      </div>

      {tab === "extensions" && (
        <>
          <div className="ext2-search-bar" style={{paddingTop:4,paddingBottom:4}}>
            <input className="ext2-search-inp" placeholder="Search extensions…" value={q} onChange={e => setQ(e.target.value)}/>
          </div>
          <div className="ext2-cats">
            {EXT_CATS.map(c => <button key={c} className={`ext2-cat ${cat===c?"on":""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="ext2-scroll">
            {/* Updates Available */}
            {updatable.filter(e => cat==="All" || e.category===cat).length > 0 && (
              <>
                <div className="ext2-section-hd">
                  <span className="ext2-section-title" style={{color:"#f59e0b"}}>
                    Updates Available ({updatable.filter(e=>cat==="All"||e.category===cat).length})
                  </span>
                  <button className="ext2-update-all" onClick={() => {
                    updatable.forEach(e => patchExt(e.id, { version: e.latestVersion }));
                    setNotice("All extensions updated");
                  }}>Update All</button>
                </div>
                {updatable.filter(e=>cat==="All"||e.category===cat).map(e => <ExtCard key={e.id} e={e}/>)}
              </>
            )}
            {/* Installed */}
            {filteredInstalled.length > 0 && (
              <>
                <div className="ext2-section-hd">
                  <span className="ext2-section-title">Installed ({filteredInstalled.length})</span>
                </div>
                {filteredInstalled.map(e => <ExtCard key={e.id} e={e}/>)}
              </>
            )}
            {/* Available */}
            {filteredAvailable.length > 0 && (
              <>
                <div className="ext2-section-hd">
                  <span className="ext2-section-title">Available ({filteredAvailable.length})</span>
                </div>
                {filteredAvailable.map(e => <ExtCard key={e.id} e={e}/>)}
              </>
            )}
            {!filtered.length && <div className="ext2-empty">No extensions match your search</div>}
          </div>
          {/* Preview pane */}
          {selectedExt && (
            <div className="ext2-preview">
              <div className="ext2-preview-name">{selectedExt.name}</div>
              <div className="ext2-preview-author">{selectedExt.author} · {selectedExt.category} · v{selectedExt.version}</div>
              <div className="ext2-preview-desc">{selectedExt.desc}</div>
              {selectedExt.tags?.length > 0 && (
                <div className="ext2-preview-tags">
                  {selectedExt.tags.map(t => <span key={t} className="ext2-preview-tag">{t}</span>)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "tools" && (
        <div className="panel-scroll">
          <div className="tool-section">
            <div className="tool-hd">
              <span>RUNTIME TOOLS</span>
              <button className="btn-tiny" title="Refresh" onClick={refreshTools}><Ic.Ref/></button>
            </div>
            {tools.map(t => (
              <div key={t.id} className={`tool-row ${t.installed ? "ok" : "missing"}`}>
                <span className="tool-dot"/>
                <div className="tool-info">
                  <div className="tool-name">{t.label}</div>
                  <div className="tool-meta">{t.installed ? `${t.version || "installed"} · ${t.path}` : t.install_hint}</div>
                </div>
              </div>
            ))}
            {!tools.length && <div className="tool-empty">Runtime scan pending</div>}
          </div>
          <div className="tool-section">
            <div className="tool-hd">
              <span>PROJECT TASKS</span>
              <span className="tool-root" title={workspaceRoot}>{workspaceRoot || "no workspace"}</span>
            </div>
            <div className="tool-actions">
              <button className="btn-ext" disabled={!hasTool("npm") || !!busy} onClick={() => runAction("npm install", () => npmInstall(workspaceRoot || MOCK_ROOT))}>npm install</button>
              <button className="btn-ext" disabled={!hasTool("python") || !!busy} onClick={runPython}>Run Python</button>
            </div>
            {scripts.map(s => (
              <div key={s.name} className="script-row">
                <div className="script-main">
                  <span className="script-name">{s.name}</span>
                  <span className="script-cmd">{s.command}</span>
                </div>
                <button className="btn-ext" disabled={!hasTool("npm") || !!busy} onClick={() => runScript(s.name)}>Run</button>
              </div>
            ))}
            {!scripts.length && <div className="tool-empty">No package.json scripts found</div>}
          </div>
          <div className="tool-section">
            <div className="tool-hd"><span>GITHUB</span></div>
            <input className="way-input" type="password" placeholder="GitHub token (repo access)" value={githubToken} onChange={e => setGithubToken(e.target.value)}/>
            <input className="way-input" placeholder="Clone target folder" value={cloneTarget} onChange={e => setCloneTarget(e.target.value)}/>
            <div className="tool-actions">
              <button className="btn-ext" onClick={saveGithubToken}>Save Token</button>
              <button className="btn-ext" disabled={!hasTool("git") || !!busy} onClick={loadGithubRepos}>Load Repos</button>
              <button className="btn-ext ghost" onClick={() => onOpenSide?.("git")}>Source Control</button>
            </div>
            {githubRepos.slice(0, 12).map(repo => (
              <div key={repo.id} className="repo-row">
                <div className="repo-main">
                  <span className="repo-name">{repo.name}</span>
                  <span className="repo-meta">{repo.private ? "private" : "public"} · {repo.updatedAt?.slice(0,10)}</span>
                </div>
                <button className="btn-ext" disabled={!hasTool("git") || !!busy} onClick={() => runAction(`Clone ${repo.name}`, () => gitClone(cloneTarget || workspaceRoot || MOCK_ROOT, repo.cloneUrl))}>Clone</button>
              </div>
            ))}
          </div>
          {notice && <div className="tool-notice">{notice}</div>}
          {error && <div className="tool-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
// ── Accounts Panel ────────────────────────────────────────────────────────────
const EyeIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const EditIcon = () => (
  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

function AccountEditPopup({ acc, manager, refresh, onClose }) {
  const [label,  setLabel]  = useState(acc.label  || "");
  const [model,  setModel]  = useState(acc.model  || "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");

  const save = async () => {
    setBusy(true); setError("");
    try {
      const patch = { label, model };
      if (apiKey.trim()) patch.apiKey = apiKey.trim();
      await manager.update(acc.id, patch);
      refresh();
      onClose();
    } catch(e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acc-edit-popup" onClick={e=>e.stopPropagation()}>
      <div className="aep-head">
        <span className="aep-title">Edit Account</span>
        <button className="btn-tiny" onClick={onClose}><Ic.X/></button>
      </div>
      <div className="aep-row">
        <label className="aep-lbl">Label</label>
        <input className="aep-inp" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Account label"/>
      </div>
      <div className="aep-row">
        <label className="aep-lbl">Model</label>
        <input className="aep-inp" value={model} onChange={e=>setModel(e.target.value)} placeholder="Model name"/>
      </div>
      <div className="aep-row">
        <label className="aep-lbl">API Key</label>
        <div className="aep-key-wrap">
          <input
            className="aep-inp"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={e=>setApiKey(e.target.value)}
            placeholder="Leave blank to keep current"
          />
          <button className="aep-eye" title={showKey?"Hide":"Show"} onClick={()=>setShowKey(v=>!v)}>
            {showKey ? <EyeOffIcon/> : <EyeIcon/>}
          </button>
        </div>
        <span className="aep-hint">Current key is securely stored — only enter a new key to replace it.</span>
      </div>
      {error && <div className="aep-error">{error}</div>}
      <div className="aep-foot">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy?"Saving…":"Save"}</button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── Connect Provider Panel ─────────────────────────────────────────────────────
function ConnectProviderPanel({ pid, mode, form, setForm, showKey, setShowKey, onDone, onCancel, ghUser, manager }) {
  const prov = PROVIDERS[pid] || {};
  const isCopilotWithGH = pid === "copilot" && ghUser;
  const showCodexChoice = pid === "chatgpt" && !prov.local;
  const [phase,     setPhase]     = useState(showCodexChoice && mode !== "apikey" ? 0 : (mode === "apikey" || prov.local ? 2 : 1));
  const [testing,   setTesting]   = useState(false);
  const [testState, setTestState] = useState(null);
  const [testMsg,   setTestMsg]   = useState("");

  useEffect(() => { setTestState(null); setTestMsg(""); }, [form.apiKey, form.model]);

  const openUrl = (url) => { try { window.open(url, "_blank", "noopener"); } catch {} };

  const runTest = async () => {
    if (!form.apiKey.trim() && !prov.local) { setTestState("fail"); setTestMsg("Enter an API key first"); return; }
    setTesting(true); setTestState(null); setTestMsg("");
    try {
      const result = await manager.testAccountConfig({
        provider: pid, apiKey: form.apiKey.trim(),
        model: form.model || prov.defaultModel, baseUrl: prov.baseUrl,
      });
      setTestState(result.ok ? "ok" : "fail");
      setTestMsg(result.message);
    } catch(e) {
      setTestState("fail"); setTestMsg(String(e?.message || e).slice(0, 180));
    } finally { setTesting(false); }
  };

  const tierLabel = prov.local ? "Local / Free" : prov.costPer1k === 0 ? "Free tier" : `~$${prov.costPer1k}/1K tokens`;

  return (
    <div className="cp-fullscreen">
      {/* Back */}
      <button className="cp-back" onClick={onCancel}>← All Providers</button>

      {/* Brand header */}
      <div className="cp-brand">
        <span className="cp-brand-icon" style={{color: prov.color}}>{prov.icon}</span>
        <div className="cp-brand-info">
          <div className="cp-brand-name">{prov.label}</div>
          <div className="cp-brand-sub">{prov.hint}</div>
          <span className="cp-tier-badge">{tierLabel}</span>
        </div>
      </div>

      {/* Copilot: GitHub pre-filled */}
      {isCopilotWithGH && (
        <div className="cp-gh-banner">
          <img src={ghUser.avatar_url} alt="" width={20} height={20} style={{borderRadius:"50%"}}/>
          <div>
            <strong>{ghUser.login}</strong> — GitHub account detected
            <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>Token pre-filled from your GitHub session</div>
          </div>
        </div>
      )}

      {/* Codex-style choice screen for ChatGPT */}
      {showCodexChoice && phase === 0 && (
        <div className="cp-auth-chooser">
          <div className="cp-auth-title">Codex</div>
          <div className="cp-auth-sub">Choose how you want to connect this provider.</div>
          <div className="cp-auth-btns">
            <button
              className="cp-auth-btn primary"
              onClick={() => {
                openUrl("https://platform.openai.com/api-keys");
                setTimeout(() => setPhase(2), 500);
              }}
            >
              Sign in with ChatGPT
            </button>
            <button className="cp-auth-btn" onClick={() => setPhase(2)}>Use API Key</button>
          </div>
          <div className="cp-step1-note">
            If you are already signed in, create/copy a key from OpenAI Platform and paste it in the next step.
          </div>
        </div>
      )}

      {/* Phase 1: Open portal */}
      {phase === 1 && !prov.local && (
        <div className="cp-step1">
          <div className="cp-step-label"><span className="cp-step-num">1</span> Get your token</div>
          {pid === "copilot" ? (
            <div className="cp-copilot-guide">
              <div className="cp-cg-row"><span className="cp-cg-num">①</span><span>GitHub Copilot subscription active గా ఉండాలి</span></div>
              <div className="cp-cg-row"><span className="cp-cg-num">②</span><span>Terminal లో run చేయండి:</span></div>
              <div className="cp-cg-cmd" onClick={() => { try { navigator.clipboard.writeText("gh auth login --web"); } catch {} }}>gh auth login --web <span className="cp-cg-copy">copy</span></div>
              <div className="cp-cg-row"><span className="cp-cg-num">③</span><span>Login అయిన తర్వాత run చేయండి:</span></div>
              <div className="cp-cg-cmd" onClick={() => { try { navigator.clipboard.writeText("gh auth token"); } catch {} }}>gh auth token <span className="cp-cg-copy">copy</span></div>
              <div className="cp-cg-row"><span className="cp-cg-num">④</span><span>Output లో వచ్చిన <code>gho_...</code> token ని next step లో paste చేయండి</span></div>
              <div className="cp-step1-note" style={{marginTop:4}}>⚠ PAT tokens (<code>ghp_...</code>) పని చేయవు — OAuth token (<code>gho_...</code>) మాత్రమే work అవుతుంది</div>
              <button className="cp-portal-cta" style={{marginTop:8}} onClick={() => { openUrl("https://cli.github.com/"); }}>Install GitHub CLI →</button>
            </div>
          ) : (
            <>
              {prov.signInUrl && (
                <button className="cp-portal-cta" onClick={() => { openUrl(prov.signInUrl); setTimeout(() => setPhase(2), 800); }}>
                  Open {prov.label} Portal →
                </button>
              )}
            </>
          )}
          <button className="cp-skip-link" onClick={() => setPhase(2)}>I already have a token — skip →</button>
        </div>
      )}

      {/* Phase 2: Enter credentials */}
      {(phase === 2 || prov.local) && (
        <div className="cp-step2">
          {!prov.local && <div className="cp-step-label"><span className="cp-step-num">2</span> Enter your credentials</div>}

          <input className="way-input" placeholder={`Label (e.g. My ${prov.label})`}
            value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))}/>

          {!prov.local && (
            <div className="cp-key-row">
              <div className="add-key-wrap" style={{flex:1}}>
                <input className="way-input" type={showKey ? "text" : "password"}
                  placeholder={prov.apiKeyHint || "API Key"}
                  value={form.apiKey}
                  onChange={e => setForm(f => ({...f, apiKey: e.target.value}))}
                  onKeyDown={e => e.key === "Enter" && onDone()}
                  autoFocus/>
                <button className="add-key-eye" title={showKey ? "Hide" : "Show"} onClick={() => setShowKey(v => !v)}>
                  {showKey ? <EyeOffIcon/> : <EyeIcon/>}
                </button>
              </div>
              <button className="cp-test-btn" disabled={testing || !form.apiKey.trim()} onClick={runTest}>
                {testing ? "…" : "Test"}
              </button>
            </div>
          )}

          {testState && (
            <div className={`cp-test-result ${testState}`}>
              {testState === "ok" ? "✓" : "✗"} {testMsg}
            </div>
          )}

          {prov.models?.length > 0 && (
            <select className="cp-model-sel" value={form.model || prov.defaultModel}
              onChange={e => setForm(f => ({...f, model: e.target.value}))}>
              {prov.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          {prov.local && (
            <div className="cp-local-hint">
              Make sure <strong>{prov.label}</strong> is running at <code>{prov.baseUrl}</code>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {phase > 0 && (
        <div className="cp-actions">
          <button className="btn-primary" onClick={onDone} disabled={phase === 1 && !prov.local}>
            {prov.local ? "Configure" : phase === 1 ? "Connect (enter key first)" : "Connect"}
          </button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function AccountsPanel({ manager, status, refresh, routerScores, routerStrategy, onStrategy, onToast }) {
  const [form,       setForm]      = useState({provider:"chatgpt",label:"",apiKey:"",model:""});
  const [connectMode,setConnMode]  = useState(null); // { pid, mode: 'signin'|'apikey' }
  const [showKey,    setShowKey]   = useState(false);
  const [editingId,  setEditingId] = useState(null);
  // GitHub login state
  const [ghUser, setGhUser] = useState(() => manager?.getGitHubUser?.() || null);
  const [showGhForm, setShowGhForm] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [ghShowToken, setGhShowToken] = useState(false);
  const [ghBusy, setGhBusy] = useState(false);
  const [ghError, setGhError] = useState("");
  const [testingId, setTestingId] = useState(null);

  const signInGitHub = async () => {
    if (!ghToken.trim()) { setGhError("Please enter your GitHub Personal Access Token"); return; }
    setGhBusy(true); setGhError("");
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${ghToken.trim()}` },
      });
      if (!res.ok) throw new Error(`GitHub API error ${res.status} — check your token`);
      const user = await res.json();
      const info = { login: user.login, name: user.name || user.login, avatar_url: user.avatar_url };
      await manager.setGitHubToken(ghToken.trim());
      manager.setGitHubUser(info);
      setGhUser(info);
      setGhToken("");
      setShowGhForm(false);
      onToast?.({ msg: `✓ Signed in as ${user.login}`, type: "ok" });
    } catch(e) {
      setGhError(String(e?.message || e));
    } finally {
      setGhBusy(false);
    }
  };

  const signOutGitHub = async () => {
    await manager.setGitHubToken(null);
    manager.setGitHubUser(null);
    setGhUser(null);
    setShowGhForm(false);
    onToast?.({ msg: "Signed out of GitHub", type: "info" });
  };

  const SC = {active:"#22c55e",limited:"#f59e0b",error:"#ef4444",disabled:"#6b7280"};
  const SL = {active:"ready",limited:"limited",error:"error",disabled:"off"};
  const accounts = status.accounts || [];
  const totalTokens = accounts.reduce((n,a)=>n+(a.tokensIn||0)+(a.tokensOut||0),0);
  const totalCost = accounts.reduce((n,a)=>n+(a.costUsd||0),0);
  const fmtCost = n => n ? `$${n.toFixed(n < 0.01 ? 4 : 2)}` : "$0.00";
  const doAdd = async () => {
    try {
      await manager.add({ ...form });
    } catch (err) {
      onToast?.({ msg: `⚠ ${String(err?.message || err)}`, type: "warn" });
      return;
    }
    setForm({ provider:"chatgpt", label:"", apiKey:"", model:"" });
    setConnMode(null);
    refresh();
  };

  const openConnect = async (pid, mode) => {
    const base = { provider: pid, label: "", apiKey: "", model: "" };
    // Copilot + sign-in: auto-fill with stored GitHub token
    if (pid === 'copilot' && mode === 'signin' && ghUser) {
      const token = await manager.getGitHubToken().catch(() => null);
      if (token) {
        setForm({ ...base, apiKey: token, label: `GitHub Copilot (${ghUser.login})` });
        setConnMode({ pid, mode });
        return;
      }
    }
    setForm(base);
    setConnMode({ pid, mode });
  };

  const runAccountTest = async (event, acc) => {
    event.stopPropagation();
    if (!acc?.id || testingId) return;
    setTestingId(acc.id);
    try {
      const result = await manager.testAccount(acc.id);
      onToast?.({ msg: `${result.ok ? "✓" : "⚠"} ${acc.label}: ${result.message}`, type: result.ok ? "ok" : "warn" });
    } catch (err) {
      onToast?.({ msg: `⚠ ${acc.label}: ${String(err?.message || err)}`, type: "warn" });
    } finally {
      setTestingId(null);
      refresh();
    }
  };

  return (
    <div className="panel-scroll" onClick={()=>editingId&&setEditingId(null)}>
      {/* ── GitHub Account Section ── */}
      <div className="gh-account-section">
        <div className="gh-section-hd">
          <span className="gh-section-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          </span>
          <span className="gh-section-title">GitHub</span>
        </div>
        {ghUser ? (
          <div className="gh-user-row">
            {ghUser.avatar_url && <img className="gh-avatar" src={ghUser.avatar_url} alt="" width={24} height={24}/>}
            <div className="gh-user-info">
              <div className="gh-user-login">{ghUser.login} <span className="gh-badge">GitHub</span></div>
              {ghUser.name && ghUser.name !== ghUser.login && <div className="gh-user-name">{ghUser.name}</div>}
            </div>
            <div className="gh-user-actions">
              <button className="gh-action-btn" title="Sign out of GitHub" onClick={signOutGitHub}>Sign Out</button>
            </div>
          </div>
        ) : showGhForm ? (
          <div className="gh-signin-form">
            <div className="gh-form-hint">
              Generate a token at <strong>github.com → Settings → Developer settings → Personal access tokens</strong>. Required scopes: <code>repo</code>, <code>read:user</code>.
            </div>
            <div className="add-key-wrap">
              <input
                className="way-input"
                type={ghShowToken ? "text" : "password"}
                placeholder="gho_xxxxxxxxxxxxxxxxxxxx (OAuth token)"
                value={ghToken}
                onChange={e=>setGhToken(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&signInGitHub()}
                autoFocus
              />
              <button className="add-key-eye" onClick={()=>setGhShowToken(v=>!v)}>
                {ghShowToken ? <EyeOffIcon/> : <EyeIcon/>}
              </button>
            </div>
            {ghError && <div className="gh-error">{ghError}</div>}
            <div className="form-row">
              <button className="btn-primary" disabled={ghBusy} onClick={signInGitHub}>{ghBusy?"Signing in…":"Sign in"}</button>
              <button className="btn-secondary" onClick={()=>{setShowGhForm(false);setGhError("");}}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="gh-signin-btn" onClick={()=>setShowGhForm(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            Sign in to GitHub
          </button>
        )}
      </div>
      <div className="gh-divider"/>

      {status.active && (
        <div className="active-acc-badge" style={{borderColor:PROVIDERS[status.active.provider]?.color}}>
          <span style={{color:PROVIDERS[status.active.provider]?.color,fontSize:18}}>{PROVIDERS[status.active.provider]?.icon}</span>
          <div className="aab-info">
            <div className="aab-label">{status.active.label}</div>
            <div className="aab-model">{status.active.model}</div>
          </div>
          <span className="aab-pill">ACTIVE</span>
        </div>
      )}
      <div className="acc-stats">
        <div className="acc-stat"><div className="asn" style={{color:"#22c55e"}}>{accounts.filter(a=>a.status==="active").length}</div><div className="asl">Ready</div></div>
        <div className="acc-stat"><div className="asn" style={{color:"#f59e0b"}}>{accounts.filter(a=>a.status==="limited").length}</div><div className="asl">Limited</div></div>
        <div className="acc-stat"><div className="asn">{accounts.length}</div><div className="asl">Total</div></div>
      </div>
      <div className="usage-strip">
        <span>{totalTokens.toLocaleString()} est. tokens</span>
        <strong>{fmtCost(totalCost)}</strong>
      </div>
      <div className="router-strategy-row">
        <span className="rs-label">Router:</span>
        {["latency","cost","balanced"].map(s=>(
          <button key={s} className={`strat-btn ${routerStrategy===s?"on":""}`} onClick={()=>onStrategy(s)}>{s}</button>
        ))}
      </div>

      {/* ── Connect Providers ── */}
      {connectMode ? (
        <ConnectProviderPanel
          pid={connectMode.pid}
          mode={connectMode.mode}
          form={form}
          setForm={setForm}
          showKey={showKey}
          setShowKey={setShowKey}
          onDone={doAdd}
          ghUser={ghUser}
          manager={manager}
          onCancel={() => { setConnMode(null); setForm({ provider:"chatgpt", label:"", apiKey:"", model:"" }); }}
        />
      ) : (
        <>
          <div className="acc-panel-hd" style={{marginTop:8}}>
            <span className="sec-head">AI PROVIDERS</span>
            <span style={{fontSize:10,color:"var(--t3)"}}>click to connect</span>
          </div>
          <div className="prov-grid">
            {Object.entries(PROVIDERS).map(([pid, prov]) => {
              const connected = accounts.filter(a => a.provider === pid);
              const tierLabel = prov.local ? "Local" : prov.costPer1k === 0 ? "Free" : "Paid";
              return (
                <div key={pid} className={`prov-card${connected.length ? " prov-card-ok" : ""}`}
                  onClick={() => openConnect(pid, "signin")}>
                  <div className="prov-card-head">
                    <span className="prov-card-icon" style={{color: prov.color}}>{prov.icon}</span>
                    <span className={`prov-tier-badge prov-tier-${tierLabel.toLowerCase()}`}>{tierLabel}</span>
                  </div>
                  <div className="prov-card-name">{prov.label}</div>
                  {connected.length > 0
                    ? <div className="prov-card-status ok">✓ {connected.length} connected</div>
                    : <div className="prov-card-status">{prov.local ? "not running" : "not connected"}</div>
                  }
                  <div className="prov-card-cta">
                    {connected.length ? "＋ Add another" : prov.local ? "Configure" : "Connect →"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {Object.entries(PROVIDERS).map(([pid,prov])=>{
        const accs = accounts.filter(a=>a.provider===pid);
        if (!accs.length) return null;
        const rs = routerScores[pid];
        const doSignOut = async (e) => { e.stopPropagation(); for (const a of accs) await manager.remove(a.id); refresh(); };
        return (
          <div key={pid} className="prov-group">
            <div className="prov-group-lbl" style={{color:prov.color}}>
              {prov.icon} {prov.label} · {accs.length}
              {rs?.healthy && <span className="rs-tag">{Math.round(rs.latencyMs)}ms</span>}
              <button className="btn-tiny danger" style={{marginLeft:"auto",fontSize:10,padding:"2px 6px"}} onClick={doSignOut}>Sign Out</button>
            </div>
            {accs.map(acc=>(
              <div key={acc.id} className="acc-entry">
                <div className={`acc-row ${status.activeId===acc.id?"acc-active":""}`}
                  onClick={()=>{manager.setActive(acc.id);refresh();}}>
                  <span className="acc-dot" style={{background:SC[acc.status]}}/>
                  <span className="acc-lbl">{acc.label}</span>
                  <span className="acc-model">{acc.model}</span>
                  <span className="acc-usage">{((acc.tokensIn||0)+(acc.tokensOut||0)).toLocaleString()} tok · {fmtCost(acc.costUsd||0)}</span>
                  <span className="acc-status" style={{color:SC[acc.status]}}>{SL[acc.status]}</span>
                  <div className="acc-actions">
                    <button className="btn-tiny" title="Test connection" disabled={!!testingId} onClick={e=>runAccountTest(e, acc)}>{testingId===acc.id ? "..." : "Test"}</button>
                    {acc.status!=="active"&&<button className="btn-tiny" title="Reset" onClick={async e=>{e.stopPropagation();await manager.resetAccount(acc.id);refresh();}}><Ic.Ref/></button>}
                    <button className="btn-tiny" title="Edit" onClick={e=>{e.stopPropagation();setEditingId(id=>id===acc.id?null:acc.id);}}><EditIcon/></button>
                    <button className="btn-tiny danger" title="Remove" onClick={async e=>{e.stopPropagation();await manager.remove(acc.id);refresh();}}><Ic.X/></button>
                  </div>
                </div>
                {editingId === acc.id && (
                  <AccountEditPopup
                    acc={acc}
                    manager={manager}
                    refresh={refresh}
                    onClose={()=>setEditingId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}
      <div className="rotation-box">
        <div className="rb-title">⟳ Auto-rotation</div>
        <div className="rb-body">Limit hit → silently switch to next account → toast notification. Priority: active accounts → lowest errors.</div>
      </div>
    </div>
  );
}

// ── Search Panel ──────────────────────────────────────────────────────────────
function SearchPanel({ code, workspaceRoot, onOpenFile, revealLine, theme, setTheme, fontSize, setFontSize, wordWrap, setWordWrap, lineNumbers, setLineNumbers, minimapEnabled, setMinimapEnabled, tabSize, setTabSize, onOpenSettings }) {
  const [q, setQ]           = useState("");
  const [replace, setRep]   = useState("");
  const [showReplace, setShowRep] = useState(false);
  const [caseSensitive, setCS]    = useState(false);
  const [results, setResults]     = useState([]); // [{file, path, matches:[{line,text}]}]
  const [busy, setBusy]           = useState(false);
  const [matchCount, setMC]       = useState(0);
  const [collapsed, setCollapsed] = useState({});

  const run = async () => {
    if (!q.trim()) { setResults([]); setMC(0); return; }
    if (IS_TAURI && workspaceRoot) {
      setBusy(true);
      try {
        const raw = await searchFiles(workspaceRoot, q, 200);
        const grouped = [];
        const seen = new Map();
        let total = 0;
        for (const item of (raw || [])) {
          const key = item.path || item.file;
          if (!seen.has(key)) { seen.set(key, []); grouped.push({ file: item.file || key.split(/[\\/]/).pop(), path: key, matches: seen.get(key) }); }
          seen.get(key).push({ line: item.line, text: item.text || item.content || "" });
          total++;
        }
        setResults(grouped);
        setMC(total);
      } catch {
        const lines = code.split("\n");
        const needle = caseSensitive ? q : q.toLowerCase();
        const matches = lines.map((t,i)=>({line:i+1,text:t})).filter(r=>(caseSensitive?r.text:r.text.toLowerCase()).includes(needle));
        setResults(matches.length ? [{ file: "current file", path: null, matches }] : []);
        setMC(matches.length);
      } finally { setBusy(false); }
    } else {
      const lines = code.split("\n");
      const needle = caseSensitive ? q : q.toLowerCase();
      const matches = lines.map((t,i)=>({line:i+1,text:t})).filter(r=>(caseSensitive?r.text:r.text.toLowerCase()).includes(needle));
      setResults(matches.length ? [{ file: "current file", path: null, matches }] : []);
      setMC(matches.length);
    }
  };

  const handleClick = (path, line) => {
    if (path && onOpenFile) {
      onOpenFile({ path, name: path.split(/[\\/]/).pop() });
      setTimeout(() => revealLine?.(line), 300);
    } else {
      revealLine?.(line);
    }
  };

  const highlightMatch = (text) => {
    if (!q) return text;
    const idx = caseSensitive ? text.indexOf(q) : text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return <>{text.slice(0,idx)}<mark className="search-hl">{text.slice(idx,idx+q.length)}</mark>{text.slice(idx+q.length)}</>;
  };

  return (
    <div className="panel-scroll">
      <div className="search-quick-controls">
        <select className="search-mini-select" value={theme} onChange={e=>setTheme(e.target.value)} title="Theme">
          <option value="vs-dark">Dark</option>
          <option value="vs-light">Light</option>
          <option value="hc-black">HC Black</option>
        </select>
        <button className="search-mini-btn" onClick={()=>setFontSize(s=>Math.max(11, s-1))} title="Font smaller">A-</button>
        <button className="search-mini-btn" onClick={()=>setFontSize(s=>Math.min(24, s+1))} title="Font bigger">A+</button>
        <button className={`search-mini-btn ${wordWrap==="on"?"on":""}`} onClick={()=>setWordWrap(w=>w==="on"?"off":"on")}>Wrap</button>
        <button className={`search-mini-btn ${lineNumbers?"on":""}`} onClick={()=>setLineNumbers(v=>!v)}>Lines</button>
        <button className={`search-mini-btn ${minimapEnabled?"on":""}`} onClick={()=>setMinimapEnabled(v=>!v)}>Map</button>
        <select className="search-mini-select tab-size" value={tabSize} onChange={e=>setTabSize(Number(e.target.value))} title="Tab size">
          <option value={2}>Tab 2</option>
          <option value={4}>Tab 4</option>
          <option value={8}>Tab 8</option>
        </select>
        <button className="search-mini-btn" onClick={onOpenSettings}>Settings</button>
      </div>

      <div className="search-header">
        <div className="search-row-wrap">
          <div className="search-inp-row">
            <input className="search-inp" placeholder={IS_TAURI ? "Search files…" : "Search in editor…"} value={q}
              onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&run()}/>
            <button className={`search-mini-btn ${caseSensitive?"on":""}`} title="Match case" onClick={()=>setCS(v=>!v)}>Aa</button>
            <button className="btn-search" onClick={run} title="Search">↵</button>
            <button className="search-mini-btn" title="Toggle replace" onClick={()=>setShowRep(v=>!v)}>±</button>
          </div>
          {showReplace && (
            <div className="search-inp-row" style={{marginTop:3}}>
              <input className="search-inp" placeholder="Replace…" value={replace} onChange={e=>setRep(e.target.value)}/>
              <button className="search-mini-btn" title="Replace all (editor only)" onClick={()=>{
                if (!replace || !q || !code) return;
                const flags = caseSensitive ? "g" : "gi";
                const escaped = q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
                const next = code.replace(new RegExp(escaped, flags), replace);
                setQ(""); setResults([]); setMC(0);
              }}>All</button>
            </div>
          )}
        </div>
        {matchCount > 0 && <div className="search-count">{matchCount} result{matchCount!==1?"s":""} in {results.length} file{results.length!==1?"s":""}</div>}
        {busy && <div className="search-count">Searching…</div>}
      </div>

      <div className="search-results">
        {results.map(group => (
          <div key={group.path || group.file} className="search-file-group">
            <button className="search-file-hd" onClick={()=>setCollapsed(c=>({...c,[group.path||group.file]:!c[group.path||group.file]}))}>
              <span className="search-file-chev">{collapsed[group.path||group.file] ? "▶" : "▼"}</span>
              <span className="search-file-name">{group.file}</span>
              <span className="search-file-count">{group.matches.length}</span>
            </button>
            {!collapsed[group.path||group.file] && group.matches.map((m,i) => (
              <button key={i} className="search-row" onClick={()=>handleClick(group.path, m.line)}>
                <span className="search-ln">{m.line}</span>
                <span className="search-txt">{highlightMatch(m.text.trim())}</span>
              </button>
            ))}
          </div>
        ))}
        {!busy && q && results.length===0 && matchCount===0 && <div className="search-empty">No results for "{q}"</div>}
      </div>
    </div>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────
function renderInline(text) {
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|~~(.+?)~~)/g;
  const out = []; let last = 0, k = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if      (m[2]) out.push(<strong key={k++}><em>{m[2]}</em></strong>);
    else if (m[3]) out.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4]) out.push(<em key={k++}>{m[4]}</em>);
    else if (m[5]) out.push(<code key={k++} className="msg-ic">{m[5]}</code>);
    else if (m[6]) out.push(<a key={k++} href={m[7]} target="_blank" rel="noreferrer" className="msg-link">{m[6]}</a>);
    else if (m[8]) out.push(<del key={k++}>{m[8]}</del>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 && typeof out[0] === "string" ? out[0] : out;
}

function renderMdBlock(raw) {
  const lines = raw.split("\n");
  const out = []; let items = [], iTag = null, k = 0;
  const flush = () => {
    if (!items.length) return;
    const T = iTag; out.push(<T key={k++} className="msg-list">{items}</T>);
    items = []; iTag = null;
  };
  for (const line of lines) {
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { flush(); const lv = hm[1].length; const H = `h${lv}`; out.push(<H key={k++} className={`msg-h msg-h${lv}`}>{renderInline(hm[2])}</H>); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flush(); out.push(<hr key={k++} className="msg-hr"/>); continue; }
    const ulm = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ulm) { if (iTag !== "ul") { flush(); iTag = "ul"; } items.push(<li key={k++}>{renderInline(ulm[1])}</li>); continue; }
    const olm = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olm) { if (iTag !== "ol") { flush(); iTag = "ol"; } items.push(<li key={k++}>{renderInline(olm[1])}</li>); continue; }
    if (line.startsWith("> ")) { flush(); out.push(<blockquote key={k++} className="msg-bq">{renderInline(line.slice(2))}</blockquote>); continue; }
    if (!line.trim()) { flush(); continue; }
    flush();
    out.push(<p key={k++} className="msg-p">{renderInline(line)}</p>);
  }
  flush();
  return out;
}

function MsgContent({ content, onInsert }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="msg-body">
      {parts.map((p, i) => {
        if (p.startsWith("```")) {
          const nl = p.indexOf("\n"), lang = nl > 3 ? p.slice(3, nl).trim() : "", code = nl > 3 ? p.slice(nl + 1, -3) : p.slice(3, -3);
          return (
            <div key={i} className="code-block">
              <div className="cb-hd">
                <span className="cb-lang" style={{color: LANG_DOT[lang] || "#aaa"}}>{lang || "code"}</span>
                <button className="cb-btn" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
                {onInsert && <button className="cb-btn ac" onClick={() => onInsert(code)}>↩ Insert</button>}
              </div>
              <pre className="cb-pre">{code}</pre>
            </div>
          );
        }
        return p.trim() ? <div key={i}>{renderMdBlock(p)}</div> : null;
      })}
    </div>
  );
}

// ── Chat Rooms storage ────────────────────────────────────────────────────────
const CONV_KEY = "wayai_conversations_v1";
const WELCOME_MSG = { role:"ai", content:"Hi! I'm **Way AI Code** 🚀\n\nClick a file in the Explorer to open it, then select code and use the quick actions above.\n\nI'll auto-switch accounts if any rate limit is hit." };

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(CONV_KEY) || "[]"); } catch { return []; }
}
function saveConversations(arr) {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(arr)); } catch {}
}
function makeConversation(agentId = "general") {
  return { id: `conv_${Date.now()}`, name: "New Chat", agentId, messages: [WELCOME_MSG], createdAt: Date.now(), lastAt: Date.now() };
}
function initConversations() {
  const saved = loadConversations();
  if (saved.length) return saved;
  const first = makeConversation("general");
  saveConversations([first]);
  return [first];
}

// ── Chat Panel ────────────────────────────────────────────────────────────────
const QUICK = [
  {label:"💡 Explain",  fn:(c,l)=>`Explain this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``},
  {label:"🔧 Fix",      diff:true, fn:(c,l)=>`Fix all bugs in this ${l} code. Return only the complete replacement code block:\n\`\`\`${l}\n${c}\n\`\`\``},
  {label:"⚡ Optimize", diff:true, fn:(c,l)=>`Optimize this ${l} code. Return only the complete replacement code block:\n\`\`\`${l}\n${c}\n\`\`\``},
  {label:"🧪 Tests",    fn:(c,l)=>`Write unit tests for this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``},
  {label:"📝 Comment",  diff:true, fn:(c,l)=>`Add clear comments to this ${l} code. Return only the complete replacement code block:\n\`\`\`${l}\n${c}\n\`\`\``},
  {label:"♻️ Refactor", diff:true, fn:(c,l)=>`Refactor this ${l} code to best practices. Return only the complete replacement code block:\n\`\`\`${l}\n${c}\n\`\`\``},
];

const AGENT_STORE_KEY = "wayai_chat_agent_v1";
const AI_AGENTS = [
  {
    id: "general",
    label: "General",
    hint: "Balanced coding help",
    instruction: "Act as a practical senior software engineer. Be concise, accurate, and implementation-focused.",
  },
  {
    id: "debugger",
    label: "Debugger",
    hint: "Root-cause and fix",
    instruction: "Act as a debugging specialist. Prioritize root-cause analysis, reproduction steps, and minimal-risk fixes.",
  },
  {
    id: "reviewer",
    label: "Reviewer",
    hint: "Risk-focused review",
    instruction: "Act as a strict code reviewer. Focus on bugs, regressions, security issues, and missing tests first.",
  },
  {
    id: "refactor",
    label: "Refactor",
    hint: "Design and cleanup",
    instruction: "Act as a refactoring expert. Improve structure, naming, readability, and maintainability while preserving behavior.",
  },
  {
    id: "test",
    label: "Test Writer",
    hint: "High-value test cases",
    instruction: "Act as a test engineer. Create focused unit and integration tests that cover edge cases and regressions.",
  },
  {
    id: "security",
    label: "Security",
    hint: "Threat-aware coding",
    instruction: "Act as an application security engineer. Identify vulnerabilities, harden surfaces, and suggest secure defaults.",
  },
];

function loadAgentMode() {
  try {
    return localStorage.getItem(AGENT_STORE_KEY) || "general";
  } catch {
    return "general";
  }
}

function saveAgentMode(id) {
  try {
    localStorage.setItem(AGENT_STORE_KEY, id);
  } catch {}
}

function extractFirstCodeBlock(content = "") {
  const match = content.match(/```[^\n`]*\n([\s\S]*?)```/);
  return (match ? match[1] : content).trim();
}

function rangeToPlain(range) {
  if (!range) return null;
  return {
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
  };
}

function ChatPanel({ manager, status, editorRef, lang, code, onProposeEdit, tabs = [], tabCode = {} }) {
  const [conversations, setConversations] = useState(initConversations);
  const [activeConvId, setActiveConvId]   = useState(() => initConversations()[0]?.id);
  const [renamingId,   setRenamingId]     = useState(null);
  const [renameVal,    setRenameVal]      = useState("");
  const [input,  setInput]  = useState("");
  const [streaming, setStr] = useState(false);
  const [streamTxt, setST]  = useState("");
  const [detached,  setDetached] = useState(false);
  const [dragPos,   setDragPos]  = useState({ x: Math.max(0, window.innerWidth - 460), y: 60 });
  const [dragSize,  setDragSize] = useState({ w: 440, h: 560 });
  const [attachedFile,    setAttachedFile]    = useState(null);
  const [showAttachMenu,  setShowAttachMenu]  = useState(false);
  const attachBtnRef = useRef(null);
  const streamRef = useRef("");
  const endRef    = useRef(null);

  const activeConv  = conversations.find(c => c.id === activeConvId) || conversations[0];
  const msgs        = activeConv?.messages || [];
  const agentId     = activeConv?.agentId || "general";
  const activeAgent = AI_AGENTS.find(a => a.id === agentId) || AI_AGENTS[0];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, streamTxt]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e) => { if (!attachBtnRef.current?.contains(e.target)) setShowAttachMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAttachMenu]);

  // ── Conversation actions ──────────────────────────────────────────────────
  const updateConv = (id, patch) => {
    setConversations(prev => {
      const next = prev.map(c => c.id !== id ? c : { ...c, ...patch, lastAt: Date.now() });
      saveConversations(next);
      return next;
    });
  };

  const setMsgs = (updater) => {
    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id !== activeConvId) return c;
        const newMsgs = typeof updater === "function" ? updater(c.messages) : updater;
        return { ...c, messages: newMsgs, lastAt: Date.now() };
      });
      saveConversations(next);
      return next;
    });
  };

  const setAgentId = (id) => { updateConv(activeConvId, { agentId: id }); saveAgentMode(id); };

  const newConversation = () => {
    const conv = makeConversation(agentId);
    setConversations(prev => { const next = [conv, ...prev]; saveConversations(next); return next; });
    setActiveConvId(conv.id);
  };

  const deleteConversation = (id) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (!next.length) {
        const first = makeConversation("general");
        saveConversations([first]);
        setActiveConvId(first.id);
        return [first];
      }
      saveConversations(next);
      if (activeConvId === id) setActiveConvId(next[0].id);
      return next;
    });
  };

  const autoName = (convId, firstUserMsg) => {
    const name = firstUserMsg.trim().slice(0, 28) + (firstUserMsg.trim().length > 28 ? "…" : "");
    updateConv(convId, { name });
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const withAgentInstruction = (prompt) =>
    ["System role:", activeAgent.instruction, "Always follow explicit output constraints from the user prompt.", "", "User request:", prompt].join("\n");

  const getSel = () => {
    const ed = editorRef.current; if (!ed) return "";
    return ed.getModel()?.getValueInRange(ed.getSelection())?.trim() || "";
  };

  const insertCode = snippet => { const ed = editorRef.current; if (!ed) return; ed.executeEdits("way-ai", [{ range: ed.getSelection(), text: snippet }]); };

  const send = async (prompt, label, options = {}) => {
    if (!prompt || streaming) return;
    const readyCount = (status.accounts || []).filter(a => a.status === "active").length;
    if (!readyCount) {
      setMsgs(p => [...p, { role:"ai", content:"❌ **Error:** No ready accounts available.\n\nOpen Accounts panel and add/update a valid API key, then click Reset on errored accounts." }]);
      return;
    }
    const currentReady = (status.accounts || []).find(a => a.id === status.activeId && a.status === "active");
    if (!currentReady) {
      setMsgs(p => [...p, { role:"ai", content:"⚠ Active account is not ready. Select a ready account in Accounts panel." }]);
      return;
    }
    // Auto-name conv from first user message
    const isNewConv = activeConv?.name === "New Chat" && msgs.filter(m => m.role === "user").length === 0;
    if (isNewConv) autoName(activeConvId, label || prompt);

    setMsgs(p => [...p, { role:"user", content: label || prompt.slice(0, 120) }]);
    setStr(true); streamRef.current = ""; setST("");
    try {
      const onToken = t => { streamRef.current += t; setST(streamRef.current); };
      const { result, account } = await manager.call(withAgentInstruction(prompt), { onToken });
      const final = streamRef.current || result;
      setMsgs(p => [...p, { role:"ai", content: final, acLabel: account.label, pColor: PROVIDERS[account.provider]?.color, pIcon: PROVIDERS[account.provider]?.icon, agentLabel: activeAgent.label }]);
      if (options.inlineDiff && options.range && options.original) {
        const replacement = extractFirstCodeBlock(final);
        if (replacement) onProposeEdit?.({ ...options, replacement });
      }
      setST("");
    } catch(err) {
      setMsgs(p => [...p, { role:"ai", content:`❌ **Error:** ${err.message}\n\nCheck API keys in the Accounts panel.` }]);
    }
    setStr(false);
  };

  const prov   = PROVIDERS[status.active?.provider];
  const pColor = prov?.color || "var(--accent)";
  const pIcon  = prov?.icon  || "◈";

  const openFileTabs = tabs.filter(t => !t.isExtension);

  const doSend = () => {
    const s = getSel();
    const fc = attachedFile
      ? `File context: **${attachedFile.name}**\n\`\`\`${attachedFile.lang || ""}\n${attachedFile.content}\n\`\`\`\n\n`
      : "";
    const prompt = s ? `${fc}Code:\n\`\`\`${lang}\n${s}\n\`\`\`\n\nQuestion: ${input}` : `${fc}${input}`;
    send(prompt, input);
    setInput("");
    setAttachedFile(null);
  };
  const chatBody = (
    <>
      {/* ── Chat rooms bar ── */}
      <div className="chat-rooms-bar">
        <div className="chat-rooms-tabs">
          {conversations.map(conv => (
            <div key={conv.id} className={`chat-room-tab${conv.id === activeConvId ? " active" : ""}`}
              onClick={() => setActiveConvId(conv.id)}>
              {renamingId === conv.id ? (
                <input className="chat-room-rename-inp" autoFocus value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => { updateConv(conv.id, { name: renameVal || conv.name }); setRenamingId(null); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") { updateConv(conv.id, { name: renameVal || conv.name }); setRenamingId(null); }
                    if (e.key === "Escape") setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="chat-room-name" onDoubleClick={e => { e.stopPropagation(); setRenamingId(conv.id); setRenameVal(conv.name); }}>
                  {conv.name}
                </span>
              )}
              {conversations.length > 1 && (
                <button className="chat-room-x" title="Close" onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}>×</button>
              )}
            </div>
          ))}
        </div>
        <button className="chat-room-new" title="New Chat" onClick={newConversation}>＋</button>
      </div>

      {/* ── Account bar ── */}
      <div className="chat-acc-bar">
        {status.active
          ? <div className="chat-acc-tag" style={{color:pColor}}>{pIcon} <span className="chat-acc-name">{status.active.label}</span><span className="chat-acc-model">{status.active.model}</span></div>
          : <div className="chat-acc-tag warn">⚠ No accounts — add in Accounts panel</div>}
        <div className="chat-acc-right">
          <select className="agent-select" value={agentId} onChange={e => setAgentId(e.target.value)}>
            {AI_AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <span className="chat-acc-count">{(status.accounts || []).filter(a => a.status === "active").length} ready</span>
          <button className="btn-tiny chat-detach-btn" title={detached ? "Dock back" : "Detach to floating window"} onClick={() => setDetached(v => !v)}>
            {detached ? <Ic.Attach/> : <Ic.Popout/>}
          </button>
        </div>
      </div>
      <div className="chat-agent-hint">Agent: <strong>{activeAgent.label}</strong> · {activeAgent.hint}</div>
      <div className="chat-quick">
        {QUICK.map(q => (
          <button key={q.label} className="quick-btn" disabled={streaming}
            onClick={() => {
              const ed = editorRef.current;
              const selected = getSel();
              const range = rangeToPlain(ed?.getSelection());
              const target = selected || code;
              send(q.fn(target, lang), q.label, { inlineDiff: !!(q.diff && selected), range, original: selected });
            }}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="chat-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "user" : "ai"}`}>
            {m.role === "ai" && <div className="msg-meta" style={{color: m.pColor || pColor}}>{m.pIcon || pIcon} {m.acLabel || "Way AI"} · {m.agentLabel || activeAgent.label}</div>}
            <MsgContent content={m.content} onInsert={m.role === "ai" ? insertCode : null}/>
          </div>
        ))}
        {streaming && (
          <div className="msg ai">
            <div className="msg-meta" style={{color: pColor}}>{pIcon} streaming…</div>
            {streamTxt ? <MsgContent content={streamTxt}/> : <div className="dots"><span/><span/><span/></div>}
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div className="chat-input-row">
        {attachedFile && (
          <div className="chat-attach-row">
            <span className="chat-attach-chip">
              <span className="cac-icon">📎</span>
              <span className="cac-name">{attachedFile.name}</span>
              <button className="cac-x" onClick={() => setAttachedFile(null)}>×</button>
            </span>
          </div>
        )}
        <div className="chat-input-inner">
          <textarea className="chat-ta" rows={3} placeholder={`Ask ${activeAgent.label}… (Enter=send, Shift+Enter=newline)`}
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
            }}/>
          <div className="chat-input-btns">
            <div style={{position:"relative"}} ref={attachBtnRef}>
              <button className="chat-attach-btn" title="Attach file as context"
                onClick={() => setShowAttachMenu(v => !v)}>📎</button>
              {showAttachMenu && (
                <div className="chat-attach-menu">
                  {openFileTabs.length === 0
                    ? <div className="cam-empty">No files open</div>
                    : openFileTabs.map(t => (
                      <button key={t.key} className="cam-item"
                        onClick={() => { setAttachedFile({ key: t.key, name: t.name, lang: t.lang || "", content: (tabCode[t.key] || "").slice(0, 8000) }); setShowAttachMenu(false); }}>
                        <span style={{color: LANG_DOT[t.lang] || "#999", fontSize: 9, marginRight: 4}}>■</span>{t.name}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            <button className="btn-send" disabled={streaming} style={{"--pc": pColor}} onClick={doSend}>
              {streaming ? "⏳" : "↑"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (detached) {
    return (
      <>
        <DockPlaceholder title="AI Chat" onDock={() => setDetached(false)}/>
        <FloatingPanel id="chat_win" title="Way AI Chat" detached={true}
          pos={dragPos} setPos={setDragPos} size={dragSize} setSize={setDragSize}
          onDock={() => setDetached(false)} minW={340} minH={420}>
          <div className="chat-panel" style={{height:"100%", overflow:"hidden"}}>{chatBody}</div>
        </FloatingPanel>
      </>
    );
  }

  return <div className="chat-panel">{chatBody}</div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
const LANGS = ["javascript","typescript","python","rust","go","java","cpp","csharp","css","html","json","markdown","sql","bash","toml","yaml"];
const SETTINGS_KEY = "wayai_editor_settings_v1";

function loadEditorSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEditorSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

function CommandPalette({ open, commands, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const query = q.trim().toLowerCase();
  const filtered = commands
    .filter(c => !query || `${c.title} ${c.group || ""} ${c.detail || ""}`.toLowerCase().includes(query))
    .slice(0, 12);

  const run = (cmd) => {
    cmd.run();
    onClose();
  };

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={e=>e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          value={q}
          placeholder="Type a command"
          onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>{
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && filtered[0]) run(filtered[0]);
          }}
        />
        <div className="cmd-list">
          {filtered.map(cmd=>(
            <button key={cmd.id} className="cmd-row" onClick={()=>run(cmd)}>
              <span className="cmd-title">{cmd.title}</span>
              <span className="cmd-meta">{cmd.detail || cmd.group}</span>
            </button>
          ))}
          {!filtered.length && <div className="cmd-empty">No commands found</div>}
        </div>
      </div>
    </div>
  );
}

function ProblemsView({ tabs, dirtyTabs, problems, onGoTo }) {
  const dirty = tabs.filter(t => dirtyTabs[t.key]);
  const byFile = {};
  for (const m of problems) {
    const key = m.resource?.path || m.resource?.toString() || "unknown";
    const fname = key.split(/[\\/]/).pop();
    if (!byFile[fname]) byFile[fname] = [];
    byFile[fname].push(m);
  }
  const hasAny = problems.length > 0 || dirty.length > 0;
  return (
    <div className="console-view">
      {!hasAny && <div className="console-empty">No problems detected</div>}
      {dirty.map(t => (
        <div key={t.key} className="problem-row warn" onClick={()=>onGoTo?.(t.key, 1)}>
          <span className="problem-sev warn">⚠</span>
          <span className="problem-main">Unsaved changes</span>
          <span className="problem-file">{t.name}</span>
        </div>
      ))}
      {Object.entries(byFile).map(([fname, markers]) => (
        <div key={fname} className="problem-file-group">
          <div className="problem-file-hd">
            <span className="problem-file-name">{fname}</span>
            <span className="problem-file-count">{markers.length}</span>
          </div>
          {markers.map((m, i) => {
            const isErr = m.severity === 8;
            return (
              <div key={i} className={`problem-row ${isErr?"err":"warn"}`}
                onClick={()=>onGoTo?.(m.resource?.path, m.startLineNumber)}>
                <span className={`problem-sev ${isErr?"err":"warn"}`}>{isErr ? "⊘" : "⚠"}</span>
                <span className="problem-main">{m.message}</span>
                <span className="problem-pos">Ln {m.startLineNumber}, Col {m.startColumn}</span>
                <span className="problem-file">{fname}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function OutputView({ lines }) {
  return (
    <div className="console-view output-view">
      {(lines.length ? lines : ["Way AI Code output ready."]).map((line,i)=>(
        <div key={`${i}:${line}`} className="output-line">{line}</div>
      ))}
    </div>
  );
}

function DebugConsoleView() {
  return (
    <div className="console-view">
      <div className="console-empty">Debug console is ready. Debug adapters will connect here in the next slice.</div>
    </div>
  );
}

function PortsView() {
  return (
    <div className="console-view ports-view">
      <div className="port-row"><span className="port-num">1420</span><span>Vite dev server</span><a href="http://127.0.0.1:1420/" target="_blank" rel="noreferrer">Open</a></div>
    </div>
  );
}

function BottomPanel({
  open, active, height, onHeightChange, onActive, onClose,
  tabs, dirtyTabs, outputLines, problems, onGoToProblem,
}) {
  const errCount  = problems.filter(p => p.severity === 8).length;
  const warnCount = problems.filter(p => p.severity === 4).length;
  const totalCount = errCount + warnCount + tabs.filter(t=>dirtyTabs[t.key]).length;
  const panelTabs = [
    { id:"problems", label:"PROBLEMS", count: totalCount || 0 },
    { id:"output", label:"OUTPUT" },
    { id:"debug", label:"DEBUG CONSOLE" },
    { id:"terminal", label:"TERMINAL" },
    { id:"ports", label:"PORTS" },
  ];

  const startDrag = (e) => {
    e.preventDefault();
    const sy = e.clientY, sh = height;
    const mv = ev => onHeightChange(Math.max(130, Math.min(620, sh + sy - ev.clientY)));
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  if (!open) return null;

  return (
    <div className="bottom-panel" style={{height}}>
      <div className="bottom-drag" onMouseDown={startDrag}/>
      <div className="bottom-head">
        <div className="bottom-tabs">
          {panelTabs.map(t=>(
            <button key={t.id} className={`bottom-tab ${active===t.id?"on":""}`} onClick={()=>onActive(t.id)}>
              {t.label}{t.count ? <span className="bottom-count">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="bottom-actions">
          <button className="bottom-icon" title="Maximize panel" onClick={()=>onHeightChange(height > 500 ? 240 : 560)}>□</button>
          <button className="bottom-icon" title="Close panel" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="bottom-body">
        {active==="problems" && <ProblemsView tabs={tabs} dirtyTabs={dirtyTabs} problems={problems} onGoTo={onGoToProblem}/>}
        {active==="output" && <OutputView lines={outputLines}/>}
        {active==="debug" && <DebugConsoleView/>}
        {active==="terminal" && <TerminalPanel embedded/>}
        {active==="ports" && <PortsView/>}
      </div>
    </div>
  );
}

export default function App() {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const inlineDiffRef = useRef(null);
  const completionDisposablesRef = useRef([]);
  const menuBarRef = useRef(null);
  const accStatusRef = useRef(null);
  const routerScoresRef = useRef({});
  const activeTabRef = useRef(null);
  const tabCodeRef = useRef({});
  const autocompleteCacheRef = useRef({ key:"", at:0, value:"" });
  const suppressAutoSaveRef = useRef(false);
  const dragStartRef = useRef({ x: 0, startWidth: 0, side: "primary" });
  const sideWidthRef = useRef(null);
  const secondarySideWidthRef = useRef(null);
  const sideResizeMoveRef = useRef(null);
  const sideResizeUpRef = useRef(null);
  const initialSettings = useRef(loadEditorSettings()).current;

  // Layout
  const [activity, setActivity] = useState(initialSettings.activity || "search"); // default: show search + controls
  const [menuSearch, setMenuSearch] = useState("");
  const [sideOpen, setSideOpen] = useState(true);
  const [secondarySideOpen, setSecondarySideOpen] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState("outline");
  const [rightPanel, setRightPanel] = useState("chat"); // right icon-bar active panel
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelActive, setPanelActive] = useState("terminal");
  const [layoutMode, setLayoutMode] = useState("default");
  const [openMenu, setOpenMenu] = useState(null);
  const [panelHeight, setPanelHeight] = useState(initialSettings.panelHeight || 240);
  const [sideWidth, setSideWidth] = useState(initialSettings.sideWidth || 260);
  const [secondarySideWidth, setSecondarySideWidth] = useState(initialSettings.secondarySideWidth || 280);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState(initialSettings.workspaceRoot || MOCK_ROOT);

  // Editor state
  const [code,     setCode]     = useState("");         // current editor content
  const [lang,     setLang]     = useState(initialSettings.lang || "javascript");
  const [theme,    setTheme]    = useState(initialSettings.theme || "vs-dark");
  const [fontSize, setFontSize] = useState(initialSettings.fontSize || 13);
  const [wordWrap, setWordWrap] = useState(initialSettings.wordWrap || "off");
  const [lineNumbers, setLineNumbers] = useState(initialSettings.lineNumbers ?? true);
  const [minimapEnabled, setMinimapEnabled] = useState(initialSettings.minimapEnabled ?? true);
  const [tabSize, setTabSize] = useState(initialSettings.tabSize || 2);
  const [showStartupSettings, setShowStartupSettings] = useState(initialSettings.showStartupSettings ?? true);
  const [aiEditMode, setAiEditMode] = useState(initialSettings.aiEditMode || "preview");
  const [tabs,     setTabs]     = useState([]);          // open file tabs
  const [activeTab,setActiveTab]= useState(null);        // current tab key (path)
  const [tabCode,  setTabCode]  = useState({});          // tabKey → content
  const [tabSavedCode,setTabSavedCode] = useState({});   // tabKey → last saved content
  const [dirtyTabs,setDirtyTabs] = useState({});          // tabKey → unsaved bool
  const [extTabData, setExtTabData] = useState({});      // tabKey → extension metadata
  const [extInstalled, setExtInstalled] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("wayai_ext_installed_v1") || "[]");
      return raw.map(x => (typeof x === "string" ? { id: x, name: x } : x));
    }
    catch { return []; }
  });

  // Accounts
  const [toast,  setToast]      = useState(null);
  const [detected,setDetected]  = useState([]);
  const [routerScores,setRS]    = useState({});
  const [routerStrategy,setRT]  = useState("balanced");
  const [accStatus, setAccStatus] = useState({accounts:[],activeId:null,active:null});
  const [outputLines, setOutputLines] = useState(["Way AI Code started", "Command Palette: Ctrl+Shift+P", "Toggle panel: Ctrl+`"]);
  const [gitBranch, setGitBranch] = useState("main");
  const [gitChangeCount, setGitChangeCount] = useState(0);
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const [problems, setProblems] = useState([]);
  const [tabCtxMenu, setTabCtxMenu] = useState(null); // { x, y, key }

  // ── Floating dock panels ───────────────────────────────────────────────────
  const wayaiDock    = useDockPanel("wayai",    { w: 500, h: 620 });
  const filesDock    = useDockPanel("files",    { w: 300, h: 540 });
  const gitDock      = useDockPanel("git",      { w: 300, h: 520 });
  const extDock      = useDockPanel("ext",      { w: 360, h: 640 });
  const accountsDock = useDockPanel("accounts", { w: 360, h: 560 });

  const [manager] = useState(()=>new AccountManager(st=>{
    setAccStatus(st);
    if(st.toast){ setToast({msg:st.toast,type:st.toastType||"info"}); setTimeout(()=>setToast(null),4500); }
  }));

  useEffect(()=>{
    (async () => {
      await manager.init();
      if (manager.getAll().length === 0) {
        await manager.add({provider:"ollama",  label:"Ollama Local",   model:"llama3.2",        apiKey:""});
        await manager.add({provider:"chatgpt", label:"GPT Account 1",  model:"gpt-4o-mini",     apiKey:""});
        await manager.add({provider:"chatgpt", label:"GPT Account 2",  model:"gpt-4o-mini",     apiKey:""});
        await manager.add({provider:"chatgpt", label:"GPT Account 3",  model:"gpt-4o-mini",     apiKey:""});
        await manager.add({provider:"chatgpt", label:"GPT Account 4",  model:"gpt-4o-mini",     apiKey:""});
        await manager.add({provider:"claude",  label:"Claude Pro 1",   model:"claude-haiku-4-5",apiKey:""});
        await manager.add({provider:"claude",  label:"Claude Pro 2",   model:"claude-haiku-4-5",apiKey:""});
        await manager.add({provider:"copilot", label:"GitHub Copilot", model:"gpt-4o",          apiKey:""});
      }
      setAccStatus(manager.getStatus());
    })();
  }, [manager]);

  useEffect(()=>{
    gitStatus(workspaceRoot || MOCK_ROOT).then(s => {
      if (s?.branch) setGitBranch(s.branch);
      const n = (s?.staged?.length||0) + (s?.unstaged?.length||0) + (s?.untracked?.length||0);
      setGitChangeCount(n);
    }).catch(()=>{});
  }, [workspaceRoot]);

  useEffect(() => {
    const collect = () => {
      const monaco = monacoRef.current;
      if (!monaco) return;
      try {
        const markers = monaco.editor.getModelMarkers({});
        setProblems(markers.filter(m => m.severity >= 4));
      } catch {}
    };
    const id = setInterval(collect, 2000);
    return () => clearInterval(id);
  }, []);

  // Auto-detect providers on mount
  useEffect(()=>{
    autoDetect(manager.getAll().reduce((o,a)=>({...o,[a.provider]:{apiKey:a.apiKey}}),{}))
      .then(list=>{
        setDetected(list);
        if(list.length){ setToast({msg:`✓ Auto-detected: ${list.map(d=>d.id).join(", ")}`,type:"ok"}); setTimeout(()=>setToast(null),3000); }
      });
    manager.router.pingAll(manager.getAll(),{}).then(s=>setRS({...s}));
    const t=setInterval(()=>manager.router.pingAll(manager.getAll(),{}).then(s=>setRS({...s})),30000);
    return ()=>clearInterval(t);
  },[manager]);

  useEffect(()=>{
    saveEditorSettings({
      lang,
      theme,
      fontSize,
      wordWrap,
      lineNumbers,
      minimapEnabled,
      tabSize,
      panelHeight,
      sideWidth,
      secondarySideWidth,
      workspaceRoot,
      aiEditMode,
      activity,
      showStartupSettings,
    });
  }, [lang, theme, fontSize, wordWrap, lineNumbers, minimapEnabled, tabSize, panelHeight, sideWidth, secondarySideWidth, workspaceRoot, aiEditMode, activity, showStartupSettings]);

  useEffect(() => {
    if (showStartupSettings) setSettingsOpen(true);
  }, [showStartupSettings]);

  useEffect(()=>{ accStatusRef.current = accStatus; }, [accStatus]);
  useEffect(()=>{ routerScoresRef.current = routerScores; }, [routerScores]);
  useEffect(()=>{ activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(()=>{ tabCodeRef.current = tabCode; }, [tabCode]);

  const clearInlineDiff = useCallback(() => {
    const current = inlineDiffRef.current;
    if (!current) return;
    try { current.decorations?.clear(); } catch {}
    try { current.editor?.removeContentWidget(current.widget); } catch {}
    inlineDiffRef.current = null;
  }, []);

  const showInlineDiff = useCallback(({ range, original, replacement }) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model || !range || !replacement) return;

    const editRange = new monaco.Range(
      range.startLineNumber,
      range.startColumn,
      range.endLineNumber,
      range.endColumn,
    );
    if (model.getValueInRange(editRange) !== original) {
      setToast({ msg:"Selection changed before AI diff was ready", type:"warn" });
      setTimeout(()=>setToast(null), 3000);
      return;
    }

    clearInlineDiff();
    const decorations = editor.createDecorationsCollection([{
      range: editRange,
      options: {
        className: "ai-diff-remove",
        inlineClassName: "ai-diff-remove-inline",
      },
    }]);

    const node = document.createElement("div");
    node.className = "ai-diff-widget";
    const head = document.createElement("div");
    head.className = "ai-diff-head";
    const title = document.createElement("span");
    title.textContent = "AI replacement preview";
    const actions = document.createElement("div");
    actions.className = "ai-diff-actions";
    const accept = document.createElement("button");
    accept.className = "ai-diff-accept";
    accept.textContent = "Accept";
    const reject = document.createElement("button");
    reject.className = "ai-diff-reject";
    reject.textContent = "Reject";
    const pre = document.createElement("pre");
    pre.className = "ai-diff-pre";
    pre.textContent = replacement;
    actions.append(accept, reject);
    head.append(title, actions);
    node.append(head, pre);

    const widget = {
      getId: () => "way.inlineDiff.preview",
      getDomNode: () => node,
      getPosition: () => ({
        position: { lineNumber: editRange.endLineNumber, column: editRange.endColumn },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };

    accept.onclick = () => {
      editor.executeEdits("way-ai-diff", [{ range: editRange, text: replacement }]);
      clearInlineDiff();
      editor.focus();
    };
    reject.onclick = () => {
      clearInlineDiff();
      editor.focus();
    };

    editor.addContentWidget(widget);
    editor.revealLineInCenterIfOutsideViewport(editRange.endLineNumber);
    inlineDiffRef.current = { editor, decorations, widget };
  }, [clearInlineDiff]);

  const setupInlineCompletions = useCallback((monaco) => {
    if (!monaco || completionDisposablesRef.current.length) return;

    const provider = {
      provideInlineCompletions: async (model, position, context, token) => {
        const active = accStatusRef.current?.active;
        const prov = PROVIDERS[active?.provider];
        if (!active || (!prov?.local && !active.apiKey)) return { items: [], dispose: () => {} };
        if (prov.local && routerScoresRef.current?.[active.provider]?.healthy !== true) {
          return { items: [], dispose: () => {} };
        }

        const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        if (linePrefix.trim().length < 3) return { items: [], dispose: () => {} };

        const startLine = Math.max(1, position.lineNumber - 60);
        const endLine = Math.min(model.getLineCount(), position.lineNumber + 20);
        const before = model.getValueInRange(new monaco.Range(startLine, 1, position.lineNumber, position.column));
        const after = model.getValueInRange(new monaco.Range(position.lineNumber, position.column, endLine, model.getLineMaxColumn(endLine)));
        const key = `${active.id}:${model.getLanguageId()}:${before.slice(-700)}:${after.slice(0,250)}`;
        const cache = autocompleteCacheRef.current;
        const now = Date.now();
        if (cache.key === key && now - cache.at < 10000 && cache.value) {
          return {
            items: [{ insertText: cache.value, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }],
            dispose: () => {},
          };
        }
        if (now - cache.at < 1200) return { items: [], dispose: () => {} };
        autocompleteCacheRef.current = { key, at: now, value: "" };

        const prompt = [
          "You are an inline code completion engine.",
          "Return only the next code continuation, no markdown, max 6 lines.",
          `Language: ${model.getLanguageId()}`,
          "Before cursor:",
          "```",
          before,
          "```",
          "After cursor:",
          "```",
          after,
          "```",
        ].join("\n");

        try {
          const { result } = await manager.call(prompt);
          if (token?.isCancellationRequested) return { items: [], dispose: () => {} };
          const suggestion = extractFirstCodeBlock(result).replace(/\r\n/g, "\n").split("\n").slice(0, 6).join("\n");
          if (!suggestion || suggestion.length > 2000) return { items: [], dispose: () => {} };
          autocompleteCacheRef.current = { key, at: Date.now(), value: suggestion };
          return {
            items: [{ insertText: suggestion, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }],
            dispose: () => {},
          };
        } catch {
          return { items: [], dispose: () => {} };
        }
      },
      freeInlineCompletions: () => {},
    };

    completionDisposablesRef.current = LANGS.map(language =>
      monaco.languages.registerInlineCompletionsProvider(language, provider)
    );
  }, [manager]);

  useEffect(() => () => {
    clearInlineDiff();
    completionDisposablesRef.current.forEach(d => d.dispose?.());
    completionDisposablesRef.current = [];
  }, [clearInlineDiff]);

  // ── Open file from FileExplorer ───────────────────────────────────────────────
  const handleOpenFile = useCallback(({ name, path, lang: fl, content }) => {
    const key = path || name;  // use full path as unique tab key
    setTabs(prev => {
      if (prev.find(t => t.key === key)) return prev;
      return [...prev, { key, name, lang: fl }];
    });
    setActiveTab(key);
    setLang(fl);
    setCode(content);
    setTabCode(prev => ({ ...prev, [key]: content }));
    setTabSavedCode(prev => ({ ...prev, [key]: content }));
    setDirtyTabs(prev => ({ ...prev, [key]: false }));
  }, []);

  const handleOpenExtension = useCallback((ext) => {
    if (!ext?.id) return;
    const key = `ext::${ext.id}`;
    const exists = tabs.find(t => t.key === key);
    if (exists) {
      setActiveTab(key);
      return;
    }
    setTabs(prev => [...prev, { key, name: ext.name, lang: "extension", isExtension: true }]);
    setExtTabData(prev => ({ ...prev, [key]: ext }));
    setActiveTab(key);
  }, [tabs]);

  // ── Switch tab ────────────────────────────────────────────────────────────────
  const switchTab = useCallback((key) => {
    const t = tabs.find(t => t.key === key);
    if (!t) return;
    setActiveTab(key);
    setLang(t.lang || "javascript");
    setCode(tabCode[key] || "");
  }, [tabs, tabCode]);

  // ── Close tab ─────────────────────────────────────────────────────────────────
  const closeTab = useCallback((key) => {
    // Dispose Monaco model to prevent memory leaks
    if (monacoRef.current) {
      const model = monacoRef.current.editor.getModels().find(m => m.uri.path === `/${key}` || m.uri.toString().endsWith(key));
      if (model) { try { model.dispose(); } catch {} }
    }
    const remaining = tabs.filter(t => t.key !== key);
    setTabs(remaining);
    setTabCode(prev => { const next = {...prev}; delete next[key]; return next; });
    setTabSavedCode(prev => { const next = {...prev}; delete next[key]; return next; });
    setDirtyTabs(prev => { const next = {...prev}; delete next[key]; return next; });
    setExtTabData(prev => { const next = {...prev}; delete next[key]; return next; });
    if (activeTab === key) {
      if (remaining.length) {
        const last = remaining[remaining.length - 1];
        setActiveTab(last.key);
        if (!last.isExtension) {
          setLang(last.lang || "javascript");
          setCode(tabCode[last.key] || "");
        }
      } else {
        setActiveTab(null);
        setCode("");
      }
    }
  }, [tabs, activeTab, tabCode]);

  useEffect(() => {
    const onInstalledChanged = () => {
      try { setExtInstalled(JSON.parse(localStorage.getItem("wayai_ext_installed_v1") || "[]")); }
      catch { setExtInstalled([]); }
    };
    window.addEventListener("wayai-ext-installed-changed", onInstalledChanged);
    return () => window.removeEventListener("wayai-ext-installed-changed", onInstalledChanged);
  }, []);

  // ── Code change + auto-save ───────────────────────────────────────────────────
  const saveTimer = useRef(null);
  const handleCodeChange = useCallback((val) => {
    const nextVal = val || "";
    setCode(nextVal);
    if (activeTab) {
      const path = activeTab;
      setTabCode(prev => ({ ...prev, [path]: nextVal }));
      setDirtyTabs(prev => ({ ...prev, [path]: nextVal !== (tabSavedCode[path] ?? "") }));
      if (suppressAutoSaveRef.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        writeFile(path, nextVal).then(() => {
          if (tabCodeRef.current[path] === nextVal) {
            setTabSavedCode(prev => ({ ...prev, [path]: nextVal }));
            setDirtyTabs(prev => ({ ...prev, [path]: false }));
          }
        }).catch(() => {
          setDirtyTabs(prev => ({ ...prev, [path]: true }));
        });
      }, 1200);
    }
  }, [activeTab, tabSavedCode]);

  const pushOutput = useCallback((line) => {
    const stamp = new Date().toLocaleTimeString();
    setOutputLines(prev => [...prev.slice(-199), `[${stamp}] ${line}`]);
  }, []);

  const openPanel = useCallback((tab = "terminal") => {
    setPanelActive(tab);
    setPanelOpen(true);
  }, []);

  const saveActiveFile = useCallback(async () => {
    if (!activeTab) {
      pushOutput("Save skipped: no active file");
      return;
    }
    try {
      await writeFile(activeTab, code);
      setTabSavedCode(prev => ({ ...prev, [activeTab]: code }));
      setDirtyTabs(prev => ({ ...prev, [activeTab]: false }));
      pushOutput(`Saved ${activeTab}`);
      setToast({msg:`Saved ${tabs.find(t=>t.key===activeTab)?.name || activeTab}`,type:"ok"});
      setTimeout(()=>setToast(null),1800);
    } catch(e) {
      pushOutput(`Save failed: ${String(e?.message || e)}`);
      setToast({msg:"Save failed",type:"warn"});
      setTimeout(()=>setToast(null),2500);
    }
  }, [activeTab, code, pushOutput, tabs]);

  const runTask = useCallback((label, command) => {
    openPanel("terminal");
    pushOutput(`Task selected: ${label} (${command})`);
    setToast({msg:`Run in terminal: ${command}`,type:"info"});
    setTimeout(()=>setToast(null),3000);
  }, [openPanel, pushOutput]);

  const formatActiveFile = useCallback(() => {
    if (!isExtensionEnabled("prettier")) {
      setToast({msg:"Enable Prettier in Extensions to format",type:"warn"});
      setTimeout(()=>setToast(null),2500);
      return;
    }
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    let next = model.getValue();
    try {
      if (lang === "json") next = JSON.stringify(JSON.parse(next), null, 2) + "\n";
      else next = next.split("\n").map(line=>line.replace(/[ \t]+$/,"")).join("\n");
    } catch(e) {
      setToast({msg:`Format failed: ${String(e?.message || e)}`,type:"warn"});
      setTimeout(()=>setToast(null),3000);
      return;
    }

    if (next === model.getValue()) {
      pushOutput("Format document: no changes");
      return;
    }
    editor.executeEdits("way-format", [{ range:model.getFullModelRange(), text:next }]);
    pushOutput(`Formatted ${tabs.find(t=>t.key===activeTab)?.name || activeTab || "document"}`);
  }, [activeTab, lang, pushOutput, tabs]);

  const runAiEdit = useCallback(async (label, instruction) => {
    if (!isExtensionEnabled("way-ai")) {
      setToast({msg:"Enable Way AI Tools in Extensions",type:"warn"});
      setTimeout(()=>setToast(null),2500);
      return;
    }
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) return;
    const original = model.getValueInRange(selection);
    if (!original.trim()) {
      setToast({msg:"Select code before running AI edit",type:"warn"});
      setTimeout(()=>setToast(null),2500);
      return;
    }
    openPanel("output");
    pushOutput(`AI edit started: ${label}`);
    try {
      const prompt = `${instruction}. Return only complete replacement code, no explanation.\n\nLanguage: ${lang}\n\n\`\`\`${lang}\n${original}\n\`\`\``;
      const { result, account } = await manager.call(prompt);
      const replacement = extractFirstCodeBlock(result);
      if (!replacement) throw new Error("AI returned an empty replacement");
      if (aiEditMode === "apply") {
        editor.executeEdits("way-ai-auto-edit", [{ range: selection, text: replacement }]);
        pushOutput(`AI edit applied from ${account.label}: ${label}`);
        setToast({msg:"AI edit applied",type:"ok"});
        setTimeout(()=>setToast(null),1800);
      } else {
        showInlineDiff({ range:rangeToPlain(selection), original, replacement });
        pushOutput(`AI edit preview ready from ${account.label}: ${label}`);
      }
    } catch(e) {
      pushOutput(`AI edit failed: ${String(e?.message || e)}`);
      setToast({msg:"AI edit failed",type:"warn"});
      setTimeout(()=>setToast(null),3000);
    }
  }, [aiEditMode, lang, manager, openPanel, pushOutput, showInlineDiff]);

  // ── Sidebar content ───────────────────────────────────────────────────────────
  const sideContent = () => {
    switch (activity) {
      case "files":
        if (filesDock.detached) return <DockPlaceholder title="Explorer" onDock={filesDock.dock}/>;
        return (
          <ErrorBoundary key="files">
            <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
              <PanelHeader title="EXPLORER" onDetach={filesDock.undock}/>
              <div style={{flex:1,overflow:"hidden",minHeight:0}}><FileExplorer onOpenFile={handleOpenFile} activeFile={activeTab} onRootChange={setWorkspaceRoot}/></div>
              {/* Outline section */}
              <details className="outline-panel" open>
                <summary className="outline-header">OUTLINE {symbolItems.length ? `(${symbolItems.length})` : ""}</summary>
                <div className="outline-list">
                  {symbolItems.length === 0
                    ? <div className="outline-empty">{activeTab ? "No symbols found" : "No file open"}</div>
                    : symbolItems.map((sym, i) => (
                        <div key={i} className={`outline-item outline-${sym.kind}${currentSymbol === sym ? " outline-active" : ""}`}
                          onClick={() => revealLine(sym.line)} title={`${sym.kind} — line ${sym.line}`}>
                          <span className="outline-icon">{sym.kind === "class" ? "C" : sym.kind === "function" ? "ƒ" : sym.kind === "hook" ? "⚓" : "◇"}</span>
                          <span className="outline-name">{sym.name}</span>
                          <span className="outline-line">{sym.line}</span>
                        </div>
                      ))
                  }
                </div>
              </details>
            </div>
          </ErrorBoundary>
        );
      case "search":
        return <ErrorBoundary key="search"><SearchPanel code={code} workspaceRoot={workspaceRoot} onOpenFile={handleOpenFile} revealLine={revealLine} theme={theme} setTheme={setTheme} fontSize={fontSize} setFontSize={setFontSize} wordWrap={wordWrap} setWordWrap={setWordWrap} lineNumbers={lineNumbers} setLineNumbers={setLineNumbers} minimapEnabled={minimapEnabled} setMinimapEnabled={setMinimapEnabled} tabSize={tabSize} setTabSize={setTabSize} onOpenSettings={()=>setSettingsOpen(true)}/></ErrorBoundary>;
      case "git":
        if (gitDock.detached) return <DockPlaceholder title="Source Control" onDock={gitDock.dock}/>;
        return (
          <ErrorBoundary key="git">
            <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
              <PanelHeader title="SOURCE CONTROL" onDetach={gitDock.undock}/>
              <div style={{flex:1,overflow:"hidden"}}><GitPanel workspaceRoot={workspaceRoot} manager={manager}/></div>
            </div>
          </ErrorBoundary>
        );
      case "ext":
        if (extDock.detached) return <DockPlaceholder title="Extensions" onDock={extDock.dock}/>;
        return <ErrorBoundary key="ext"><ExtPanel workspaceRoot={workspaceRoot} activeFile={activeTab} onOpenSide={id=>{setActivity(id);setSideOpen(true);}} onOutput={line=>{openPanel("output");pushOutput(line);}} manager={manager} onDetach={extDock.undock} onOpenExtension={handleOpenExtension}/></ErrorBoundary>;
      case "accounts":
        if (accountsDock.detached) return <DockPlaceholder title="Accounts" onDock={accountsDock.dock}/>;
        return (
          <ErrorBoundary key="accounts">
            <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
              <PanelHeader title="ACCOUNTS" onDetach={accountsDock.undock}/>
              <div style={{flex:1,overflow:"auto"}}><AccountsPanel manager={manager} status={accStatus} refresh={()=>setAccStatus(manager.getStatus())} routerScores={routerScores} routerStrategy={routerStrategy} onStrategy={s=>{setRT(s);manager.router.setStrategy(s);}} onToast={setToast}/></div>
            </div>
          </ErrorBoundary>
        );
      case "chat":
        return <ErrorBoundary key="chat"><ChatPanel manager={manager} status={accStatus} editorRef={editorRef} lang={lang} code={code} onProposeEdit={showInlineDiff} tabs={tabs} tabCode={tabCode}/></ErrorBoundary>;
      case "wayai":
        if (wayaiDock.detached) return <DockPlaceholder title="Way AI Agent" onDock={wayaiDock.dock}/>;
        return (
          <ErrorBoundary key="wayai">
            <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
              <PanelHeader title="WAY AI AGENT" onDetach={wayaiDock.undock}/>
              <div style={{flex:1,overflow:"hidden"}}><WayAITab manager={manager} accStatus={accStatus} editorRef={editorRef} code={code} lang={lang} projectRoot={workspaceRoot} activeFile={activeTab} openFiles={tabs.map(t=>t.key)}/></div>
            </div>
          </ErrorBoundary>
        );
      default: return null;
    }
  };

  const switchAct = id => { if(activity===id) setSideOpen(o=>!o); else { setActivity(id); setSideOpen(true); } };
  const openSide = id => { setActivity(id); setSideOpen(true); };

  const activeFileCode = activeTab ? (tabCode[activeTab] ?? code) : code;

  const symbolItems = useMemo(() => {
    if (!activeFileCode) return [];
    const lines = activeFileCode.split("\n");
    const items = [];
    const patterns = [
      { kind: "function", re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
      { kind: "class", re: /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/ },
      { kind: "const", re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/ },
      { kind: "const", re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*\{/ },
      { kind: "hook", re: /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*use[A-Z]/ },
    ];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of patterns) {
        const m = line.match(p.re);
        if (m?.[1]) {
          items.push({ name: m[1], kind: p.kind, line: i + 1 });
          break;
        }
      }
      if (items.length >= 120) break;
    }
    return items;
  }, [activeFileCode]);

  const currentSymbol = useMemo(() => {
    if (!symbolItems.length || !cursor.ln) return null;
    let best = null;
    for (const sym of symbolItems) {
      if (sym.line <= cursor.ln) best = sym;
    }
    return best;
  }, [symbolItems, cursor.ln]);

  const revealLine = useCallback((line) => {
    const editor = editorRef.current;
    if (!editor || !line) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, []);

  const goToProblem = useCallback((filePath, line) => {
    if (filePath) handleOpenFile({ path: filePath, name: filePath.split(/[\\/]/).pop() });
    if (line) setTimeout(() => revealLine(line), filePath ? 300 : 0);
  }, [revealLine]);

  const applyLayoutMode = useCallback((mode) => {
    setLayoutMode(mode);
    if (mode === "default") {
      setSideOpen(true);
      setPanelOpen(true);
      setSecondarySideOpen(false);
      return;
    }
    if (mode === "focus") {
      setSideOpen(true);
      setPanelOpen(false);
      setSecondarySideOpen(true);
      return;
    }
    if (mode === "zen") {
      setSideOpen(false);
      setPanelOpen(false);
      setSecondarySideOpen(false);
    }
  }, []);

  // Keep refs in sync so startSideResize closure never captures stale widths
  sideWidthRef.current = sideWidth;
  secondarySideWidthRef.current = secondarySideWidth;

  const startSideResize = useCallback((which, e) => {
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX,
      startWidth: which === "primary" ? sideWidthRef.current : secondarySideWidthRef.current,
      side: which,
    };
    const min = 220;
    const max = which === "primary" ? 520 : 500;

    const onMove = (ev) => {
      const { x, startWidth, side } = dragStartRef.current;
      const delta = ev.clientX - x;
      const next = side === "primary" ? startWidth + delta : startWidth - delta;
      const clamped = Math.max(min, Math.min(max, next));
      if (side === "primary") setSideWidth(clamped);
      else setSecondarySideWidth(clamped);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      sideResizeMoveRef.current = null;
      sideResizeUpRef.current = null;
    };

    sideResizeMoveRef.current = onMove;
    sideResizeUpRef.current = onUp;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Cleanup resize listeners if component unmounts mid-drag
  useEffect(() => () => {
    if (sideResizeMoveRef.current) window.removeEventListener("mousemove", sideResizeMoveRef.current);
    if (sideResizeUpRef.current) window.removeEventListener("mouseup", sideResizeUpRef.current);
  }, []);

  useEffect(() => {
    const onDown = (e) => {
      if (!menuBarRef.current?.contains(e.target)) setOpenMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const closeActiveTab = useCallback(() => {
    if (activeTab) closeTab(activeTab);
  }, [activeTab, closeTab]);

  const runMenuAction = useCallback((action) => {
    action?.();
    setOpenMenu(null);
  }, []);

  const MENU_GROUPS = useMemo(() => ([
    {
      label: "File",
      items: [
        { label: "New File",           shortcut: "Ctrl+N",       action: () => {} },
        { label: "New Window",         shortcut: "Ctrl+Shift+N", action: () => {} },
        { separator: true },
        { label: "Open File…",         shortcut: "Ctrl+O",       action: () => {} },
        { label: "Open Folder…",       shortcut: "Ctrl+K Ctrl+O",action: () => openSide("files") },
        { separator: true },
        { label: "Save",               shortcut: "Ctrl+S",       action: saveActiveFile },
        { label: "Save All",           shortcut: "Ctrl+K S",     action: saveActiveFile },
        { separator: true },
        { label: "Close Editor",       shortcut: "Ctrl+W",       action: closeActiveTab },
        { label: "Close All Editors",                            action: () => {} },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo",               shortcut: "Ctrl+Z",       action: () => editorRef.current?.trigger("keyboard","undo",null) },
        { label: "Redo",               shortcut: "Ctrl+Y",       action: () => editorRef.current?.trigger("keyboard","redo",null) },
        { separator: true },
        { label: "Cut",                shortcut: "Ctrl+X",       action: () => document.execCommand("cut") },
        { label: "Copy",               shortcut: "Ctrl+C",       action: () => document.execCommand("copy") },
        { label: "Paste",              shortcut: "Ctrl+V",       action: () => document.execCommand("paste") },
        { separator: true },
        { label: "Find",               shortcut: "Ctrl+F",       action: () => editorRef.current?.trigger("keyboard","actions.find",null) },
        { label: "Replace",            shortcut: "Ctrl+H",       action: () => editorRef.current?.trigger("keyboard","editor.action.startFindReplaceAction",null) },
        { separator: true },
        { label: "Format Document",    shortcut: "Shift+Alt+F",  action: formatActiveFile },
        { label: `Word Wrap: ${wordWrap === "on" ? "On" : "Off"}`,                action: () => setWordWrap(w => w === "on" ? "off" : "on") },
      ],
    },
    {
      label: "Selection",
      items: [
        { label: "AI Fix Selected Code", action: () => runAiEdit("Fix selected code", "Fix bugs and correctness issues in this code") },
        { label: "AI Refactor Selected Code", action: () => runAiEdit("Refactor selected code", "Refactor this code for clarity, maintainability, and best practices") },
        { label: "AI Comment Selected Code", action: () => runAiEdit("Comment selected code", "Add concise useful comments to this code") },
      ],
    },
    {
      label: "View",
      items: [
        { label: sideOpen ? "Hide Primary Sidebar" : "Show Primary Sidebar", action: () => setSideOpen(v => !v) },
        { label: panelOpen ? "Hide Panel" : "Show Panel", action: () => setPanelOpen(v => !v) },
        { label: secondarySideOpen ? "Hide Secondary Sidebar" : "Show Secondary Sidebar", action: () => setSecondarySideOpen(v => !v) },
        { separator: true },
        { label: "Explorer", action: () => openSide("files") },
        { label: "Search", action: () => openSide("search") },
        { label: "Source Control", action: () => openSide("git") },
      ],
    },
    {
      label: "Go",
      items: [
        { label: "Go to File", action: () => { setCmdOpen(true); } },
        { label: "Go to Explorer", action: () => openSide("files") },
        { label: "Go to Chat", action: () => openSide("chat") },
      ],
    },
    {
      label: "Run",
      items: [
        { label: "Run npm dev", action: () => runTask("npm dev", "npm run dev") },
        { label: "Run npm build", action: () => runTask("npm build", "npm run build") },
        { label: "Run cargo check", action: () => runTask("cargo check", "cargo check") },
      ],
    },
    {
      label: "Terminal",
      items: [
        { label: "Focus Terminal", shortcut: "Ctrl+`", action: () => openPanel("terminal") },
        { label: panelOpen ? "Hide Panel" : "Show Panel", action: () => setPanelOpen(v => !v) },
        { label: "Focus Output", action: () => openPanel("output") },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Keyboard Shortcuts", action: () => { setToast({ msg: "Ctrl+Shift+P, Ctrl+S, Shift+Alt+F, Ctrl+`", type: "info" }); setTimeout(() => setToast(null), 2600); } },
        { label: "About Way AI Code", action: () => { setToast({ msg: "Way AI Code workbench", type: "info" }); setTimeout(() => setToast(null), 2200); } },
      ],
    },
  ]), [
    closeActiveTab,
    formatActiveFile,
    openPanel,
    openSide,
    panelOpen,
    runAiEdit,
    runTask,
    saveActiveFile,
    secondarySideOpen,
    sideOpen,
    wordWrap,
  ]);

  const commands = [
    { id:"file.save", title:"File: Save", group:"File", detail:"Ctrl+S", run:saveActiveFile },
    { id:"view.explorer", title:"View: Explorer", group:"View", run:()=>openSide("files") },
    { id:"view.search", title:"View: Search", group:"View", run:()=>openSide("search") },
    { id:"view.git", title:"View: Source Control", group:"View", run:()=>openSide("git") },
    { id:"view.extensions", title:"View: Extensions", group:"View", run:()=>openSide("ext") },
    { id:"view.chat", title:"View: AI Chat", group:"View", run:()=>openSide("chat") },
    { id:"view.wayai", title:"View: Way AI", group:"View", run:()=>openSide("wayai") },
    { id:"view.accounts", title:"View: Accounts", group:"View", run:()=>openSide("accounts") },
    { id:"panel.terminal", title:"Panel: Focus Terminal", group:"Panel", detail:"Ctrl+`", run:()=>openPanel("terminal") },
    { id:"panel.problems", title:"Panel: Show Problems", group:"Panel", run:()=>openPanel("problems") },
    { id:"panel.output", title:"Panel: Show Output", group:"Panel", run:()=>openPanel("output") },
    { id:"panel.debug", title:"Panel: Show Debug Console", group:"Panel", run:()=>openPanel("debug") },
    { id:"panel.ports", title:"Panel: Show Ports", group:"Panel", run:()=>openPanel("ports") },
    { id:"editor.wrap", title:`Editor: ${wordWrap==="on"?"Disable":"Enable"} Word Wrap`, group:"Editor", run:()=>setWordWrap(w=>w==="on"?"off":"on") },
    { id:"editor.format", title:"Editor: Format Document", group:"Editor", detail:"Shift+Alt+F", run:formatActiveFile },
    { id:"ai.fix", title:"AI: Fix Selected Code", group:"AI", run:()=>runAiEdit("Fix selected code","Fix bugs and correctness issues in this code") },
    { id:"ai.refactor", title:"AI: Refactor Selected Code", group:"AI", run:()=>runAiEdit("Refactor selected code","Refactor this code for clarity, maintainability, and best practices") },
    { id:"ai.comment", title:"AI: Comment Selected Code", group:"AI", run:()=>runAiEdit("Comment selected code","Add concise useful comments to this code") },
    { id:"ai.mode.preview", title:"AI Edit Mode: Preview Diff", group:"AI", run:()=>setAiEditMode("preview") },
    { id:"ai.mode.apply", title:"AI Edit Mode: Auto Apply", group:"AI", run:()=>setAiEditMode("apply") },
    { id:"theme.dark", title:"Preferences: Color Theme Dark", group:"Preferences", run:()=>setTheme("vs-dark") },
    { id:"theme.light", title:"Preferences: Color Theme Light", group:"Preferences", run:()=>setTheme("vs-light") },
    { id:"task.dev", title:"Tasks: Run npm dev", group:"Tasks", detail:"npm run dev", run:()=>runTask("npm dev","npm run dev") },
    { id:"task.build", title:"Tasks: Run npm build", group:"Tasks", detail:"npm run build", run:()=>runTask("npm build","npm run build") },
    { id:"task.cargo", title:"Tasks: Run cargo check", group:"Tasks", detail:"cargo check", run:()=>runTask("cargo check","cargo check") },
  ];

  useEffect(() => {
    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if (e.ctrlKey && e.shiftKey && key === "p") {
        e.preventDefault(); setCmdOpen(true);
      } else if (e.ctrlKey && key === "p" && !e.shiftKey) {
        e.preventDefault(); setCmdOpen(true);
      } else if (e.ctrlKey && e.key === "`") {
        e.preventDefault(); setPanelOpen(p => !p); setPanelActive("terminal");
      } else if (e.ctrlKey && key === "j") {
        e.preventDefault(); setPanelOpen(p => !p);
      } else if (e.ctrlKey && key === "b") {
        e.preventDefault(); setSideOpen(p => !p);
      } else if (e.ctrlKey && key === "s") {
        e.preventDefault(); saveActiveFile();
      } else if (e.shiftKey && e.altKey && key === "f") {
        e.preventDefault(); formatActiveFile();
      } else if (e.ctrlKey && key === "w") {
        e.preventDefault(); if (activeTabRef.current) closeTab(activeTabRef.current);
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        setTabs(ts => {
          if (ts.length < 2) return ts;
          const idx = ts.findIndex(t => t.key === activeTabRef.current);
          const next = e.shiftKey ? (idx - 1 + ts.length) % ts.length : (idx + 1) % ts.length;
          switchTab(ts[next].key);
          return ts;
        });
      } else if (e.ctrlKey && key === "g") {
        e.preventDefault();
        const line = parseInt(prompt("Go to line:"), 10);
        if (!isNaN(line)) revealLine(line);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActiveFile, formatActiveFile, closeTab, switchTab, revealLine]);

  const prov        = PROVIDERS[accStatus.active?.provider];
  const accentColor = prov?.color || "#0078d4";

  const ACTS_TOP = [
    {id:"files",    Ico:Ic.Files,    title:"Explorer"},
    {id:"search",   Ico:Ic.Search,   title:"Search"},
    {id:"git",      Ico:Ic.Git,      title:"Source Control"},
    {id:"ext",      Ico:Ic.Ext,      title:"Extensions"},
  ];
  const ACTS_BTM = [
    {id:"chat",     Ico:Ic.Chat,     title:"AI Chat"},
    {id:"wayai",    Ico:Ic.WayAI,    title:"Way AI Agent"},
    {id:"accounts", Ico:Ic.Accounts, title:"Accounts"},
  ];

  // sidebar title
  const SIDE_TITLES = { files:"EXPLORER",search:"SEARCH",git:"SOURCE CONTROL",ext:"EXTENSIONS",chat:"AI CHAT",wayai:"WAY AI",accounts:"ACCOUNTS" };

  return (
    <div className="app">
      {/* Toast */}
      {toast && <div className={`toast ${toast.type||"info"}`} onClick={()=>setToast(null)}>{toast.msg}</div>}
      <CommandPalette open={cmdOpen} commands={commands} onClose={()=>setCmdOpen(false)}/>

      {settingsOpen && (
        <div className="settings-modal-overlay" onClick={()=>setSettingsOpen(false)}>
          <div className="settings-modal" onClick={e=>e.stopPropagation()}>
            <div className="settings-modal-head">
              <div className="settings-modal-title">Quick Settings</div>
              <button className="settings-close" onClick={()=>setSettingsOpen(false)}>×</button>
            </div>
            <div className="settings-modal-body">
              <label className="settings-row">
                <span>Default Sidebar</span>
                <select value={activity} onChange={e=>{ setActivity(e.target.value); setSideOpen(true); }}>
                  <option value="search">Search</option>
                  <option value="files">Explorer</option>
                  <option value="git">Source Control</option>
                  <option value="ext">Extensions</option>
                  <option value="chat">AI Chat</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Theme</span>
                <select value={theme} onChange={e=>setTheme(e.target.value)}>
                  <option value="vs-dark">Dark</option>
                  <option value="vs-light">Light</option>
                  <option value="hc-black">HC Black</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Font Size</span>
                <input type="range" min="11" max="24" step="1" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} />
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={wordWrap==="on"} onChange={e=>setWordWrap(e.target.checked?"on":"off")} />
                <span>Word Wrap</span>
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={lineNumbers} onChange={e=>setLineNumbers(e.target.checked)} />
                <span>Line Numbers</span>
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={minimapEnabled} onChange={e=>setMinimapEnabled(e.target.checked)} />
                <span>Minimap</span>
              </label>
              <label className="settings-row">
                <span>Tab Size</span>
                <select value={tabSize} onChange={e=>setTabSize(Number(e.target.value))}>
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                  <option value={8}>8 spaces</option>
                </select>
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={showStartupSettings} onChange={e=>setShowStartupSettings(e.target.checked)} />
                <span>Show this popup on startup</span>
              </label>
            </div>
            <div className="settings-modal-foot">
              <button className="btn-primary" onClick={()=>setSettingsOpen(false)}>Save & Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Panels (rendered at root level, position:fixed) ─────── */}
      <FloatingPanel id="files" title="Explorer" icon={<Ic.Files/>}
        detached={filesDock.detached} pos={filesDock.pos} setPos={filesDock.setPos}
        size={filesDock.size} setSize={filesDock.setSize} onDock={filesDock.dock} minW={240} minH={300}>
        <FileExplorer onOpenFile={handleOpenFile} activeFile={activeTab} onRootChange={setWorkspaceRoot}/>
      </FloatingPanel>

      <FloatingPanel id="git" title="Source Control" icon={<Ic.Git/>}
        detached={gitDock.detached} pos={gitDock.pos} setPos={gitDock.setPos}
        size={gitDock.size} setSize={gitDock.setSize} onDock={gitDock.dock} minW={260} minH={300}>
        <GitPanel workspaceRoot={workspaceRoot} manager={manager}/>
      </FloatingPanel>

      <FloatingPanel id="ext" title="Extensions" icon={<Ic.Ext/>}
        detached={extDock.detached} pos={extDock.pos} setPos={extDock.setPos}
        size={extDock.size} setSize={extDock.setSize} onDock={extDock.dock} minW={300} minH={360}>
        <ExtPanel workspaceRoot={workspaceRoot} activeFile={activeTab} onOpenSide={id=>{setActivity(id);setSideOpen(true);extDock.dock();}} onOutput={line=>{openPanel("output");pushOutput(line);}} manager={manager} onOpenExtension={handleOpenExtension}/>
      </FloatingPanel>

      <FloatingPanel id="accounts" title="Accounts" icon={<Ic.Accounts/>}
        detached={accountsDock.detached} pos={accountsDock.pos} setPos={accountsDock.setPos}
        size={accountsDock.size} setSize={accountsDock.setSize} onDock={accountsDock.dock} minW={280} minH={320}>
        <AccountsPanel manager={manager} status={accStatus} refresh={()=>setAccStatus(manager.getStatus())} routerScores={routerScores} routerStrategy={routerStrategy} onStrategy={s=>{setRT(s);manager.router.setStrategy(s);}} onToast={setToast}/>
      </FloatingPanel>

      <FloatingPanel id="wayai" title="Way AI Agent" icon={<Ic.WayAI/>}
        detached={wayaiDock.detached} pos={wayaiDock.pos} setPos={wayaiDock.setPos}
        size={wayaiDock.size} setSize={wayaiDock.setSize} onDock={wayaiDock.dock} minW={340} minH={420}>
        <WayAITab manager={manager} accStatus={accStatus} editorRef={editorRef} code={code} lang={lang} projectRoot={workspaceRoot} activeFile={activeTab} openFiles={tabs.map(t=>t.key)}/>
      </FloatingPanel>

      {/* Workbench */}
      <div className="workbench">
        {/* Activity Bar */}
        <div className="act-bar">
          {ACTS_TOP.map(({id,Ico,title})=>{
            const badge = id==="git" ? gitChangeCount : id==="search" ? problems.filter(p=>p.severity===8).length : 0;
            return (
              <button key={id} title={title}
                className={`act-btn ${activity===id&&sideOpen?"act-on":""}`}
                onClick={()=>switchAct(id)}>
                <Ico/>
                {badge > 0 && <span className="act-badge">{badge > 99 ? "99+" : badge}</span>}
              </button>
            );
          })}
          <div className="act-spacer"/>
          {ACTS_BTM.map(({id,Ico,title})=>(
            <button key={id} title={title}
              className={`act-btn ${activity===id&&sideOpen?"act-on":""}`}
              onClick={()=>switchAct(id)}>
              <Ico/>
            </button>
          ))}
          <button title="Settings" className="act-btn" onClick={()=>setSettingsOpen(true)}><Ic.Settings/></button>
          <button title="Toggle Right Panel" className={`act-btn${secondarySideOpen?" act-on":""}`} onClick={()=>setSecondarySideOpen(v=>!v)}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="16" y1="3" x2="16" y2="21"/></svg>
          </button>
        </div>

        {/* Sidebar */}
        {sideOpen && (
          <div className="sidebar" style={{ width: sideWidth, minWidth: sideWidth, maxWidth: sideWidth }}>
            <div className="side-titlebar">
              <span className="side-title">{SIDE_TITLES[activity]||activity.toUpperCase()}</span>
              <button className="icon-btn" onClick={()=>setSideOpen(false)}><Ic.X/></button>
            </div>
            <div className="side-body">{sideContent()}</div>
          </div>
        )}

        {sideOpen && <div className="side-resizer" title="Drag to resize sidebar" onMouseDown={(e)=>startSideResize("primary", e)} />}

        {/* Main area */}
        <div className="main-area">
          {/* Tab bar */}
          <div className="tab-bar">
            {tabs.map(t => {
              const isDirty = !!dirtyTabs[t.key];
              const dotColor = isDirty ? "#f59e0b" : (LANG_DOT[t.lang] || "#666");
              return (
                <div key={t.key}
                  className={`editor-tab ${activeTab===t.key?"tab-on":""} ${isDirty?"tab-dirty":""} ${t.isExtension?"tab-ext":""}`}
                  onClick={()=>switchTab(t.key)}
                  onContextMenu={e=>{ e.preventDefault(); setTabCtxMenu({ x:e.clientX, y:e.clientY, key:t.key }); }}
                  title={t.key}
                  style={t.isExtension && activeTab===t.key ? { borderTopColor: "var(--accent)" } : undefined}
                >
                  {t.isExtension
                    ? <span style={{fontSize:12,color:"var(--accent)",flexShrink:0,filter:"drop-shadow(0 0 3px var(--accent))"}}>◈</span>
                    : <span className="tab-dot" style={{background:dotColor}}/>}
                  <span className="tab-name">{t.name}{isDirty ? " *" : ""}</span>
                  <button className="tab-x" onClick={e=>{e.stopPropagation();closeTab(t.key);}}>
                    <Ic.X/>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Tab context menu */}
          {tabCtxMenu && (
            <div className="tab-ctx-overlay" onClick={()=>setTabCtxMenu(null)} onContextMenu={e=>e.preventDefault()}>
              <div className="tab-ctx-menu" style={{ left: tabCtxMenu.x, top: tabCtxMenu.y }}
                onClick={e=>e.stopPropagation()}>
                {[
                  { label:"Close",            action:()=>closeTab(tabCtxMenu.key) },
                  { label:"Close Others",     action:()=>{ tabs.filter(t=>t.key!==tabCtxMenu.key).forEach(t=>closeTab(t.key)); } },
                  { label:"Close Saved",      action:()=>{ tabs.filter(t=>!dirtyTabs[t.key]).forEach(t=>closeTab(t.key)); } },
                  { label:"Close All",        action:()=>{ [...tabs].forEach(t=>closeTab(t.key)); } },
                  null,
                  { label:"Copy Path",        action:()=>navigator.clipboard?.writeText(tabCtxMenu.key) },
                  { label:"Reveal in Explorer", action:()=>{ setActivity("files"); setSideOpen(true); } },
                ].map((item, i) => item === null
                  ? <div key={i} className="tab-ctx-sep"/>
                  : <button key={i} className="tab-ctx-item" onClick={()=>{ item.action(); setTabCtxMenu(null); }}>{item.label}</button>
                )}
              </div>
            </div>
          )}

          {/* Breadcrumb bar */}
          {activeTab && (
            <div className="breadcrumb-bar">
              {activeTab.replace(/\\/g, "/").split("/").filter(Boolean).map((seg, i, arr) => (
                <span key={i} className="bc-seg">
                  <span className={i === arr.length - 1 ? "bc-file" : "bc-dir"}
                    onClick={i === arr.length - 1 ? undefined : () => { setActivity("files"); setSideOpen(true); }}
                  >{seg}</span>
                  {i < arr.length - 1 && <span className="bc-arrow">›</span>}
                </span>
              ))}
              {currentSymbol && (
                <>
                  <span className="bc-arrow">›</span>
                  <span className={`bc-sym bc-sym-${currentSymbol.kind}`}
                    onClick={() => revealLine(currentSymbol.line)}
                    title={`${currentSymbol.kind} — line ${currentSymbol.line}`}
                  >{currentSymbol.name}</span>
                </>
              )}
            </div>
          )}

          {/* Editor */}
          <div className="editor-wrap">
            {tabs.length > 0 && activeTab ? (
              (() => {
                const activeTabObj = tabs.find(t => t.key === activeTab);
                if (activeTabObj?.isExtension) {
                  const ext = extTabData[activeTab];
                  return (
                    <ExtensionPreviewTab
                      ext={ext}
                      installed={!!ext?.id && extInstalled.some(e => e.id === ext.id)}
                      onInstall={(installedExt) => {
                        const current = (() => { try { return JSON.parse(localStorage.getItem("wayai_ext_installed_v1") || "[]").map(x => typeof x === "string" ? { id: x, name: x } : x); } catch { return []; } })();
                        if (!current.some(x => x.id === installedExt.id)) {
                          const next = [...current, installedExt];
                          localStorage.setItem("wayai_ext_installed_v1", JSON.stringify(next));
                          setExtInstalled(next);
                          window.dispatchEvent(new Event("wayai-ext-installed-changed"));
                        }
                      }}
                      onUninstall={(id) => {
                        const current = (() => { try { return JSON.parse(localStorage.getItem("wayai_ext_installed_v1") || "[]").map(x => typeof x === "string" ? { id: x, name: x } : x); } catch { return []; } })();
                        const next = current.filter(x => x.id !== id);
                        localStorage.setItem("wayai_ext_installed_v1", JSON.stringify(next));
                        setExtInstalled(next);
                        window.dispatchEvent(new Event("wayai-ext-installed-changed"));
                      }}
                    />
                  );
                }
                return (
                  <Editor
                    key={activeTab}
                    height="100%"
                    language={lang}
                    value={code}
                    theme={theme}
                    onChange={handleCodeChange}
                    onMount={(e, monaco) => {
                      editorRef.current = e; monacoRef.current = monaco; setupInlineCompletions(monaco);
                      e.onDidChangeCursorPosition(ev => {
                        const p = ev.position;
                        setCursor({ ln: p.lineNumber, col: p.column });
                      });
                    }}
                    options={{
                      fontSize,
                      fontFamily: "'JetBrains Mono','Cascadia Code',Consolas,monospace",
                      fontLigatures: true,
                      minimap: { enabled: minimapEnabled, scale: 1 },
                      lineNumbers: lineNumbers ? "on" : "off",
                      renderLineHighlight: "all",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      padding: { top: 8, bottom: 8 },
                      bracketPairColorization: { enabled: true },
                      guides: { bracketPairs: true, indentation: true },
                      smoothScrolling: true,
                      cursorBlinking: "smooth",
                      wordWrap,
                      folding: true,
                      tabSize,
                      inlineSuggest: { enabled: true, mode: "prefix" },
                      suggest: { showKeywords: true },
                      quickSuggestions: { other: true, comments: false, strings: false },
                    }}
                  />
                );
              })()
            ) : (
              <div className="empty-ed welcome-ed">
                <div className="welcome-watermark" aria-hidden="true">
                  <img src="/brand-logo.svg" alt="" />
                </div>
                <div className="welcome-head">
                  <img className="welcome-logo" src="/brand-logo.svg" alt="Way AI Code" />
                  <div>
                    <div className="ee-title">Way AI Code</div>
                    <div className="ee-hint">Editing evolved</div>
                  </div>
                </div>

                <div className="welcome-grid">
                  <div className="welcome-col">
                    <div className="welcome-col-title">Start</div>
                    <button className="welcome-link" onClick={()=>setCmdOpen(true)}>New File...</button>
                    <button className="welcome-link" onClick={()=>setCmdOpen(true)}>Open File...</button>
                    <button className="welcome-link" onClick={()=>openSide("files")}>Open Folder...</button>
                    <button className="welcome-link" onClick={()=>openSide("git")}>Clone Git Repository...</button>
                    <button className="welcome-link" onClick={()=>openSide("wayai")}>Connect to...</button>
                  </div>

                  <div className="welcome-col">
                    <div className="welcome-col-title">Recent</div>
                    <button className="welcome-link recent" onClick={()=>openSide("files")}>{workspaceRoot || "way ai code"}</button>
                    <button className="welcome-link recent" onClick={()=>openSide("files")}>interior-way-vr</button>
                    <button className="welcome-link recent" onClick={()=>openSide("files")}>way-ai</button>
                    <button className="welcome-link recent" onClick={()=>openSide("files")}>project-1</button>
                  </div>
                </div>

                <div className="welcome-note">Tip: Open any folder to launch full AI coding workspace.</div>
              </div>
            )}
          </div>

          <BottomPanel
            open={panelOpen}
            active={panelActive}
            height={panelHeight}
            onHeightChange={setPanelHeight}
            onActive={setPanelActive}
            onClose={()=>setPanelOpen(false)}
            tabs={tabs}
            dirtyTabs={dirtyTabs}
            outputLines={outputLines}
            problems={problems}
            onGoToProblem={goToProblem}
          />
        </div>

        {secondarySideOpen && (
          <>
            <div className="side-resizer secondary" title="Drag to resize" onMouseDown={(e)=>startSideResize("secondary", e)} />
            <div className="rsb-wrap" style={{ width: secondarySideWidth, minWidth: secondarySideWidth, maxWidth: secondarySideWidth }}>
              <div className="rsb-chat-header">
                <div className="rsb-chat-title">
                  <Ic.Chat />
                  <span>AI Chat</span>
                </div>
                <button className="rsb-chat-close" title="Close" onClick={()=>setSecondarySideOpen(false)}>
                  <Ic.X />
                </button>
              </div>
              <div className="rsb-chat-body">
                <ErrorBoundary key="rsb-chat">
                  <ChatPanel manager={manager} status={accStatus} editorRef={editorRef} lang={lang} code={code} onProposeEdit={showInlineDiff} tabs={tabs} tabCode={tabCode}/>
                </ErrorBoundary>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="workbench-menubar" ref={menuBarRef}>
        <div className="wb-menu-left">
          <img className="wb-app-logo" src="/brand-logo.svg" alt="Way logo" title="Way AI Code" />
          {MENU_GROUPS.map(group => (
            <div key={group.label} className="wb-menu-wrap">
              <button
                className={`wb-menu-item ${openMenu===group.label?"on":""}`}
                onClick={()=>setOpenMenu(m => m === group.label ? null : group.label)}
              >
                {group.label}
              </button>
              {openMenu===group.label && (
                <div className="wb-menu-pop">
                  {group.items.map((item, idx) => item.separator ? (
                    <div key={`sep:${idx}`} className="wb-menu-sep" />
                  ) : (
                    <button key={`${item.label}:${idx}`} className="wb-menu-row" onClick={()=>runMenuAction(item.action)}>
                      <span>{item.label}</span>
                      {item.shortcut ? <span className="wb-menu-key">{item.shortcut}</span> : <span />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="wb-menu-center">
          <div className="wb-search-wrap">
            <span className="wb-search-icon">⌕</span>
            <input
              className="wb-search-input"
              type="text"
              placeholder="Search files, commands…"
              value={menuSearch}
              onChange={e => setMenuSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setMenuSearch(""); }}
            />
            {menuSearch && <button className="wb-search-clear" onClick={() => setMenuSearch("")}>✕</button>}
          </div>
        </div>
        <div className="wb-menu-right">
          <div className="wb-quick-group">
            <select className="wb-quick-select" value={lang} onChange={e=>setLang(e.target.value)} title="Language">
              {LANGS.map(l => <option key={l}>{l}</option>)}
            </select>
            <select className="wb-quick-select" value={theme} onChange={e=>setTheme(e.target.value)} title="Theme">
              <option value="vs-dark">Dark</option>
              <option value="vs-light">Light</option>
              <option value="hc-black">HC Black</option>
            </select>
            <select className="wb-quick-select" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} title="Font size">
              {[12, 13, 14, 15, 16, 18].map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
            <button className={`wb-chip ${wordWrap==="on" ? "on" : ""}`} onClick={()=>setWordWrap(w => w === "on" ? "off" : "on")}>Wrap</button>
          </div>
          <select className="wb-layout-select" value={layoutMode} onChange={e=>applyLayoutMode(e.target.value)} title="Layout options">
            <option value="default">Layout: Default</option>
            <option value="focus">Layout: Focus</option>
            <option value="zen">Layout: Zen</option>
          </select>
          <button className={`wb-toggle-btn ${sideOpen ? "on" : ""}`} onClick={()=>setSideOpen(v=>!v)} title="Toggle Primary Sidebar">◧</button>
          <button className={`wb-toggle-btn ${panelOpen ? "on" : ""}`} onClick={()=>setPanelOpen(v=>!v)} title="Toggle Panel">▬</button>
          <button className={`wb-toggle-btn ${secondarySideOpen ? "on" : ""}`} onClick={()=>setSecondarySideOpen(v=>!v)} title="Toggle Secondary Sidebar">◨</button>
        </div>
      </div>

      <div className="statusbar" style={{ background: accentColor }}>
        <div className="sb-left">
          <span className="sb-item">⎇ {gitBranch}</span>
          <button className="sb-item sb-problems-btn" onClick={()=>{ setPanelOpen(true); setPanelActive("problems"); }}>
            <span className={problems.filter(p=>p.severity===8).length > 0 ? "sb-err" : "sb-ok"}>
              ⊘ {problems.filter(p=>p.severity===8).length}
            </span>
            <span className={problems.filter(p=>p.severity===4).length > 0 ? "sb-warn" : "sb-ok"}>
              ⚠ {problems.filter(p=>p.severity===4).length}
            </span>
          </button>
          <span className="sb-item">
            {(accStatus.accounts || []).filter(a=>a.status === "limited").length > 0
              ? `${(accStatus.accounts || []).filter(a=>a.status === "limited").length} limited`
              : "accounts ok"}
          </span>
          {detected.length > 0 && <span className="sb-item">tools {detected.map(d=>d.id).join(", ")}</span>}
        </div>
        <div className="sb-right">
          <span className="sb-item">Ln {cursor.ln}, Col {cursor.col}</span>
          <span className="sb-item">{lang}</span>
          <span className="sb-item">UTF-8</span>
          <span className="sb-item">Spaces: {tabSize}</span>
          {accStatus.active && (
            <span className="sb-item sb-acc">
              {prov?.icon} {accStatus.active.label} · {(accStatus.accounts || []).filter(a=>a.status === "active").length}/{(accStatus.accounts || []).length}
            </span>
          )}
          {!panelOpen && (
            <button className="sb-item sb-btn" onClick={()=>openPanel("terminal")}>
              <Ic.Term /> Terminal
            </button>
          )}
          {panelOpen && <span className="sb-item">{panelActive}</span>}
        </div>
      </div>
    </div>
  );
}
