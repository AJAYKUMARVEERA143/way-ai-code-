# ◈ Way AI Code — Complete Setup & Usage Guide

AI-powered code editor with smart multi-account rotation.

---

## ⚡ Quick Start

### Prerequisites

```bash
# 1. Node.js v18+  →  https://nodejs.org
node --version

# 2. Rust (for Tauri desktop build)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 3. Tauri CLI
cargo install tauri-cli
```

### Install & Run

```bash
cd way-ai-code

# Install dependencies
npm install

# Run in browser (fastest for testing)
npm run dev

# Run as desktop app
npm run tauri:dev

# Build installer (.exe / .dmg / .deb / .AppImage)
npm run tauri:build
```

---

## 🤖 AI Accounts Setup

Open the **Accounts panel** (people icon in activity bar) → click **+ Add**

### Your accounts:

| Provider       | How many | Get API key |
|----------------|----------|-------------|
| ChatGPT        | 4 ×      | https://platform.openai.com/api-keys |
| Claude Pro     | 2 ×      | https://console.anthropic.com |
| GitHub Copilot | 1 × Pro  | Settings → Copilot → API key |
| Ollama (local) | auto     | No key — install ollama.ai |
| Gemini (free)  | optional | https://aistudio.google.com |
| Groq (free)    | optional | https://console.groq.com |

### Add each account:

1. Click **+ Add** in Accounts panel
2. Select provider (ChatGPT, Claude, etc.)
3. Enter label: "GPT Account 1", "Claude Pro 1" etc.
4. Paste API key
5. Click **Add Account**
6. Repeat for all accounts

---

## 🔄 Auto-Rotation Logic

```
Request sent
    ↓
Active account → API call
    ↓
Success → continue ✓
    ↓ (on error)
Check error message:
  - rate limit / 429 / quota → mark "limited"
  - 3 consecutive errors    → mark "error"
    ↓
Find next active account
    ↓
Toast: "↻ GPT Account 1 → GPT Account 2 (Limit hit)"
    ↓
Auto-retry request on new account
```

**Status shown in:**
- Bottom status bar (always visible)
- Toast notification when switching
- Accounts panel (full status per account)

---

## 🧠 Smart Router

The Smart Router scores providers by latency + cost + error rate.

| Strategy  | Best for |
|-----------|----------|
| latency   | Fast responses, quick fixes |
| cost      | Minimize API spending |
| balanced  | Best overall (default) |

Switch strategy in **Accounts panel** → Router row.

---

## 💻 Editor Layout

| Panel          | Shortcut | What it does |
|----------------|----------|--------------|
| Explorer       | Click 📁  | Open/browse files |
| Search         | Click 🔍  | Search in editor |
| Source Control | Click ⎇   | Git commit, push, pull |
| Extensions     | Click ⊞   | Install Python, Node, etc |
| AI Chat        | Click 💬  | Chat with AI about code |
| Accounts       | Click 👥  | Manage all AI accounts |

---

## 📝 Editor Features

- **Monaco Editor** — industry-standard code editor engine
- Multi-tab file editing
- Syntax highlighting for 13+ languages
- Bracket pair colorization
- Code folding
- Minimap
- IntelliSense suggestions

---

## ⌨️ Chat Usage

1. **Select code** in editor (optional — gives AI context)
2. Click a **quick action**: Explain / Fix / Optimize / Tests / Comment / Refactor
3. Or type in the chat box and press **Enter**
4. Click **↩ Insert** in any code block to apply to editor
5. Click **Copy** to copy code to clipboard

---

## 🟢 Local AI (Offline Mode)

When Jio/Airtel is down — use Ollama:

```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2          # general purpose
ollama pull qwen2.5-coder     # best for code
ollama pull deepseek-coder    # great coder

# Way AI Code auto-detects Ollama on startup
# No API key needed
```

---

## 🏗️ Project Structure

```
way-ai-code/
├── src/
│   ├── App.jsx              ← Main app layout
│   ├── main.jsx             ← React entry point
│   ├── index.css            ← Dark theme styles
│   └── lib/
│       └── AccountManager.js ← Smart rotation engine
├── src-tauri/
│   └── tauri.conf.json      ← Desktop app config
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## 🔧 Troubleshooting

**App won't start:**
```bash
rm -rf node_modules
npm install
npm run dev
```

**Ollama not detected:**
```bash
ollama serve          # make sure it's running
curl localhost:11434  # should return Ollama version
```

**API key not working:**
- Check key has no extra spaces
- Verify billing is active on the account
- Try resetting the account in Accounts panel (↻ button)

**Build fails (Tauri):**
```bash
rustup update
cargo install tauri-cli --force
npm run tauri:dev
```
