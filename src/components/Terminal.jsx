/**
 * Way AI Code — Terminal.jsx
 * xterm.js terminal: real PTY in Tauri, smart simulation in browser
 * Multi-tab, drag-to-resize, command history
 */

import { useState, useRef, useEffect, useCallback } from "react";

const IS_TAURI = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

const SHELLS = IS_TAURI
  ? (navigator.userAgent.includes("Windows")
      ? [{ id:"powershell", label:"PowerShell", cmd:"powershell.exe", args:["-NoLogo"] },
         { id:"cmd",        label:"CMD",         cmd:"cmd.exe",        args:[] }]
      : [{ id:"bash", label:"bash", cmd:"bash", args:["--login"] },
         { id:"zsh",  label:"zsh",  cmd:"zsh",  args:["--login"] },
         { id:"sh",   label:"sh",   cmd:"sh",    args:[] }])
  : [{ id:"bash", label:"bash", cmd:"bash", args:[] }];

const XTERM_THEME = {
  background:"#1e1e1e", foreground:"#cccccc", cursor:"#aeafad", cursorAccent:"#1e1e1e",
  black:"#1e1e1e", red:"#f44747", green:"#608b4e", yellow:"#dcdcaa",
  blue:"#569cd6", magenta:"#c678dd", cyan:"#4ec9b0", white:"#d4d4d4",
  brightBlack:"#808080", brightRed:"#f44747", brightGreen:"#4ec9b0",
  brightYellow:"#dcdcaa", brightBlue:"#569cd6", brightMagenta:"#c678dd",
  brightCyan:"#9cdcfe", brightWhite:"#ffffff",
};

// ── PTY map ───────────────────────────────────────────────────────────────────
const _pty = {};

async function spawnPTY(id, shell, onData, onExit) {
  if (!IS_TAURI) return null;
  try {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const child = await Command.create(shell.cmd, shell.args, { encoding:"utf-8" }).spawn();
    child.stdout.on("data", d => onData(d));
    child.stderr.on("data", d => onData(`\x1b[31m${d}\x1b[0m`));
    child.on("close", ({ code }) => { onData(`\r\n\x1b[33mProcess exited (${code})\x1b[0m\r\n`); onExit(code); });
    _pty[id] = { child };
    return child;
  } catch(e) {
    onData(`\r\n\x1b[31mShell error: ${e.message}\x1b[0m\r\n`);
    return null;
  }
}

async function writePTY(id, data) {
  try { await _pty[id]?.child?.write(data); } catch {}
}

async function killPTY(id) {
  try { await _pty[id]?.child?.kill(); } catch {}
  delete _pty[id];
}

// ── Browser simulation ────────────────────────────────────────────────────────
const SIM_CWD_INIT = "~/way-ai-code";
const R = "\x1b[0m";
const G = "\x1b[32m";
const B = "\x1b[34m";
const C = "\x1b[36m";
const Y = "\x1b[33m";
const RE= "\x1b[31m";
const D = "\x1b[2m";

function simCmd(raw, cwd, setCwd) {
  const parts = raw.trim().split(/\s+/);
  const cmd   = parts[0] || "";
  const args  = parts.slice(1);

  switch(cmd) {
    case "":       return "";
    case "clear":  return "\x1b[2J\x1b[H";
    case "pwd":    return cwd + "\r\n";
    case "whoami": return "wayai\r\n";
    case "date":   return new Date().toString() + "\r\n";
    case "echo":   return args.join(" ") + "\r\n";
    case "node":
      if (args[0]==="-v"||args[0]==="--version") return "v20.11.0\r\n";
      return `${D}(browser mode)${R}\r\n`;
    case "ls": case "dir":
      return [
        `${B}src/${R}`, `${B}src-tauri/${R}`, `${Y}package.json${R}`,
        `${Y}vite.config.js${R}`, `${Y}README.md${R}`, `${D}index.html${R}`
      ].join("  ") + "\r\n";
    case "cd": {
      const t = args[0] || "~/way-ai-code";
      setCwd(t.startsWith("~") ? t : `~/way-ai-code/${t}`.replace(/\/\.$/, ""));
      return "";
    }
    case "cat": {
      const f = args[0]||"";
      if (f.includes("package.json")) return `${D}{\n  "name": "way-ai-code",\n  "version": "1.0.0"\n}${R}\r\n`;
      if (f.includes("README"))       return `${G}# Way AI Code\nVS Code-style AI editor${R}\r\n`;
      return `${D}(content of ${f})${R}\r\n`;
    }
    case "git":
      if (args[0]==="status")  return `${G}On branch main\nnothing to commit${R}\r\n`;
      if (args[0]==="log")     return `${Y}a1b2c3d${R} feat: add real terminal\n${Y}e4f5g6h${R} feat: file explorer\r\n`;
      if (args[0]==="branch")  return `${G}* main${R}\r\n`;
      return `${D}git ${args.join(" ")} — simulated${R}\r\n`;
    case "npm":
      if (args[0]==="run"&&args[1]==="dev")   return `${G}  VITE v5.4.1  ready in 284ms\n  ➜  Local: http://localhost:1420/${R}\r\n`;
      if (args[0]==="install")                 return `${G}added 312 packages in 4s${R}\r\n`;
      if (args[0]==="run"&&args[1]==="build") return `${G}✓ built in 1.4s${R}\r\n`;
      return `${D}npm ${args.join(" ")} — simulated${R}\r\n`;
    case "help":
      return [`${C}Way AI Code Terminal — Browser Simulation${R}`,
        "  ls, cd, pwd, cat, echo, date, whoami",
        "  git status/log/branch",
        "  npm install/run dev/run build",
        "  node -v, clear, help",
        `  ${D}Use npm run tauri:dev for real shell${R}`
      ].join("\r\n") + "\r\n";
    default:
      return `${RE}${cmd}: command not found${R} ${D}(browser sim — tauri:dev for real shell)${R}\r\n`;
  }
}

// ── Single terminal instance ──────────────────────────────────────────────────
function TermInstance({ termId, shell, active }) {
  const containerRef = useRef(null);
  const xtermRef     = useRef(null);
  const fitRef       = useRef(null);
  const buf          = useRef("");
  const cwd          = useRef(SIM_CWD_INIT);
  const hist         = useRef([]);
  const histIdx      = useRef(-1);

  const writePS = useCallback(() => {
    xtermRef.current?.write(`\r\n${G}${cwd.current}${R} ${C}$${R} `);
  }, []);

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;
    let term, fit;

    (async () => {
      try {
        const { Terminal }      = await import("@xterm/xterm");
        const { FitAddon }      = await import("@xterm/addon-fit");
        const { WebLinksAddon } = await import("@xterm/addon-web-links");

        term = new Terminal({
          theme: XTERM_THEME,
          fontFamily: "'JetBrains Mono','Cascadia Code',Consolas,monospace",
          fontSize: 13, lineHeight: 1.45, cursorBlink: true, cursorStyle: "block", scrollback: 5000,
        });
        fit  = new FitAddon();
        term.loadAddon(fit);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fit.fit();
        xtermRef.current = term;
        fitRef.current   = fit;

        term.writeln(`${C}◈ Way AI Code — Terminal${R}`);
        if (!IS_TAURI) {
          term.writeln(`${D}  Browser simulation  •  type 'help' for commands${R}`);
          term.writeln(`${D}  npm run tauri:dev for a real shell${R}`);
        }

        if (IS_TAURI) {
          await spawnPTY(termId, shell, d => term.write(d), () => {});
          term.onData(d => writePTY(termId, d));
        } else {
          writePS();
          term.onKey(({ key, domEvent }) => {
            const k = domEvent.key;
            if (k === "Enter") {
              const cmd = buf.current;
              if (cmd.trim()) { hist.current.unshift(cmd); histIdx.current = -1; }
              term.write("\r\n");
              const out = simCmd(cmd, cwd.current, next => { cwd.current = next; });
              if (out === "\x1b[2J\x1b[H") term.clear();
              else if (out) term.write(out);
              buf.current = "";
              writePS();
            } else if (k === "Backspace") {
              if (buf.current.length > 0) { buf.current = buf.current.slice(0,-1); term.write("\b \b"); }
            } else if (k === "ArrowUp") {
              const h = hist.current;
              if (histIdx.current < h.length-1) {
                histIdx.current++;
                const s = h[histIdx.current];
                term.write("\r\x1b[K");
                term.write(`${G}${cwd.current}${R} ${C}$${R} ${s}`);
                buf.current = s;
              }
            } else if (k === "ArrowDown") {
              if (histIdx.current > 0) {
                histIdx.current--;
                const s = hist.current[histIdx.current];
                term.write("\r\x1b[K");
                term.write(`${G}${cwd.current}${R} ${C}$${R} ${s}`);
                buf.current = s;
              } else if (histIdx.current === 0) {
                histIdx.current = -1;
                term.write("\r\x1b[K");
                term.write(`${G}${cwd.current}${R} ${C}$${R} `);
                buf.current = "";
              }
            } else if (domEvent.ctrlKey && k === "c") {
              term.write("^C"); buf.current = ""; writePS();
            } else if (domEvent.ctrlKey && k === "l") {
              term.clear(); writePS();
            } else if (key && !domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey) {
              buf.current += key; term.write(key);
            }
          });
        }

        const ro = new ResizeObserver(() => { try { fit?.fit(); } catch {} });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
      } catch(e) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="padding:12px;font-family:monospace;font-size:12px;color:#ccc;background:#1e1e1e;height:100%">◈ Way AI Code Terminal<br/><span style="color:#f44747">xterm.js load failed — run: npm install</span></div>`;
        }
      }
    })();

    return () => {
      killPTY(termId);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current   = null;
    };
  }, [termId]);

  useEffect(() => {
    if (active) setTimeout(() => { try { fitRef.current?.fit(); xtermRef.current?.focus(); } catch {} }, 60);
  }, [active]);

  return <div ref={containerRef} className="xterm-container" style={{ display:active?"flex":"none" }}/>;
}

// ── Terminal Panel (multi-tab) ────────────────────────────────────────────────
let _nid = 1;

export default function TerminalPanel({ onClose, embedded = false, height: controlledHeight, onHeightChange }) {
  const [tabs,     setTabs]     = useState(() => [{ id:_nid++, shell:SHELLS[0], title:SHELLS[0].label }]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const [picker,   setPicker]   = useState(false);
  const [height,   setHeight]   = useState(220);
  const panelHeight = controlledHeight ?? height;

  const addTab = useCallback((shell) => {
    const id = _nid++;
    setTabs(p => [...p, { id, shell: shell||SHELLS[0], title: shell?.label||SHELLS[0].label }]);
    setActiveId(id);
    setPicker(false);
  }, []);

  const closeTab = useCallback((id) => {
    killPTY(id);
    setTabs(p => {
      const rem = p.filter(t => t.id !== id);
      if (activeId===id && rem.length) setActiveId(rem[rem.length-1].id);
      return rem;
    });
  }, [activeId]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const sy = e.clientY, sh = panelHeight;
    const mv = mv => {
      const next = Math.max(120, Math.min(600, sh + sy - mv.clientY));
      if (onHeightChange) onHeightChange(next);
      else setHeight(next);
    };
    const up = () => { window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  }, [panelHeight, onHeightChange]);

  if (!tabs.length) return null;

  return (
    <div className={`terminal-panel ${embedded ? "terminal-embedded" : ""}`} style={embedded ? { height:"100%" } : { height: panelHeight }}>
      {!embedded && <div className="term-drag-handle" onMouseDown={startDrag}/>}
      <div className="term-header">
        <div className="term-tab-list">
          {tabs.map(t => (
            <div key={t.id} className={`term-tab ${t.id===activeId?"term-tab-active":""}`} onClick={()=>setActiveId(t.id)}>
              <span className="term-tab-icon">⌨</span>
              <span className="term-tab-label">{t.title}</span>
              {tabs.length>1 && <button className="term-tab-close" onClick={e=>{e.stopPropagation();closeTab(t.id);}}>×</button>}
            </div>
          ))}
          <div className="term-new-wrap">
            <button className="term-new-btn" title="New terminal" onClick={()=>SHELLS.length>1?setPicker(p=>!p):addTab()}>+</button>
            {picker && (
              <div className="term-shell-picker">
                {SHELLS.map(s=><button key={s.id} className="term-shell-opt" onClick={()=>addTab(s)}>{s.label}</button>)}
              </div>
            )}
          </div>
        </div>
        <div className="term-controls">
          <button className="term-ctrl-btn" title="New terminal" onClick={()=>addTab()}>+</button>
          {onClose && <button className="term-ctrl-btn" title="Close panel"  onClick={onClose}>×</button>}
        </div>
      </div>
      <div className="term-body">
        {tabs.map(t => <TermInstance key={t.id} termId={t.id} shell={t.shell} active={t.id===activeId}/>)}
      </div>
    </div>
  );
}
