/**
 * Way AI Code - Terminal.jsx
 * VS Code-style terminal panel: horizontal tab bar, full-width content, compact icon actions.
 */

import { useState, useRef, useEffect, useCallback } from "react";

const IS_TAURI = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
const IS_WINDOWS = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

const SHELLS = IS_TAURI
  ? (IS_WINDOWS
      ? [
          { id: "pwsh",       label: "PowerShell",         icon: "PS",  command: "pwsh",          args: ["-NoLogo"] },
          { id: "powershell", label: "Windows PowerShell", icon: "PS",  command: "powershell.exe", args: ["-NoLogo"] },
          { id: "cmd",        label: "Command Prompt",      icon: "cmd", command: "cmd.exe",        args: ["/K"] },
        ]
      : [
          { id: "bash", label: "bash", icon: "sh",  command: "bash", args: ["--login"] },
          { id: "zsh",  label: "zsh",  icon: "zsh", command: "zsh",  args: ["--login"] },
          { id: "sh",   label: "sh",   icon: "sh",  command: "sh",   args: [] },
        ])
  : [{ id: "browser", label: "Browser Sim", icon: "~", command: "browser", args: [] }];

const XTERM_THEME = {
  background:    "#1e1e1e",
  foreground:    "#cccccc",
  cursor:        "#ffffff",
  cursorAccent:  "#1e1e1e",
  black:         "#000000",
  red:           "#cd3131",
  green:         "#0dbc79",
  yellow:        "#e5e510",
  blue:          "#2472c8",
  magenta:       "#bc3fbc",
  cyan:          "#11a8cd",
  white:         "#e5e5e5",
  brightBlack:   "#666666",
  brightRed:     "#f14c4c",
  brightGreen:   "#23d18b",
  brightYellow:  "#f5f543",
  brightBlue:    "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan:    "#29b8db",
  brightWhite:   "#e5e5e5",
};

const _pty = {};
const R  = "\x1b[0m";
const G  = "\x1b[32m";
const C  = "\x1b[36m";
const Y  = "\x1b[33m";
const B  = "\x1b[34m";
const RE = "\x1b[31m";
const D  = "\x1b[2m";
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
    const child = await Command.create(shell.command, shell.args, { encoding: "utf-8" }).spawn();
    child.stdout.on("data", d => onData(stripDangerousEscapes(d)));
    child.stderr.on("data", d => onData(stripDangerousEscapes(d)));
    child.on("close", ({ code }) => {
      onData(`\r\n\x1b[33mProcess exited (${code ?? "unknown"})\x1b[0m\r\n`);
      onExit(code);
    });
    _pty[id] = { child };
    return child;
  } catch (e) {
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
  const cmd   = parts[0] || "";
  const args  = parts.slice(1);
  switch (cmd) {
    case "":      return "";
    case "clear": return "\x1b[2J\x1b[H";
    case "pwd":   return cwd + "\r\n";
    case "whoami":return "wayai\r\n";
    case "date":  return new Date().toString() + "\r\n";
    case "echo":  return args.join(" ") + "\r\n";
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
      if (args[0] === "log")    return `${Y}a1b2c3d${R} feat: add terminal\n${Y}e4f5g6h${R} feat: file explorer\r\n`;
      return `${D}git ${args.join(" ")} simulated${R}\r\n`;
    case "npm":
      if (args[0] === "run" && args[1] === "dev")  return `${G}VITE ready\nLocal: http://localhost:1420/${R}\r\n`;
      if (args[0] === "install")                    return `${G}added packages${R}\r\n`;
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

function TermInstance({ termId, shell, active, actionSignal }) {
  const containerRef = useRef(null);
  const xtermRef     = useRef(null);
  const fitRef       = useRef(null);
  const resizeRef    = useRef(null);
  const buf          = useRef("");
  const cwd          = useRef(SIM_CWD_INIT);
  const hist         = useRef([]);
  const histIdx      = useRef(-1);

  const prompt = useCallback(() => {
    xtermRef.current?.write(`\r\n${G}${cwd.current}${R} ${C}>${R} `);
  }, []);

  const writePromptLine = useCallback((text) => {
    xtermRef.current?.write(`\r\x1b[K${G}${cwd.current}${R} ${C}>${R} ${text}`);
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      if (IS_TAURI) { await writePTY(termId, text); }
      else { buf.current += text; xtermRef.current?.write(text); }
    } catch {}
  }, [termId]);

  const copySelection = useCallback(async () => {
    const term = xtermRef.current;
    if (!term?.hasSelection()) return;
    const sel = term.getSelection();
    if (!sel) return;
    try { await navigator.clipboard.writeText(sel); } catch {}
  }, []);

  const clearTerminal = useCallback(async () => {
    const term = xtermRef.current;
    if (!term) return;
    term.clear();
    if (IS_TAURI) { await writePTY(termId, `${IS_WINDOWS ? "cls" : "clear"}\r`); return; }
    buf.current     = "";
    histIdx.current = -1;
    term.writeln(`${D}Screen cleared${R}`);
    prompt();
  }, [prompt, termId]);

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return undefined;
    let disposed = false;
    (async () => {
      try {
        const { Terminal }      = await import("@xterm/xterm");
        const { FitAddon }      = await import("@xterm/addon-fit");
        const { WebLinksAddon } = await import("@xterm/addon-web-links");
        if (disposed || !containerRef.current) return;

        const term = new Terminal({
          theme:                XTERM_THEME,
          fontFamily:           "'Cascadia Code','JetBrains Mono',Consolas,'Courier New',monospace",
          fontSize:             13,
          lineHeight:           1.5,
          letterSpacing:        0,
          cursorBlink:          true,
          cursorStyle:          "block",
          scrollback:           10000,
          convertEol:           true,
          allowProposedApi:     true,
          copyOnSelectionChange:true,
          rightClickSelectsWord:true,
          macOptionIsMeta:      true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        xtermRef.current = term;
        fitRef.current   = fit;

        // Wait one animation frame so the container has real dimensions before fit + write
        await new Promise(res => requestAnimationFrame(res));
        if (disposed) return;
        fit.fit();

        term.writeln(`\x1b[2m# ${shell.label}   Ctrl+Shift+C copy  |  Ctrl+Shift+V paste  |  Ctrl+L clear\x1b[0m`);

        term.attachCustomKeyEventHandler((e) => {
          if (e.type !== "keydown") return true;
          if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") ||
              (e.ctrlKey && e.key.toLowerCase() === "c" && xtermRef.current?.hasSelection())) {
            copySelection(); return false;
          }
          if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v") ||
              (e.ctrlKey && e.key.toLowerCase() === "v")) {
            pasteFromClipboard(); return false;
          }
          if (e.ctrlKey && e.key.toLowerCase() === "l") {
            clearTerminal(); return false;
          }
          return true;
        });

        containerRef.current.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (term.hasSelection()) copySelection();
          else pasteFromClipboard();
        });

        if (IS_TAURI) {
          await spawnPTY(termId, shell, d => { term.write(d); term.scrollToBottom(); }, () => {});
          term.onData(d => writePTY(termId, d));
        } else {
          term.writeln(`${D}Browser simulation — type help for commands.${R}`);
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
                writePromptLine(s); buf.current = s;
              }
            } else if (k === "ArrowDown") {
              if (histIdx.current > 0) {
                histIdx.current--;
                const s = hist.current[histIdx.current];
                writePromptLine(s); buf.current = s;
              } else if (histIdx.current === 0) {
                histIdx.current = -1;
                writePromptLine(""); buf.current = "";
              }
            } else if (domEvent.ctrlKey && k.toLowerCase() === "c") {
              term.write("^C"); buf.current = ""; histIdx.current = -1; prompt();
            } else if (domEvent.ctrlKey && k.toLowerCase() === "l") {
              clearTerminal();
            } else if (key && key.length === 1 && !domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey) {
              buf.current += key; term.write(key);
            }
          });
        }

        const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
        ro.observe(containerRef.current);
        resizeRef.current = ro;
      } catch (e) {
        if (containerRef.current)
          containerRef.current.innerHTML = `<div class="term-fallback">Terminal failed to load<br/><span>${String(e?.message || e)}</span></div>`;
      }
    })();

    return () => {
      disposed = true;
      resizeRef.current?.disconnect();
      resizeRef.current = null;
      killPTY(termId);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current   = null;
    };
  }, [prompt, shell, termId, clearTerminal, copySelection, pasteFromClipboard, writePromptLine]);

  useEffect(() => {
    if (!active) return;
    setTimeout(() => { try { fitRef.current?.fit(); xtermRef.current?.focus(); } catch {} }, 60);
  }, [active]);

  useEffect(() => {
    if (!active || !actionSignal?.id) return;
    if (actionSignal.type === "clear") clearTerminal();
    if (actionSignal.type === "copy")  copySelection();
    if (actionSignal.type === "paste") pasteFromClipboard();
  }, [actionSignal, active, clearTerminal, copySelection, pasteFromClipboard]);

  return (
    <div
      ref={containerRef}
      className={`term-xterm-pane${active ? " is-active" : ""}`}
      style={{ display: active ? "flex" : "none" }}
    />
  );
}

let _nid = 1;

export default function TerminalPanel({ onClose, embedded = false, height: controlledHeight, onHeightChange }) {
  const [tabs, setTabs]             = useState(() => [{ id: _nid++, shell: SHELLS[0], title: SHELLS[0].label }]);
  const [activeId, setActiveId]     = useState(tabs[0]?.id || null);
  const [profileId, setProfileId]   = useState(SHELLS[0].id);
  const [height, setHeight]         = useState(240);
  const [actionSignal, setActionSignal] = useState({ id: 0, type: "" });

  const panelHeight   = controlledHeight ?? height;
  const selectedShell = SHELLS.find(s => s.id === profileId) || SHELLS[0];
  const activeTab     = tabs.find(t => t.id === activeId) || tabs[0];

  const emitAction = useCallback((type) => setActionSignal({ id: Date.now(), type }), []);

  const addTab = useCallback((shell = selectedShell) => {
    const id = _nid++;
    setTabs(p => [...p, { id, shell, title: shell.label }]);
    setActiveId(id);
  }, [selectedShell]);

  const closeTab = useCallback((id) => {
    killPTY(id);
    setTabs(p => {
      const rem = p.filter(t => t.id !== id);
      if (activeId === id) setActiveId(rem[rem.length - 1]?.id ?? null);
      return rem;
    });
  }, [activeId]);

  const splitTerminal = useCallback(() => {
    const shell = activeTab?.shell || selectedShell;
    const id    = _nid++;
    setTabs(p => [...p, { id, shell, title: `Split: ${shell.label}` }]);
    setActiveId(id);
  }, [activeTab, selectedShell]);

  const killActive = useCallback(() => { if (activeId != null) closeTab(activeId); }, [activeId, closeTab]);

  const killAll = useCallback(() => {
    tabs.forEach(t => killPTY(t.id));
    setTabs([]);
    setActiveId(null);
  }, [tabs]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const sy = e.clientY;
    const sh = panelHeight;
    const mv = ev => {
      const next = Math.max(140, Math.min(700, sh + sy - ev.clientY));
      if (onHeightChange) onHeightChange(next); else setHeight(next);
    };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [panelHeight, onHeightChange]);

  return (
    <div
      className={`terminal-panel${embedded ? " terminal-embedded" : ""}`}
      style={embedded ? { height: "100%" } : { height: panelHeight }}
    >
      {!embedded && <div className="term-drag-handle" onMouseDown={startDrag} />}

      <div className="term-tabbar">
        <span className="term-panel-label">TERMINAL</span>

        <div className="term-tabs" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === activeId}
              className={`term-tab${t.id === activeId ? " active" : ""}`}
              onClick={() => setActiveId(t.id)}
              title={t.title}
            >
              <span className="term-tab-icon">{t.shell.icon}</span>
              <span className="term-tab-name">{t.title}</span>
              <span className="term-tab-close" title="Close" onClick={e => { e.stopPropagation(); closeTab(t.id); }}>&#215;</span>
            </button>
          ))}
        </div>

        <div className="term-tabbar-spacer" />

        <div className="term-tabbar-actions">
          <div className="term-tabbar-sep" />

          <button className="term-action-btn" title="New Terminal" onClick={() => addTab()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/></svg>
          </button>

          <button className="term-action-btn" title="Split Terminal" disabled={!tabs.length} onClick={splitTerminal}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h5v12H2V2Zm1 1v10h3V3H3Zm6-1h5v12H9V2Zm1 1v10h3V3h-3Z"/></svg>
          </button>

          <button className="term-action-btn" title="Kill Terminal" disabled={!tabs.length} onClick={killActive}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM5 2.5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5v1h2.5a.5.5 0 0 1 0 1H13v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-9H2.5a.5.5 0 0 1 0-1H5Zm1 1v9h1v-9H6Zm2 0v9h1v-9H8Zm2 0v9h1v-9h-1ZM4 4.5v9a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-9H4Z"/></svg>
          </button>

          <button className="term-action-btn" title="Kill All Terminals" disabled={!tabs.length} onClick={killAll}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm0 1v10h10V3H3Zm2.354 2.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 5.646Z"/></svg>
          </button>

          {onClose && (
            <>
              <div className="term-tabbar-sep" />
              <button className="term-action-btn" title="Minimize Panel" onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"/></svg>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="term-content">
        {tabs.length ? (
          tabs.map(t => (
            <TermInstance
              key={t.id}
              termId={t.id}
              shell={t.shell}
              active={t.id === activeId}
              actionSignal={actionSignal}
            />
          ))
        ) : (
          <div className="term-empty">
            <span>No terminal session</span>
            <button className="term-create-btn" onClick={() => addTab()}>New Terminal</button>
          </div>
        )}
      </div>
    </div>
  );
}