/**
 * Way AI Code — src/lib/fs.js
 * Tauri FS bridge + Browser mock FS
 * Mock paths match the ACTUAL project structure from screenshot
 */

export const IS_TAURI = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

async function invoke(cmd, args = {}) {
  if (IS_TAURI) {
    const { invoke: ti } = await import("@tauri-apps/api/core");
    return ti(cmd, args);
  }
  return mockInvoke(cmd, args);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const readDir      = (path, showHidden = false) => invoke("read_dir",      { path, showHidden }).then(r => r?.entries || r || []);
export const readFile     = (path)                     => invoke("read_file",     { path });
export const writeFile    = (path, content)            => invoke("write_file",    { path, content });
export const createFile   = (path)                     => invoke("create_file_cmd", { path });
export const deleteEntry  = (path)                     => invoke("delete_path",   { path });
export const renamePath   = (from, to)                 => invoke("rename_path",   { from, to });
export const createDir    = (path)                     => invoke("create_dir_cmd",{ path });
export const getHomeDir   = ()                         => invoke("get_home_dir");
export const searchFiles  = (root, query, max = 50)   => invoke("search_files",  { root, query, max });
export const detectTools  = ()                         => invoke("detect_tools");
export const packageScripts = (root)                   => invoke("package_scripts", { root });
export const runToolCommand = (root, tool, args = [], timeoutSecs = 30) =>
  invoke("run_tool_command", { root, tool, args, timeoutSecs });
export const npmInstall   = (root)                     => runToolCommand(root, "npm", ["install"], 120);
export const npmRunScript = (root, script)             => runToolCommand(root, "npm", ["run", script], 45);
export const pythonRunFile = (root, path)              => runToolCommand(root, "python", [path], 45);
export const gitClone     = (parentDir, repoUrl)       => invoke("git_clone", { parentDir, repoUrl });
export const gitStatus    = (root)                     => invoke("git_status",   { root });
export const gitLog       = (root, max = 8)            => invoke("git_log",      { root, max });
export const gitStage     = (root, path)               => invoke("git_stage",    { root, path });
export const gitUnstage   = (root, path)               => invoke("git_unstage",  { root, path });
export const gitCommit    = (root, message)            => invoke("git_commit",   { root, message });
export const gitPush      = (root)                     => invoke("git_push",     { root });
export const gitPull      = (root)                     => invoke("git_pull",     { root });

export async function openFolderDialog() {
  if (!IS_TAURI) return MOCK_ROOT;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ directory: true, multiple: false, title: "Open Folder" });
}

export async function openFileDialog() {
  if (!IS_TAURI) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ multiple: false, title: "Open File" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const formatSize = (b) => {
  if (!b) return "";
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`;
  return `${(b/1048576).toFixed(1)}MB`;
};

export const pathJoin = (...p) => p.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
export const pathDir  = (p)   => { const parts = p.replace(/\/$/, "").split("/"); parts.pop(); return parts.join("/") || "/"; };
export const pathName = (p)   => p.replace(/\/$/, "").split("/").pop() || p;
export const pathExt  = (p)   => { const n = pathName(p); const i = n.lastIndexOf("."); return i > 0 ? n.slice(i+1).toLowerCase() : ""; };
export const isHidden = (n)   => n.startsWith(".");

// ── Language detection ────────────────────────────────────────────────────────

const EXT_LANG = {
  js:"javascript", jsx:"javascript", mjs:"javascript", cjs:"javascript",
  ts:"typescript", tsx:"typescript",
  py:"python", pyw:"python",
  rs:"rust",
  go:"go",
  java:"java", kt:"kotlin",
  cpp:"cpp", cc:"cpp", cxx:"cpp", c:"c", cs:"csharp",
  css:"css", scss:"scss", less:"less",
  html:"html", htm:"html",
  json:"json", jsonc:"json",
  md:"markdown", mdx:"markdown",
  sql:"sql",
  sh:"shell", bash:"shell", zsh:"shell",
  toml:"toml", yml:"yaml", yaml:"yaml",
  xml:"xml", php:"php", rb:"ruby", swift:"swift",
  vue:"html", svelte:"html", dart:"dart", lua:"lua",
  graphql:"graphql", gql:"graphql",
  dockerfile:"dockerfile", txt:"plaintext",
  env:"plaintext", gitignore:"plaintext",
};

export const langFromExt  = (ext) => EXT_LANG[ext?.toLowerCase()] || "plaintext";
export const langFromPath = (p)   => langFromExt(pathExt(p));

export const LANG_COLOR = {
  javascript:"#f7df1e", typescript:"#3178c6", python:"#3572A5",
  rust:"#dea584", go:"#00ADD8", java:"#b07219", cpp:"#f34b7d",
  c:"#555555", csharp:"#178600", css:"#563d7c", html:"#e34c26",
  json:"#292929", markdown:"#083fa1", sql:"#e38c00", shell:"#89e051",
  yaml:"#cb171e", toml:"#9c4221", ruby:"#701516", swift:"#ffac45",
  kotlin:"#A97BFF", dart:"#00B4AB", graphql:"#e10098",
};

export const langColor = (ext) => LANG_COLOR[langFromExt(ext)] || "#888";

// ── Mock FS — matches exact screenshot file tree ──────────────────────────────
// Root = C:\Users\YourName\way-ai-code  on Windows
//       ~/way-ai-code on Linux/Mac
// We use a normalized forward-slash key: /way-ai-code

export const MOCK_ROOT = "/way-ai-code";

const MOCK = {
  "/way-ai-code": { type:"dir", children:{
    "src":          { type:"dir", children:{
      "App.jsx":    { type:"file", content:`// Way AI Code — App.jsx\n// Main application entry\n// This is the actual file content.\n\nimport { useState } from "react";\n\nexport default function App() {\n  return <div>Way AI Code ◈</div>;\n}\n` },
      "main.jsx":   { type:"file", content:`import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode><App /></React.StrictMode>\n);\n` },
      "index.css":  { type:"file", content:`/* Way AI Code — Global styles */\n\n*, *::before, *::after {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n  background: #1e1e1e;\n  color: #cccccc;\n  height: 100vh;\n  overflow: hidden;\n}\n` },
      "lib":        { type:"dir", children:{
        "AccountManager.js": { type:"file", content:`/**\n * Way AI Code — AccountManager.js\n * Smart multi-account rotation engine\n * Supports: ChatGPT×4, Claude×2, Copilot×1, Gemini, Groq, Ollama\n */\n\nexport const PROVIDERS = {\n  chatgpt:  { label: "ChatGPT",  icon: "⬛", color: "#10a37f" },\n  claude:   { label: "Claude",   icon: "🟠", color: "#d97706" },\n  copilot:  { label: "Copilot", icon: "⬡",  color: "#6e40c9" },\n  gemini:   { label: "Gemini",  icon: "◈",  color: "#4285f4" },\n  groq:     { label: "Groq",    icon: "▲",  color: "#f59e0b" },\n  ollama:   { label: "Ollama",  icon: "○",  color: "#7c3aed", local: true },\n};\n\nexport class AccountManager {\n  constructor(onChange) {\n    this.accounts = [];\n    this.activeId = null;\n    this.onChange = onChange || (() => {});\n  }\n  // ... full implementation\n}\n` },
        "fs.js":    { type:"file", content:`/**\n * Way AI Code — fs.js\n * Tauri file system bridge with browser mock fallback\n */\n\nconst IS_TAURI = typeof window !== "undefined" && "__TAURI__" in window;\n\nexport const readDir    = (path) => IS_TAURI ? tauriReadDir(path) : mockReadDir(path);\nexport const readFile   = (path) => IS_TAURI ? tauriReadFile(path) : mockReadFile(path);\nexport const writeFile  = (path, content) => IS_TAURI ? tauriWriteFile(path, content) : mockWriteFile(path, content);\n` },
      }},
      "components": { type:"dir", children:{
        "FileExplorer.jsx": { type:"file", content:`/**\n * Way AI Code — FileExplorer.jsx\n * File explorer component\n * Features: lazy loading, context menu, inline rename,\n *           new file/folder, search, drag-to-resize\n */\n\nimport { useState, useEffect, useCallback } from "react";\nimport { readDir, readFile, createFile, deleteEntry, renamePath } from "../lib/fs.js";\n\nexport default function FileExplorer({ onOpenFile, activeFile }) {\n  // ... full implementation\n}\n` },
        "FileExplorer.css": { type:"file", content:`/* Way AI Code — FileExplorer.css */\n\n.file-explorer {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  background: #252526;\n}\n\n.fe-row {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  padding: 2px 8px;\n  cursor: pointer;\n  font-size: 13px;\n  color: #969696;\n  min-height: 22px;\n}\n\n.fe-row:hover { background: rgba(255,255,255,0.04); color: #ccc; }\n.fe-row.fe-active { background: #094771; color: #fff; }\n` },
        "Terminal.jsx":     { type:"file", content:`/**\n * Way AI Code — Terminal.jsx\n * Real xterm.js terminal with Tauri shell plugin PTY\n * Browser fallback: smart command simulation\n *\n * Features:\n *  - Multiple terminal tabs\n *  - bash/zsh/powershell selection\n *  - xterm.js (real ANSI colors, cursor)\n *  - Drag-to-resize\n *  - Command history (arrow keys)\n */\n\nimport { useState, useRef, useEffect } from "react";\n\nconst IS_TAURI = typeof window !== "undefined" && "__TAURI__" in window;\n\nexport default function TerminalPanel({ onClose }) {\n  // ... full implementation\n}\n` },
        "Terminal.css":     { type:"file", content:`/* Way AI Code — Terminal.css */\n\n.terminal-panel {\n  display: flex;\n  flex-direction: column;\n  background: #1e1e1e;\n  border-top: 1px solid rgba(0,0,0,0.5);\n  flex-shrink: 0;\n  min-height: 120px;\n}\n\n.xterm-container {\n  width: 100%;\n  height: 100%;\n  padding: 6px 4px 4px 8px;\n}\n` },
      }},
    }},
    "src-tauri":  { type:"dir", children:{
      "src":      { type:"dir", children:{
        "main.rs": { type:"file", content:`// Way AI Code — Tauri Rust backend\n// Exposes: read_dir, read_file, write_file, create_file,\n//          delete_path, rename_path, create_dir, search_files\n\n#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\n\nuse serde::{Deserialize, Serialize};\nuse std::fs;\nuse std::path::{Path, PathBuf};\nuse tauri::command;\n\nfn main() {\n    tauri::Builder::default()\n        .plugin(tauri_plugin_shell::init())\n        .plugin(tauri_plugin_dialog::init())\n        .invoke_handler(tauri::generate_handler![\n            read_dir, read_file, write_file,\n            create_file_cmd, delete_path, rename_path,\n            create_dir_cmd, get_home_dir, search_files,\n        ])\n        .run(tauri::generate_context!())\n        .expect("error while running tauri application");\n}\n` },
      }},
      "Cargo.toml":       { type:"file", content:`[package]\nname = "way-ai-code"\nversion = "1.0.0"\nedition = "2021"\n\n[dependencies]\ntauri = { version = "2.0" }\ntauri-plugin-shell = "2.0"\ntauri-plugin-dialog = "2.0"\nserde = { version = "1.0", features = ["derive"] }\nserde_json = "1.0"\ndirs = "5.0"\n` },
      "tauri.conf.json":  { type:"file", content:`{\n  "productName": "Way AI Code",\n  "version": "1.0.0",\n  "identifier": "com.wayaicode.app"\n}\n` },
    }},
    "package.json":    { type:"file", content:`{\n  "name": "way-ai-code",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "tauri:dev": "tauri dev",\n    "tauri:build": "tauri build"\n  },\n  "dependencies": {\n    "@monaco-editor/react": "^4.6.0",\n    "@tauri-apps/api": "^2.0.0",\n    "@xterm/xterm": "^5.5.0",\n    "react": "^18.3.1",\n    "react-dom": "^18.3.1"\n  }\n}\n` },
    "vite.config.js":  { type:"file", content:`import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 1420, strictPort: true },\n});\n` },
    "README.md":       { type:"file", content:`# Way AI Code ◈\n\nAI-powered code editor with smart multi-account rotation.\n\n## Features\n- Monaco Editor (industry-standard code engine)\n- Multi-account AI: ChatGPT×4, Claude×2, GitHub Copilot×1\n- Smart auto-rotation on rate limit\n- Real file system via Tauri\n- Integrated terminal (xterm.js)\n- Git integration\n\n## Quick Start\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Tauri Desktop\n\`\`\`bash\nnpm run tauri:dev\nnpm run tauri:build\n\`\`\`\n` },
    ".gitignore":      { type:"file", content:`node_modules/\ndist/\n.env\n.env.local\nsrc-tauri/target/\n*.log\n` },
  }},
};

// ── Mock operations ───────────────────────────────────────────────────────────

function getMockNode(path) {
  const p = normPath(path);
  if (p === MOCK_ROOT || p === "/" || p === "") return MOCK[MOCK_ROOT];
  const rel = p.replace(MOCK_ROOT + "/", "").replace(MOCK_ROOT, "");
  if (!rel) return MOCK[MOCK_ROOT];
  const parts = rel.split("/").filter(Boolean);
  let node = MOCK[MOCK_ROOT];
  for (const part of parts) {
    if (!node || node.type !== "dir") return null;
    node = node.children?.[part];
  }
  return node;
}

function normPath(p) {
  // Normalize Windows backslashes and trailing slashes
  return p?.replace(/\\/g, "/").replace(/\/+$/, "") || MOCK_ROOT;
}

async function mockInvoke(cmd, args) {
  await new Promise(r => setTimeout(r, 20));

  switch (cmd) {
    case "get_home_dir": return MOCK_ROOT;

    case "read_dir": {
      const node = getMockNode(args.path);
      if (!node || node.type !== "dir") return { entries: [], path: args.path };
      const entries = Object.entries(node.children || {})
        .filter(([name]) => args.showHidden || !isHidden(name))
        .map(([name, child]) => {
          const childPath = normPath(args.path) + "/" + name;
          const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
          return {
            name,
            path: childPath,
            is_dir: child.type === "dir",
            size: child.type === "file" ? (child.content?.length || 0) : 0,
            ext,
            modified: Date.now() - Math.floor(Math.random() * 86400000),
          };
        })
        .sort((a, b) => b.is_dir - a.is_dir || a.name.localeCompare(b.name));
      return { entries, path: args.path };
    }

    case "read_file": {
      const node = getMockNode(args.path);
      if (!node || node.type !== "file") throw new Error(`File not found: ${args.path}`);
      return node.content || "";
    }

    case "write_file": {
      const node = getMockNode(args.path);
      if (node && node.type === "file") node.content = args.content;
      return null;
    }

    case "create_file_cmd": {
      const dir  = pathDir(normPath(args.path));
      const name = pathName(args.path);
      const parent = getMockNode(dir);
      if (parent?.type === "dir") parent.children[name] = { type: "file", content: "" };
      return null;
    }

    case "create_dir_cmd": {
      const dir  = pathDir(normPath(args.path));
      const name = pathName(args.path);
      const parent = getMockNode(dir);
      if (parent?.type === "dir") parent.children[name] = { type: "dir", children: {} };
      return null;
    }

    case "delete_path": {
      const dir  = pathDir(normPath(args.path));
      const name = pathName(args.path);
      const parent = getMockNode(dir);
      if (parent?.type === "dir") delete parent.children[name];
      return null;
    }

    case "rename_path": {
      const fromDir  = pathDir(normPath(args.from));
      const fromName = pathName(args.from);
      const toName   = pathName(args.to);
      const parent   = getMockNode(fromDir);
      if (parent?.type === "dir" && parent.children[fromName]) {
        parent.children[toName] = parent.children[fromName];
        delete parent.children[fromName];
      }
      return null;
    }

    case "search_files": {
      const q = args.query.toLowerCase();
      const results = [];
      const walk = (node, base) => {
        if (!node?.children) return;
        for (const [name, child] of Object.entries(node.children)) {
          if (results.length >= (args.max || 50)) return;
          const p = base + "/" + name;
          if (name.toLowerCase().includes(q)) {
            results.push({
              name, path: p,
              is_dir: child.type === "dir",
              size: child.type === "file" ? (child.content?.length || 0) : 0,
              ext: name.includes(".") ? name.split(".").pop() : "",
              modified: Date.now(),
            });
          }
          if (child.type === "dir") walk(child, p);
        }
      };
      walk(MOCK[MOCK_ROOT], MOCK_ROOT);
      return results;
    }

    case "detect_tools":
      return [
        { id:"python", label:"Python", command:"python", installed:true, version:"Python 3.12.0", path:"/usr/bin/python", install_hint:"Install Python from python.org or Microsoft Store" },
        { id:"node", label:"Node.js", command:"node", installed:true, version:"v24.12.0", path:"/usr/bin/node", install_hint:"Install Node.js LTS from nodejs.org" },
        { id:"npm", label:"NPM", command:"npm", installed:true, version:"10.9.8", path:"/usr/bin/npm", install_hint:"NPM is included with Node.js LTS" },
        { id:"git", label:"Git", command:"git", installed:true, version:"git version 2.45.0", path:"/usr/bin/git", install_hint:"Install Git for Windows from git-scm.com" },
      ];

    case "package_scripts":
      return [
        { name:"dev", command:"vite" },
        { name:"build", command:"vite build" },
        { name:"tauri:build", command:"tauri build" },
      ];

    case "run_tool_command":
      return {
        success: true,
        code: 0,
        stdout: `${args.tool} ${(args.args || []).join(" ")} simulated`,
        stderr: "",
      };

    case "git_clone":
      return {
        success: true,
        code: 0,
        stdout: `Cloned ${args.repoUrl} into ${args.parentDir}`,
        stderr: "",
      };

    case "git_status":
      return {
        branch: "main",
        staged: [{ path:"src/App.jsx", status:"M" }],
        unstaged: [{ path:"src/index.css", status:"M" }, { path:"README.md", status:"M" }],
        untracked: [{ path:"src/components/InlineDiff.jsx", status:"U" }],
        clean: false,
        raw: "## main\nM  src/App.jsx\n M src/index.css\n M README.md\n?? src/components/InlineDiff.jsx",
      };

    case "git_log":
      return [
        "a1b2c3d feat: add real terminal",
        "e4f5g6h feat: file explorer",
        "9a8b7c6 fix: account rotation",
        "1020304 init: way ai code",
      ].slice(0, args.max || 8);

    case "git_stage":
    case "git_unstage":
    case "git_commit":
    case "git_push":
    case "git_pull":
      return `${cmd.replace("git_", "git ")} simulated`;

    default: return null;
  }
}
