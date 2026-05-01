/**
 * Way AI Code - Terminal.jsx
 * Integrated terminal panel with profile picker, session list, and Tauri shell spawn.
 */

import { useState, useRef, useEffect, useCallback } from "react";

const IS_TAURI = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
const IS_WINDOWS = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

const SHELLS = IS_TAURI
  ? (IS_WINDOWS
      ? [
          { id:"pwsh", label:"PowerShell", command:"pwsh", args:["-NoLogo"] },
          { id:"powershell", label:"Windows PowerShell", command:"powershell.exe", args:["-NoLogo"] },
          { id:"cmd", label:"Command Prompt", command:"cmd.exe", args:["/K"] },
        ]
      : [
          { id:"bash", label:"bash", command:"bash", args:["--login"] },
          { id:"zsh", label:"zsh", command:"zsh", args:["--login"] },
          { id:"sh", label:"sh", command:"sh", args:[] },
        ])
  : [{ id:"browser", label:"Browser Sim", command:"browser", args:[] }];

const XTERM_THEME = {
  background:"#1e1e1e", foreground:"#cccccc", cursor:"#aeafad", cursorAccent:"#1e1e1e",
  black:"#1e1e1e", red:"#f44747", green:"#608b4e", yellow:"#dcdcaa",
  blue:"#569cd6", magenta:"#c678dd", cyan:"#4ec9b0", white:"#d4d4d4",
  brightBlack:"#808080", brightRed:"#f44747", brightGreen:"#4ec9b0",
  brightYellow:"#dcdcaa", brightBlue:"#569cd6", brightMagenta:"#c678dd",
  brightCyan:"#9cdcfe", brightWhite:"#ffffff",
};

const _pty = {};
const R = "\x1b[0m";
const G = "\x1b[32m";
const B = "\x1b[34m";
const C = "\x1b[36m";
const Y = "\x1b[33m";
const RE = "\x1b[31m";
const D = "\x1b[2m";
const SIM_CWD_INIT = "~/way-ai-code";

function stripDangerousEscapes(data) {
  return String(data || "")
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/\x1b[P_X^][^\x1b]*\x1b\\/g, "")
    .replace(/\x1b[^a-zA-Z\[\]()#;?]*[a-zA-Z]/g, (m) => {
      const safe = /\x1b(\[[\d;]*[A-HJKSTfmsu]|[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz])/;
      return safe.test(m) ? m : "";
    });
}

async function spawnPTY(id, shell, onData, onExit) {
  if (!IS_TAURI) return null;
  try {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const child = await Command.create(shell.command, shell.args, { encoding:"utf-8" }).spawn();
    child.stdout.on("data", d => onData(stripDangerousEscapes(d)));
    child.stderr.on("data", d => onData(stripDangerousEscapes(d)));
    child.on("close", ({ code }) => {
      onData(`\r\n\x1b[33mProcess exited (${code ?? "unknown"})\x1b[0m\r\n`);
      onExit(code);
    });
    _pty[id] = { child };
    return child;
  } catch(e) {
    onData(`\r\n\x1b[31mShell error: ${e?.message || e}\x1b[0m\r\n`);
    onData(`\x1b[2mCheck shell permissions and profile configuration.\x1b[0m\r\n`);
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

function simCmd(raw, cwd, setCwd) {
  const parts = raw.trim().split(/\s+/);
  const cmd = parts[0] || "";
  const args = parts.slice(1);

  switch(cmd) {
    case "": return "";
    case "clear": return "\x1b[2J\x1b[H";
    case "pwd": return cwd + "\r\n";
    case "whoami": return "wayai\r\n";
    case "date": return new Date().toString() + "\r\n";
    case "echo": return args.join(" ") + "\r\n";
    case "node":
      if (args[0] === "-v" || args[0] === "--version") return "v24.12.0\r\n";
      return `${D}(browser mode)${R}\r\n`;
    case "ls":
    case "dir":
      return [`${B}src/${R}`, `${B}src-tauri/${R}`, `${Y}package.json${R}`, `${Y}vite.config.js${R}`, `${D}index.html${R}`].join("  ") + "\r\n";
    case "cd": {
      const t = args[0] || "~/way-ai-code";
      setCwd(t.startsWith("~") ? t : `~/way-ai-code/${t}`.replace(/\/\.$/, ""));
      return "";
    }
    case "git":
      if (args[0] === "status") return `${G}On branch main\nnothing to commit${R}\r\n`;
      if (args[0] === "log") return `${Y}a1b2c3d${R} feat: add terminal\n${Y}e4f5g6h${R} feat: file explorer\r\n`;
      return `${D}git ${args.join(" ")} simulated${R}\r\n`;
    case "npm":
      if (args[0] === "run" && args[1] === "dev") return `${G}VITE ready\nLocal: http://localhost:1420/${R}\r\n`;
      if (args[0] === "install") return `${G}added packages${R}\r\n`;
      if (args[0] === "run" && args[1] === "build") return `${G}built successfully${R}\r\n`;
      return `${D}npm ${args.join(" ")} simulated${R}\r\n`;
    case "help":
      return [
        `${C}Way AI Code Terminal${R}`,
        "  ls, cd, pwd, echo, date, whoami",
        "  git status/log",
        "  npm install/run dev/run build",
        "  node -v, clear, help",
        `${D}Run inside Tauri for real shell execution.${R}`,
      ].join("\r\n") + "\r\n";
    default:
      return `${RE}${cmd}: command not found${R} ${D}(browser simulation)${R}\r\n`;
  }
}

function TermInstance({ termId, shell, active }) {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const resizeRef = useRef(null);
  const buf = useRef("");
  const cwd = useRef(SIM_CWD_INIT);
  const hist = useRef([]);
  const histIdx = useRef(-1);

  const prompt = useCallback(() => {
    xtermRef.current?.write(`\r\n${G}${cwd.current}${R} ${C}$${R} `);
  }, []);

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return undefined;
    let disposed = false;

    (async () => {
      try {
        const { Terminal } = await import("@xterm/xterm");
        const { FitAddon } = await import("@xterm/addon-fit");
        const { WebLinksAddon } = await import("@xterm/addon-web-links");
        if (disposed || !containerRef.current) return;

        const term = new Terminal({
          theme: XTERM_THEME,
          fontFamily: "'JetBrains Mono','Cascadia Code',Consolas,monospace",
          fontSize: 13,
          lineHeight: 1.4,
          cursorBlink: true,
          cursorStyle: "block",
          scrollback: 8000,
          convertEol: true,
          allowProposedApi: true,
          copyOnSelectionChange: true,
          rightClickSelectsWord: true,
          macOptionIsMeta: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fit.fit();
        xtermRef.current = term;
        fitRef.current = fit;

        // Clipboard: Ctrl+C copies selection, Ctrl+V pastes
        term.attachCustomKeyEventHandler((e) => {
          if (e.type !== "keydown") return true;
          if (e.ctrlKey && e.key === "v") {
            navigator.clipboard.readText()
              .then(text => {
                if (!text) return;
                if (IS_TAURI) {
                  writePTY(termId, text);
                } else {
                  buf.current += text;
                  term.write(text);
                }
              })
              .catch(() => {});
            return false; // suppress default
          }
          if (e.ctrlKey && e.key === "c" && term.hasSelection()) {
            const sel = term.getSelection();
            if (sel) {
              navigator.clipboard.writeText(sel).catch(() => {});
              return false;
            }
          }
          return true;
        });

        // Right-click context menu
        containerRef.current.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          const sel = term.getSelection();
          if (sel) {
            navigator.clipboard.writeText(sel).catch(() => {});
          } else {
            navigator.clipboard.readText()
              .then(text => {
                if (!text) return;
                if (IS_TAURI) writePTY(termId, text);
                else { buf.current += text; term.write(text); }
              })
              .catch(() => {});
          }
        });

        term.writeln(`${C}Way AI Code Terminal${R} ${D}${shell.label}${R}`);
        if (IS_TAURI) {
          await spawnPTY(termId, shell, d => { term.write(d); term.scrollToBottom(); }, () => {});
          term.onData(d => writePTY(termId, d));
        } else {
          term.writeln(`${D}Browser simulation. Type help for commands.${R}`);
          prompt();
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
              prompt();
            } else if (k === "Backspace") {
              if (buf.current.length > 0) { buf.current = buf.current.slice(0, -1); term.write("\b \b"); }
            } else if (k === "ArrowUp") {
              if (histIdx.current < hist.current.length - 1) {
                histIdx.current++;
                const s = hist.current[histIdx.current];
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
            } else if (domEvent.ctrlKey && k.toLowerCase() === "c") {
              term.write("^C");
              buf.current = "";
              histIdx.current = -1;
              prompt();
            } else if (domEvent.ctrlKey && k.toLowerCase() === "l") {
              term.clear();
              prompt();
            } else if (key && !domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey) {
              buf.current += key;
              term.write(key);
            }
          });
        }

        const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
        ro.observe(containerRef.current);
        resizeRef.current = ro;
      } catch(e) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div class="term-fallback">Terminal failed to load<br/><span>${String(e?.message || e)}</span></div>`;
        }
      }
    })();

    return () => {
      disposed = true;
      resizeRef.current?.disconnect();
      resizeRef.current = null;
      killPTY(termId);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [prompt, shell, termId]);

  useEffect(() => {
    if (active) {
      setTimeout(() => {
        try {
          fitRef.current?.fit();
          xtermRef.current?.focus();
        } catch {}
      }, 60);
    }
  }, [active]);

  return <div ref={containerRef} className="xterm-container" style={{ display:active ? "flex" : "none" }}/>;
}

let _nid = 1;

export default function TerminalPanel({ onClose, embedded = false, height: controlledHeight, onHeightChange }) {
  const [tabs, setTabs] = useState(() => [{ id:_nid++, shell:SHELLS[0], title:SHELLS[0].label }]);
  const [activeId, setActiveId] = useState(tabs[0]?.id || null);
  const [profileId, setProfileId] = useState(SHELLS[0].id);
  const [height, setHeight] = useState(220);
  const panelHeight = controlledHeight ?? height;
  const selectedShell = SHELLS.find(s => s.id === profileId) || SHELLS[0];
  const activeTab = tabs.find(t => t.id === activeId) || tabs[0];

  const addTab = useCallback((shell = selectedShell, titlePrefix = "") => {
    const id = _nid++;
    const title = `${titlePrefix}${shell.label}`;
    setTabs(p => [...p, { id, shell, title }]);
    setActiveId(id);
  }, [selectedShell]);

  const closeTab = useCallback((id) => {
    killPTY(id);
    setTabs(p => {
      const rem = p.filter(t => t.id !== id);
      if (activeId === id) setActiveId(rem[rem.length - 1]?.id || null);
      return rem;
    });
  }, [activeId]);

  const killActive = useCallback(() => {
    if (activeId != null) closeTab(activeId);
  }, [activeId, closeTab]);

  const killAll = useCallback(() => {
    tabs.forEach(t => killPTY(t.id));
    setTabs([]);
    setActiveId(null);
  }, [tabs]);

  const splitTerminal = useCallback(() => {
    addTab(activeTab?.shell || selectedShell, "Split ");
  }, [activeTab, addTab, selectedShell]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const sy = e.clientY;
    const sh = panelHeight;
    const mv = ev => {
      const next = Math.max(120, Math.min(620, sh + sy - ev.clientY));
      if (onHeightChange) onHeightChange(next);
      else setHeight(next);
    };
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [panelHeight, onHeightChange]);

  return (
    <div className={`terminal-panel ${embedded ? "terminal-embedded" : ""}`} style={embedded ? { height:"100%" } : { height:panelHeight }}>
      {!embedded && <div className="term-drag-handle" onMouseDown={startDrag}/>}
      <div className="term-toolbar">
        <div className="term-toolbar-left">
          <span className="term-section-title">TERMINAL</span>
          <span className="term-active-title">{activeTab?.title || "No terminal"}</span>
        </div>
        <div className="term-toolbar-actions">
          <select className="term-profile" value={profileId} title="Terminal profile" onChange={e=>setProfileId(e.target.value)}>
            {SHELLS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="term-icon-btn" title="New Terminal" onClick={()=>addTab()}>+</button>
          <button className="term-icon-btn" title="Split Terminal" disabled={!tabs.length} onClick={splitTerminal}>⇲</button>
          <button className="term-icon-btn" title="Kill Terminal" disabled={!tabs.length} onClick={killActive}>🗑</button>
          <button className="term-icon-btn" title="Kill All Terminals" disabled={!tabs.length} onClick={killAll}>×</button>
          {onClose && <button className="term-icon-btn" title="Close Panel" onClick={onClose}>▾</button>}
        </div>
      </div>
      <div className="term-workspace">
        <div className="term-body">
          {tabs.length ? (
            tabs.map(t => <TermInstance key={t.id} termId={t.id} shell={t.shell} active={t.id===activeId}/>)
          ) : (
            <div className="term-empty">
              <div>No terminal session</div>
              <button className="btn-primary" onClick={()=>addTab()}>Create Terminal</button>
            </div>
          )}
        </div>
        <div className="term-session-list">
          {tabs.map(t => (
            <button key={t.id} className={`term-session ${t.id===activeId ? "active" : ""}`} onClick={()=>setActiveId(t.id)} title={t.title}>
              <span className="term-session-icon">›_</span>
              <span className="term-session-name">{t.title}</span>
              <span className="term-session-close" onClick={e=>{e.stopPropagation();closeTab(t.id);}}>×</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
