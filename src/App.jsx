/**
 * Way AI Code — App.jsx
 * VS Code layout: ActivityBar + Sidebar + Editor Tabs + Terminal + Status Bar
 * All paths fixed to match actual project structure
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { AccountManager, PROVIDERS, autoDetect, setSecureKey, getSecureKey } from "./lib/AccountManager.js";
import FileExplorer from "./components/FileExplorer.jsx";
import "./components/FileExplorer.css";
import TerminalPanel from "./components/Terminal.jsx";
import "./components/Terminal.css";
import {
  writeFile, langFromPath, langColor, pathExt, LANG_COLOR, MOCK_ROOT,
  detectTools, packageScripts, npmInstall, npmRunScript, pythonRunFile, gitClone,
  gitStatus, gitLog, gitStage, gitUnstage, gitCommit, gitPush, gitPull,
} from "./lib/fs.js";

// ── Icons ─────────────────────────────────────────────────────────────────────
const Ic = {
  Files:   ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Search:  ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Git:     ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
  Ext:     ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>,
  Chat:    ()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Accounts:()=><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Term:    ()=><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  X:       ()=><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Ref:     ()=><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Plus:    ()=><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

const LANG_DOT = LANG_COLOR;

// ── Git Panel ─────────────────────────────────────────────────────────────────
function GitPanel({ workspaceRoot }) {
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
          <button className="btn-git-s" disabled={busy} onClick={()=>run("Pushed", () => gitPush(root))}>↑ Push</button>
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
  {id:"python", name:"Python", desc:"Python syntax, snippets, run tasks, and interpreter hints", icon:"Py", category:"Languages", version:"1.4.0", author:"Way", installed:true, enabled:true, tags:["python","django","flask"]},
  {id:"node", name:"Node.js", desc:"Package scripts, npm task discovery, and JS runtime helpers", icon:"JS", category:"Languages", version:"1.2.1", author:"Way", installed:true, enabled:true, tags:["node","npm","javascript"]},
  {id:"rust", name:"Rust Analyzer", desc:"Rust syntax, cargo tasks, and diagnostics integration", icon:"Rs", category:"Languages", version:"0.9.3", author:"Way", installed:false, enabled:false, tags:["rust","cargo","tauri"]},
  {id:"prettier", name:"Prettier", desc:"Format JavaScript, TypeScript, JSON, CSS, and Markdown", icon:"Pr", category:"Formatters", version:"3.2.0", author:"Prettier", installed:true, enabled:true, tags:["format","javascript","css"]},
  {id:"eslint", name:"ESLint", desc:"JavaScript and TypeScript lint rules with quick fixes", icon:"Es", category:"Linters", version:"9.0.0", author:"OpenJS", installed:true, enabled:true, tags:["lint","javascript","typescript"]},
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

const GITHUB_TOKEN_KEY = "wayai_github_token_v1";

function formatToolOutput(out) {
  if (!out) return "";
  const parts = [];
  if (out.stdout) parts.push(out.stdout);
  if (out.stderr) parts.push(out.stderr);
  return parts.join("\n").trim() || `Exit code ${out.code}`;
}

function ExtPanel({ workspaceRoot, activeFile, onOpenSide, onOutput }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [state, setState] = useState(loadExtState);
  const [tools, setTools] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [githubToken, setGithubToken] = useState("");
  useEffect(() => { getSecureKey("github_token").then(k => { if (k) setGithubToken(k); }); }, []);
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
  const filtered = merged.filter(e => {
    const text = `${e.name} ${e.desc} ${e.category} ${(e.tags||[]).join(" ")}`.toLowerCase();
    return (cat === "All" || e.category === cat) && (!q.trim() || text.includes(q.toLowerCase()));
  });
  const installed = merged.filter(e=>e.installed);

  const patchExt = (id, patch) => setState(prev => ({...prev, [id]: {...(prev[id] || {}), ...patch}}));
  const toolById = Object.fromEntries((tools || []).map(t => [t.id, t]));
  const hasTool = id => !!toolById[id]?.installed;

  const runAction = async (label, fn) => {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      const out = await fn();
      const text = formatToolOutput(out);
      setNotice(`${label} completed`);
      onOutput?.(`${label}\n${text || "Done"}`);
    } catch(e) {
      const msg = String(e?.message || e);
      setError(msg);
      onOutput?.(`${label} failed\n${msg}`);
    } finally {
      setBusy("");
    }
  };

  const saveGithubToken = () => {
    setSecureKey("github_token", githubToken.trim());
    setNotice("GitHub token saved");
    setTimeout(()=>setNotice(""), 1800);
  };

  const loadGithubRepos = async () => {
    if (!githubToken.trim()) {
      setError("GitHub token is required to list private/user repositories.");
      return;
    }
    setBusy("GitHub repositories");
    setError("");
    try {
      const res = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated", {
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${githubToken.trim()}`,
        },
      });
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const repos = await res.json();
      setGithubRepos((repos || []).map(r => ({
        id: r.id,
        name: r.full_name,
        cloneUrl: r.clone_url,
        private: r.private,
        updatedAt: r.updated_at,
      })));
      setNotice(`Loaded ${repos.length} repositories`);
    } catch(e) {
      setError(String(e?.message || e));
    } finally {
      setBusy("");
    }
  };

  const runScript = (name) => {
    runAction(`npm run ${name}`, () => npmRunScript(workspaceRoot || MOCK_ROOT, name));
  };

  const runPython = () => {
    if (!activeFile || !activeFile.toLowerCase().endsWith(".py")) {
      setError("Open a Python file before running Python.");
      return;
    }
    runAction(`python ${activeFile}`, () => pythonRunFile(workspaceRoot || MOCK_ROOT, activeFile));
  };

  return (
    <div className="panel-scroll">
      <div className="tool-section">
        <div className="tool-hd">
          <span>RUNTIME TOOLS</span>
          <button className="btn-tiny" title="Refresh tools" onClick={refreshTools}><Ic.Ref/></button>
        </div>
        {tools.map(t=>(
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
          <button className="btn-ext" disabled={!hasTool("npm") || !!busy} onClick={()=>runAction("npm install", () => npmInstall(workspaceRoot || MOCK_ROOT))}>npm install</button>
          <button className="btn-ext" disabled={!hasTool("python") || !!busy} onClick={runPython}>Run Python</button>
        </div>
        {scripts.length ? scripts.map(s=>(
          <div key={s.name} className="script-row">
            <div className="script-main">
              <span className="script-name">{s.name}</span>
              <span className="script-cmd">{s.command}</span>
            </div>
            <button className="btn-ext" disabled={!hasTool("npm") || !!busy} onClick={()=>runScript(s.name)}>Run</button>
          </div>
        )) : <div className="tool-empty">No package.json scripts found</div>}
      </div>

      <div className="tool-section">
        <div className="tool-hd"><span>GITHUB</span></div>
        <input className="way-input" type="password" placeholder="GitHub token (repo access)" value={githubToken} onChange={e=>setGithubToken(e.target.value)}/>
        <input className="way-input" placeholder="Clone target folder" value={cloneTarget} onChange={e=>setCloneTarget(e.target.value)}/>
        <div className="tool-actions">
          <button className="btn-ext" onClick={saveGithubToken}>Save Token</button>
          <button className="btn-ext" disabled={!hasTool("git") || !!busy} onClick={loadGithubRepos}>Load Repos</button>
          <button className="btn-ext ghost" onClick={()=>onOpenSide?.("git")}>Source Control</button>
        </div>
        {githubRepos.slice(0, 12).map(repo=>(
          <div key={repo.id} className="repo-row">
            <div className="repo-main">
              <span className="repo-name">{repo.name}</span>
              <span className="repo-meta">{repo.private ? "private" : "public"} · {repo.updatedAt?.slice(0,10)}</span>
            </div>
            <button className="btn-ext" disabled={!hasTool("git") || !!busy} onClick={()=>runAction(`Clone ${repo.name}`, () => gitClone(cloneTarget || workspaceRoot || MOCK_ROOT, repo.cloneUrl))}>Clone</button>
          </div>
        ))}
      </div>

      <div className="ext-store-head">
        <input className="ext-search" placeholder="Search extensions…" value={q} onChange={e=>setQ(e.target.value)}/>
        <div className="ext-stats">{installed.length}/{EXTS.length} installed</div>
      </div>
      <div className="ext-cats">
        {EXT_CATS.map(c=><button key={c} className={`ext-cat ${cat===c?"on":""}`} onClick={()=>setCat(c)}>{c}</button>)}
      </div>
      {filtered.map(e=>(
        <div key={e.id} className={`ext-row ${e.installed?"installed":""}`}>
          <span className="ext-icon">{e.icon}</span>
          <div className="ext-info">
            <div className="ext-name-row">
              <span className="ext-name">{e.name}</span>
              <span className="ext-version">v{e.version}</span>
            </div>
            <div className="ext-desc">{e.desc}</div>
            <div className="ext-meta">{e.category} · {e.author}</div>
          </div>
          <div className="ext-actions">
            {e.installed ? (
              <>
                <button className={`btn-ext ${e.enabled?"on":""}`} onClick={()=>patchExt(e.id,{enabled:!e.enabled})}>{e.enabled?"Enabled":"Disabled"}</button>
                <button className="btn-ext ghost" onClick={()=>patchExt(e.id,{installed:false,enabled:false})}>Uninstall</button>
              </>
            ) : (
              <button className="btn-ext" onClick={()=>patchExt(e.id,{installed:true,enabled:true})}>Install</button>
            )}
          </div>
        </div>
      ))}
      {!filtered.length && <div className="ext-empty">No extensions found</div>}
      {notice && <div className="tool-notice">{notice}</div>}
      {error && <div className="tool-error">{error}</div>}
    </div>
  );
}

// ── Accounts Panel ────────────────────────────────────────────────────────────
function AccountsPanel({ manager, status, refresh, routerScores, routerStrategy, onStrategy }) {
  const [form,    setForm]    = useState({provider:"chatgpt",label:"",apiKey:"",model:""});
  const [showAdd, setShowAdd] = useState(false);
  const SC = {active:"#22c55e",limited:"#f59e0b",error:"#ef4444",disabled:"#6b7280"};
  const SL = {active:"ready",limited:"limited",error:"error",disabled:"off"};
  const accounts = status.accounts || [];
  const totalTokens = accounts.reduce((n,a)=>n+(a.tokensIn||0)+(a.tokensOut||0),0);
  const totalCost = accounts.reduce((n,a)=>n+(a.costUsd||0),0);
  const fmtCost = n => n ? `$${n.toFixed(n < 0.01 ? 4 : 2)}` : "$0.00";
  const doAdd = () => { manager.add({...form}); setForm({provider:"chatgpt",label:"",apiKey:"",model:""}); setShowAdd(false); refresh(); };

  return (
    <div className="panel-scroll">
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
      <div className="acc-panel-hd">
        <span className="sec-head">ALL ACCOUNTS</span>
        <button className="btn-icon-sm" onClick={()=>setShowAdd(p=>!p)}><Ic.Plus/> Add</button>
      </div>
      {showAdd && (
        <div className="add-acc-form">
          <select className="way-input" value={form.provider} onChange={e=>setForm(f=>({...f,provider:e.target.value}))}>
            {Object.entries(PROVIDERS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <input className="way-input" placeholder="Label (e.g. GPT Account 2)" value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}/>
          <input className="way-input" type="password" placeholder="API Key" value={form.apiKey} onChange={e=>setForm(f=>({...f,apiKey:e.target.value}))}/>
          <input className="way-input" placeholder="Model (optional)" value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))}/>
          <div className="form-row"><button className="btn-primary" onClick={doAdd}>Add Account</button><button className="btn-secondary" onClick={()=>setShowAdd(false)}>Cancel</button></div>
        </div>
      )}
      {Object.entries(PROVIDERS).map(([pid,prov])=>{
        const accs = accounts.filter(a=>a.provider===pid);
        if (!accs.length) return null;
        const rs = routerScores[pid];
        const doSignOut = (e) => { e.stopPropagation(); accs.forEach(a=>manager.remove(a.id)); refresh(); };
        return (
          <div key={pid} className="prov-group">
            <div className="prov-group-lbl" style={{color:prov.color}}>
              {prov.icon} {prov.label} · {accs.length}
              {rs?.healthy && <span className="rs-tag">{Math.round(rs.latencyMs)}ms</span>}
              <button className="btn-tiny danger" style={{marginLeft:"auto",fontSize:10,padding:"2px 6px"}} onClick={doSignOut}>Sign Out</button>
            </div>
            {accs.map(acc=>(
              <div key={acc.id} className={`acc-row ${status.activeId===acc.id?"acc-active":""}`}
                onClick={()=>{manager.setActive(acc.id);refresh();}}>
                <span className="acc-dot" style={{background:SC[acc.status]}}/>
                <span className="acc-lbl">{acc.label}</span>
                <span className="acc-model">{acc.model}</span>
                <span className="acc-usage">{((acc.tokensIn||0)+(acc.tokensOut||0)).toLocaleString()} tok · {fmtCost(acc.costUsd||0)}</span>
                <span className="acc-status" style={{color:SC[acc.status]}}>{SL[acc.status]}</span>
                <div className="acc-actions">
                  {acc.status!=="active"&&<button className="btn-tiny" onClick={e=>{e.stopPropagation();manager.resetAccount(acc.id);refresh();}}><Ic.Ref/></button>}
                  <button className="btn-tiny danger" onClick={e=>{e.stopPropagation();manager.remove(acc.id);refresh();}}><Ic.X/></button>
                </div>
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
function SearchPanel({ code }) {
  const [q,setQ]        = useState("");
  const [results,setR]  = useState([]);
  const run = ()=>{
    if(!q.trim()){setR([]);return;}
    setR(code.split("\n").map((t,i)=>({n:i+1,t})).filter(r=>r.t.toLowerCase().includes(q.toLowerCase())));
  };
  return (
    <div className="panel-scroll">
      <div className="search-wrap">
        <input className="search-inp" placeholder="Search in editor…" value={q}
          onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&run()}/>
        <button className="btn-search" onClick={run}>↵</button>
      </div>
      {results.length>0&&<>
        <div className="search-count">{results.length} results</div>
        {results.map(r=><div key={r.n} className="search-row"><span className="search-ln">{r.n}</span><span className="search-txt">{r.t}</span></div>)}
      </>}
    </div>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────
function MsgContent({ content, onInsert }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="msg-body">
      {parts.map((p,i)=>{
        if(p.startsWith("```")){
          const nl=p.indexOf("\n"), lang=nl>3?p.slice(3,nl).trim():"", code=nl>3?p.slice(nl+1,-3):p.slice(3,-3);
          return (
            <div key={i} className="code-block">
              <div className="cb-hd">
                <span className="cb-lang" style={{color:LANG_DOT[lang]||"#aaa"}}>{lang||"code"}</span>
                <button className="cb-btn" onClick={()=>navigator.clipboard?.writeText(code)}>Copy</button>
                {onInsert&&<button className="cb-btn ac" onClick={()=>onInsert(code)}>↩ Insert</button>}
              </div>
              <pre className="cb-pre">{code}</pre>
            </div>
          );
        }
        return p.trim()?<p key={i} className="msg-p">{p}</p>:null;
      })}
    </div>
  );
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

function ChatPanel({ manager, status, editorRef, lang, code, onProposeEdit }) {
  const [msgs,setMsgs]     = useState([{role:"ai",content:"Hi! I'm **Way AI Code** 🚀\n\nClick a file in the Explorer to open it, then select code and use the quick actions above.\n\nI'll auto-switch accounts if any rate limit is hit."}]);
  const [input,setInput]   = useState("");
  const [streaming,setStr] = useState(false);
  const [streamTxt,setST]  = useState("");
  const streamRef = useRef("");
  const endRef    = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,streamTxt]);

  const getSel = ()=>{
    const ed=editorRef.current; if(!ed) return "";
    return ed.getModel()?.getValueInRange(ed.getSelection())?.trim()||"";
  };

  const insertCode = snippet=>{ const ed=editorRef.current; if(!ed) return; ed.executeEdits("way-ai",[{range:ed.getSelection(),text:snippet}]); };

  const send = async (prompt, label, options = {}) => {
    if(!prompt||streaming) return;
    setMsgs(p=>[...p,{role:"user",content:label||prompt.slice(0,120)}]);
    setStr(true); streamRef.current=""; setST("");
    const prov = PROVIDERS[status.active?.provider];
    try {
      const onToken = t=>{ streamRef.current+=t; setST(streamRef.current); };
      const {result,account} = await manager.call(prompt,{onToken});
      const final = streamRef.current||result;
      setMsgs(p=>[...p,{role:"ai",content:final,acLabel:account.label,pColor:PROVIDERS[account.provider]?.color,pIcon:PROVIDERS[account.provider]?.icon}]);
      if (options.inlineDiff && options.range && options.original) {
        const replacement = extractFirstCodeBlock(final);
        if (replacement) onProposeEdit?.({ ...options, replacement });
      }
      setST("");
    } catch(err) {
      setMsgs(p=>[...p,{role:"ai",content:`❌ **Error:** ${err.message}\n\nCheck API keys in the Accounts panel.`}]);
    }
    setStr(false);
  };

  const prov   = PROVIDERS[status.active?.provider];
  const pColor = prov?.color||"var(--accent)";
  const pIcon  = prov?.icon||"◈";

  return (
    <div className="chat-panel">
      <div className="chat-acc-bar">
        {status.active
          ? <div className="chat-acc-tag" style={{color:pColor}}>{pIcon} <span className="chat-acc-name">{status.active.label}</span><span className="chat-acc-model">{status.active.model}</span></div>
          : <div className="chat-acc-tag warn">⚠ No accounts — add in Accounts panel</div>}
        <span className="chat-acc-count">{(status.accounts||[]).filter(a=>a.status==="active").length} ready</span>
      </div>
      <div className="chat-quick">
        {QUICK.map(q=>(
          <button key={q.label} className="quick-btn" disabled={streaming}
            onClick={()=>{
              const ed = editorRef.current;
              const selected = getSel();
              const range = rangeToPlain(ed?.getSelection());
              const target = selected || code;
              send(q.fn(target,lang), q.label, { inlineDiff: !!(q.diff && selected), range, original:selected });
            }}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="chat-msgs">
        {msgs.map((m,i)=>(
          <div key={i} className={`msg ${m.role==="user"?"user":"ai"}`}>
            {m.role==="ai"&&<div className="msg-meta" style={{color:m.pColor||pColor}}>{m.pIcon||pIcon} {m.acLabel||"Way AI"}</div>}
            <MsgContent content={m.content} onInsert={m.role==="ai"?insertCode:null}/>
          </div>
        ))}
        {streaming&&(
          <div className="msg ai">
            <div className="msg-meta" style={{color:pColor}}>{pIcon} streaming…</div>
            {streamTxt?<MsgContent content={streamTxt}/>:<div className="dots"><span/><span/><span/></div>}
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div className="chat-input-row">
        <textarea className="chat-ta" rows={3} placeholder="Ask Way AI Code… (Enter=send, Shift+Enter=newline)"
          value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{
            if(e.key==="Enter"&&!e.shiftKey){
              e.preventDefault();
              const s=getSel();
              send(s?`Code:\n\`\`\`${lang}\n${s}\n\`\`\`\n\nQuestion: ${input}`:input, input);
              setInput("");
            }
          }}/>
        <button className="btn-send" disabled={streaming} style={{"--pc":pColor}}
          onClick={()=>{ const s=getSel(); send(s?`Code:\n\`\`\`${lang}\n${s}\n\`\`\`\n\nQuestion: ${input}`:input,input); setInput(""); }}>
          {streaming?"⏳":"↑"}
        </button>
      </div>
    </div>
  );
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

function ProblemsView({ tabs, dirtyTabs }) {
  const dirty = tabs.filter(t => dirtyTabs[t.key]);
  return (
    <div className="console-view">
      {dirty.length ? dirty.map(t=>(
        <div key={t.key} className="problem-row warn">
          <span className="problem-icon">!</span>
          <span className="problem-main">Unsaved changes</span>
          <span className="problem-file">{t.name}</span>
        </div>
      )) : (
        <div className="console-empty">No problems detected</div>
      )}
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
  tabs, dirtyTabs, outputLines,
}) {
  const panelTabs = [
    { id:"problems", label:"PROBLEMS", count:tabs.filter(t=>dirtyTabs[t.key]).length },
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
        {active==="problems" && <ProblemsView tabs={tabs} dirtyTabs={dirtyTabs}/>}
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
  const accStatusRef = useRef(null);
  const routerScoresRef = useRef({});
  const activeTabRef = useRef(null);
  const tabCodeRef = useRef({});
  const autocompleteCacheRef = useRef({ key:"", at:0, value:"" });
  const suppressAutoSaveRef = useRef(false);
  const initialSettings = useRef(loadEditorSettings()).current;

  // Layout
  const [activity, setActivity] = useState("files"); // default: show file explorer
  const [sideOpen, setSideOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelActive, setPanelActive] = useState("terminal");
  const [panelHeight, setPanelHeight] = useState(initialSettings.panelHeight || 240);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState(initialSettings.workspaceRoot || MOCK_ROOT);

  // Editor state
  const [code,     setCode]     = useState("");         // current editor content
  const [lang,     setLang]     = useState(initialSettings.lang || "javascript");
  const [theme,    setTheme]    = useState(initialSettings.theme || "vs-dark");
  const [fontSize, setFontSize] = useState(initialSettings.fontSize || 13);
  const [wordWrap, setWordWrap] = useState(initialSettings.wordWrap || "off");
  const [aiEditMode, setAiEditMode] = useState(initialSettings.aiEditMode || "preview");
  const [tabs,     setTabs]     = useState([]);          // open file tabs
  const [activeTab,setActiveTab]= useState(null);        // current tab key (path)
  const [tabCode,  setTabCode]  = useState({});          // tabKey → content
  const [tabSavedCode,setTabSavedCode] = useState({});   // tabKey → last saved content
  const [dirtyTabs,setDirtyTabs] = useState({});          // tabKey → unsaved bool

  // Accounts
  const [toast,  setToast]      = useState(null);
  const [detected,setDetected]  = useState([]);
  const [routerScores,setRS]    = useState({});
  const [routerStrategy,setRT]  = useState("balanced");
  const [accStatus, setAccStatus] = useState({accounts:[],activeId:null,active:null});
  const [outputLines, setOutputLines] = useState(["Way AI Code started", "Command Palette: Ctrl+Shift+P", "Toggle panel: Ctrl+`"]);

  const [manager] = useState(()=>new AccountManager(st=>{
    setAccStatus(st);
    if(st.toast){ setToast({msg:st.toast,type:st.toastType||"info"}); setTimeout(()=>setToast(null),4500); }
  }));

  useEffect(()=>{
    manager.loadKeys();
    if(manager.getAll().length===0){
      manager.add({provider:"ollama",  label:"Ollama Local",   model:"llama3.2",        apiKey:""});
      manager.add({provider:"chatgpt", label:"GPT Account 1",  model:"gpt-4o-mini",     apiKey:""});
      manager.add({provider:"chatgpt", label:"GPT Account 2",  model:"gpt-4o-mini",     apiKey:""});
      manager.add({provider:"chatgpt", label:"GPT Account 3",  model:"gpt-4o-mini",     apiKey:""});
      manager.add({provider:"chatgpt", label:"GPT Account 4",  model:"gpt-4o-mini",     apiKey:""});
      manager.add({provider:"claude",  label:"Claude Pro 1",   model:"claude-haiku-4-5",apiKey:""});
      manager.add({provider:"claude",  label:"Claude Pro 2",   model:"claude-haiku-4-5",apiKey:""});
      manager.add({provider:"copilot", label:"GitHub Copilot", model:"gpt-4o",          apiKey:""});
    }
    setAccStatus(manager.getStatus());
  }, [manager]);

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
    saveEditorSettings({ lang, theme, fontSize, wordWrap, panelHeight, workspaceRoot, aiEditMode });
  }, [lang, theme, fontSize, wordWrap, panelHeight, workspaceRoot, aiEditMode]);

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
    const remaining = tabs.filter(t => t.key !== key);
    setTabs(remaining);
    setTabCode(prev => { const next = {...prev}; delete next[key]; return next; });
    setTabSavedCode(prev => { const next = {...prev}; delete next[key]; return next; });
    setDirtyTabs(prev => { const next = {...prev}; delete next[key]; return next; });
    if (activeTab === key) {
      if (remaining.length) {
        const last = remaining[remaining.length - 1];
        setActiveTab(last.key);
        setLang(last.lang || "javascript");
        setCode(tabCode[last.key] || "");
      } else {
        setActiveTab(null);
        setCode("");
      }
    }
  }, [tabs, activeTab, tabCode]);

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
      case "files":    return <FileExplorer onOpenFile={handleOpenFile} activeFile={activeTab} onRootChange={setWorkspaceRoot}/>;
      case "search":   return <SearchPanel code={code}/>;
      case "git":      return <GitPanel workspaceRoot={workspaceRoot}/>;
      case "ext":      return <ExtPanel workspaceRoot={workspaceRoot} activeFile={activeTab} onOpenSide={id=>{setActivity(id);setSideOpen(true);}} onOutput={line=>{openPanel("output");pushOutput(line);}}/>;
      case "accounts": return <AccountsPanel manager={manager} status={accStatus} refresh={()=>setAccStatus(manager.getStatus())} routerScores={routerScores} routerStrategy={routerStrategy} onStrategy={s=>{setRT(s);manager.router.setStrategy(s);}}/>;
      case "chat":     return <ChatPanel manager={manager} status={accStatus} editorRef={editorRef} lang={lang} code={code} onProposeEdit={showInlineDiff}/>;
      default:         return null;
    }
  };

  const switchAct = id => { if(activity===id) setSideOpen(o=>!o); else { setActivity(id); setSideOpen(true); } };
  const openSide = id => { setActivity(id); setSideOpen(true); };

  const commands = [
    { id:"file.save", title:"File: Save", group:"File", detail:"Ctrl+S", run:saveActiveFile },
    { id:"view.explorer", title:"View: Explorer", group:"View", run:()=>openSide("files") },
    { id:"view.search", title:"View: Search", group:"View", run:()=>openSide("search") },
    { id:"view.git", title:"View: Source Control", group:"View", run:()=>openSide("git") },
    { id:"view.extensions", title:"View: Extensions", group:"View", run:()=>openSide("ext") },
    { id:"view.chat", title:"View: AI Chat", group:"View", run:()=>openSide("chat") },
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
        e.preventDefault();
        setCmdOpen(true);
      } else if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setPanelOpen(p => !p);
        setPanelActive("terminal");
      } else if (e.ctrlKey && key === "s") {
        e.preventDefault();
        saveActiveFile();
      } else if (e.shiftKey && e.altKey && key === "f") {
        e.preventDefault();
        formatActiveFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActiveFile, formatActiveFile]);

  const prov        = PROVIDERS[accStatus.active?.provider];
  const accentColor = prov?.color || "#0078d4";

  const ACTS = [
    {id:"files",    Ico:Ic.Files,   title:"Explorer"},
    {id:"search",   Ico:Ic.Search,  title:"Search"},
    {id:"git",      Ico:Ic.Git,     title:"Source Control"},
    {id:"ext",      Ico:Ic.Ext,     title:"Extensions"},
  ];

  // sidebar title
  const SIDE_TITLES = { files:"EXPLORER",search:"SEARCH",git:"SOURCE CONTROL",ext:"EXTENSIONS",chat:"AI CHAT",accounts:"ACCOUNTS" };

  return (
    <div className="app">
      {/* Toast */}
      {toast && <div className={`toast ${toast.type||"info"}`} onClick={()=>setToast(null)}>{toast.msg}</div>}
      <CommandPalette open={cmdOpen} commands={commands} onClose={()=>setCmdOpen(false)}/>

      {/* Title bar */}
      <div className="titlebar">
        <div className="tb-left">
          <span className="app-mark">◈</span>
          <span className="app-name">Way AI Code</span>
        </div>
        <div className="tb-center">
          <button className="cmd-center" onClick={()=>setCmdOpen(true)}>
            {activeTab ? tabs.find(t=>t.key===activeTab)?.name || "Command Palette" : "Search commands"}
            <span>Ctrl+Shift+P</span>
          </button>
        </div>
        <div className="tb-right">
          <select className="tb-sel" value={lang} onChange={e=>setLang(e.target.value)}>
            {LANGS.map(l=><option key={l}>{l}</option>)}
          </select>
          <select className="tb-sel" value={theme} onChange={e=>setTheme(e.target.value)}>
            <option value="vs-dark">Dark</option>
            <option value="vs-light">Light</option>
            <option value="hc-black">HC Black</option>
          </select>
          <select className="tb-sel" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}>
            {[12,13,14,15,16,18].map(s=><option key={s} value={s}>{s}px</option>)}
          </select>
          <select className="tb-sel" title="AI edit mode" value={aiEditMode} onChange={e=>setAiEditMode(e.target.value)}>
            <option value="preview">AI Preview</option>
            <option value="apply">AI Auto Apply</option>
          </select>
          <button className={`tb-toggle ${wordWrap==="on"?"on":""}`} onClick={()=>setWordWrap(w=>w==="on"?"off":"on")}>Wrap</button>
          {accStatus.active && (
            <div className="tb-acc" style={{color:accentColor}}>
              {prov?.icon} {accStatus.active.label}
            </div>
          )}
        </div>
      </div>

      {/* Workbench */}
      <div className="workbench">
        {/* Activity Bar */}
        <div className="act-bar">
          {ACTS.map(({id,Ico,title})=>(
            <button key={id} title={title}
              className={`act-btn ${activity===id&&sideOpen?"act-on":""}`}
              onClick={()=>switchAct(id)}>
              <Ico/>
            </button>
          ))}
          <div className="act-spacer"/>
          <button title="AI Chat"  className={`act-btn ${activity==="chat"&&sideOpen?"act-on":""}`}    onClick={()=>switchAct("chat")}><Ic.Chat/></button>
          <button title="Accounts" className={`act-btn ${activity==="accounts"&&sideOpen?"act-on":""}`} onClick={()=>switchAct("accounts")}><Ic.Accounts/></button>
        </div>

        {/* Sidebar */}
        {sideOpen && (
          <div className="sidebar">
            <div className="side-titlebar">
              <span className="side-title">{SIDE_TITLES[activity]||activity.toUpperCase()}</span>
              <button className="icon-btn" onClick={()=>setSideOpen(false)}><Ic.X/></button>
            </div>
            <div className="side-body">{sideContent()}</div>
          </div>
        )}

        {/* Main area */}
        <div className="main-area">
          {/* Tab bar */}
          <div className="tab-bar">
            {tabs.map(t => {
              const isDirty = !!dirtyTabs[t.key];
              const dotColor = isDirty ? "#f59e0b" : (LANG_DOT[t.lang] || "#666");
              return (
                <div key={t.key}
                  className={`editor-tab ${activeTab===t.key?"tab-on":""} ${isDirty?"tab-dirty":""}`}
                  onClick={()=>switchTab(t.key)}
                  title={t.key}
                >
                  <span className="tab-dot" style={{background:dotColor}}/>
                  <span className="tab-name">{t.name}{isDirty ? " *" : ""}</span>
                  <button className="tab-x" onClick={e=>{e.stopPropagation();closeTab(t.key);}}>
                    <Ic.X/>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Editor */}
          <div className="editor-wrap">
            {tabs.length > 0 && activeTab ? (
              <Editor
                key={activeTab}
                height="100%"
                language={lang}
                value={code}
                theme={theme}
                onChange={handleCodeChange}
                onMount={(e, monaco) => { editorRef.current = e; monacoRef.current = monaco; setupInlineCompletions(monaco); }}
                options={{
                  fontSize,
                  fontFamily: "'JetBrains Mono','Cascadia Code',Consolas,monospace",
                  fontLigatures: true,
                  minimap: { enabled: true, scale: 1 },
                  lineNumbers: "on",
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
                  tabSize: 2,
                  inlineSuggest: { enabled: true, mode: "prefix" },
                  suggest: { showKeywords: true },
                  quickSuggestions: { other: true, comments: false, strings: false },
                }}
              />
            ) : (
              <div className="empty-ed">
                <div className="ee-mark">◈</div>
                <div className="ee-title">Way AI Code</div>
                <div className="ee-hint">Open a file from the Explorer</div>
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
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="statusbar" style={{background:accentColor}}>
        <div className="sb-left">
          <span className="sb-item">⎇ main</span>
          <span className="sb-item">
            {(accStatus.accounts||[]).filter(a=>a.status==="limited").length > 0
              ? `⚠ ${(accStatus.accounts||[]).filter(a=>a.status==="limited").length} limited`
              : "✓ accounts ok"}
          </span>
          {detected.length > 0 && <span className="sb-item">🟢 {detected.map(d=>d.id).join(", ")}</span>}
        </div>
        <div className="sb-right">
          <span className="sb-item">{lang}</span>
          <span className="sb-item">UTF-8</span>
          <span className="sb-item">Spaces: 2</span>
          {accStatus.active && (
            <span className="sb-item sb-acc">
              {prov?.icon} {accStatus.active.label}
              · {(accStatus.accounts||[]).filter(a=>a.status==="active").length}/{(accStatus.accounts||[]).length}
            </span>
          )}
          {!panelOpen && (
            <button className="sb-item sb-btn" onClick={()=>openPanel("terminal")}>
              <Ic.Term/> Terminal
            </button>
          )}
          {panelOpen && <span className="sb-item">{panelActive}</span>}
        </div>
      </div>
    </div>
  );
}
