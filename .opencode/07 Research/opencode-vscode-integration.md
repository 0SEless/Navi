## Research: Integrating OpenCode with VS Code

### Summary
OpenCode has an official VS Code extension published by **SST** (`sst-dev.opencode`) with 722k+ installs. It integrates OpenCode directly into VS Code via keyboard shortcuts, terminal split views, and context sharing. A Beta extension with a full chat sidebar UI (`sst-dev.opencode-v2`) and several third-party extensions provide additional capabilities. The extension auto-installs when you run `opencode` in VS Code's integrated terminal.

### Extensions Overview

| Extension | Publisher | Installs | Type | Key Features |
|---|---|---|---|---|
| **opencode** (`sst-dev.opencode`) | SST | 722,327 | Terminal TUI integration | Quick Launch (`Ctrl+Esc`), New Session (`Ctrl+Shift+Esc`), Context Awareness, File References |
| **OpenCode Beta** (`sst-dev.opencode-v2`) | SST | 31,251 | Sidebar Chat UI | Chat panel, Session management, Model selection, Tool integration, Build Mode, Image support |
| **OpenCode UI** (`zgy.opencode-vscode-ui`) | zgy | N/A | Sidebar + Session Tabs | Session browser, Workspace-aware sidebar, Dedicated session tabs, Remote SSH, Todo tracking |
| **OpenCode GUI** (`TanShiyong.opencode-gui`) | TanShiyong | N/A | Sidebar + Diff View | Subagent tracking, Live code diffs, Git-backed undo/restore, Change lists |
| **OpenCode Connector** (`l3aro.opencode-connector`) | l3aro | N/A | TUI Editor Tab | File reference sending, Explain and Fix code actions, Multi-file selection |

### Step-by-Step Installation Guide

#### Prerequisites
- VS Code 1.80+ (1.94+ for some extensions)
- Node.js 18+ (if installing via npm)
- OpenCode CLI installed on system
- API key from an LLM provider (Anthropic, OpenAI, etc.) or OpenCode Zen/Go account

#### Step 1: Install the OpenCode CLI

```bash
# Recommended - official install script (macOS/Linux/WSL)
curl -fsSL https://opencode.ai/install | bash

# Using npm (cross-platform)
npm install -g opencode-ai

# Using Homebrew (macOS/Linux)
brew install anomalyco/tap/opencode

# Using Chocolatey (Windows)
choco install opencode

# Using Scoop (Windows)
scoop install opencode

# Using Bun
bun install -g opencode-ai
```

Verify:
```bash
opencode --version
```

#### Step 2: Auto-Install the VS Code Extension

1. Open VS Code
2. Open the integrated terminal (Ctrl+` on Win/Linux, Cmd+` on Mac)
3. Run:
   ```bash
   opencode
   ```
4. The extension installs automatically. Check Extensions panel (Ctrl+Shift+X).

> **Important:** You MUST run `opencode` inside VS Code's **integrated terminal**, not an external terminal. OpenCode detects VS Code via environment variables set by the IDE.

#### Step 3: Manual Extension Installation (if auto-install fails)

1. Open Extensions view (Ctrl+Shift+X)
2. Search for **"opencode"** by publisher **SST** (`sst-dev.opencode`)
3. Click **Install**
4. Alternatively, install **OpenCode Beta** (`sst-dev.opencode-v2`) for the full chat sidebar UI

**Troubleshooting:**
- Ensure `code` CLI is installed (Ctrl+Shift+P -> "Shell Command: Install 'code' command in PATH")
- Verify `code --version` works in terminal
- Check VS Code has permission to install extensions

#### Step 4: Authenticate with an AI Provider

```bash
# Interactive auth flow
opencode auth login

# Or inside OpenCode TUI:
/connect
```

Supported auth methods:
- **OpenCode Zen** - Managed model service (billed usage)
- **OpenCode Go** - Pay-as-you-go API
- **Anthropic** - Claude models (API key or OAuth)
- **OpenAI** - GPT models (API key)
- **GitHub Copilot** - Use existing Copilot subscription
- **ChatGPT Plus/Pro** - Use existing OpenAI subscription
- **Local models** - Ollama, LM Studio (no API key)

#### Step 5: Configure OpenCode (Optional)

Create `opencode.json` in your project root:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "autoupdate": true,
  "permissions": {
    "edit": "allow",
    "bash": {
      "git push *": "ask",
      "rm -rf *": "deny",
      "*": "allow"
    }
  },
  "instructions": [".opencode/conventions.md"]
}
```

For a local-model setup (Ollama):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      },
      "models": {
        "qwen2.5-coder:32b": { "name": "Qwen2.5 Coder 32B" }
      }
    }
  },
  "model": "ollama/qwen2.5-coder:32b"
}
```

Config precedence (later overrides earlier):
1. Remote config (.well-known/opencode)
2. Global config (~/.config/opencode/opencode.json)
3. Custom config (OPENCODE_CONFIG env var)
4. **Project config** (opencode.json) - recommended
5. Inline config (OPENCODE_CONFIG_CONTENT env var)
6. Managed configs (admin-enforced)

#### Step 6: Initialize OpenCode for Your Project

Inside the OpenCode TUI:
```
/init
```
This analyzes your project and creates AGENTS.md.

### Features & Keyboard Shortcuts

#### Official Extension (sst-dev.opencode)

| Shortcut (Win/Linux) | Shortcut (Mac) | Action |
|---|---|---|
| Ctrl+Esc | Cmd+Esc | Quick Launch - open/focus OpenCode terminal |
| Ctrl+Shift+Esc | Cmd+Shift+Esc | New Session |
| Alt+Ctrl+K | Cmd+Option+K | Insert file reference |
| - | - | Context Awareness (auto-shares selection/tab) |

#### Beta Extension (sst-dev.opencode-v2) - Chat Sidebar

- **Sidebar Chat Panel** - interactive AI assistant in the sidebar
- **Session Management** - create/switch between conversations
- **Model Selection** - choose AI models/providers in UI
- **Tool Integration** - view file ops, web fetches, task execution
- **Build Mode** - track auto-applied file changes
- **Image Support** - upload images in conversations

#### OpenCode Connector Commands

| Command | Shortcut | Description |
|---|---|---|
| Add to Prompt | Ctrl+Shift+A | Send current file reference to TUI |
| Add Selection to Prompt | Right-click | Send selected code range |
| Select Files to Add | Ctrl+Shift+Alt+A | Multi-file picker |
| Open in OpenCode | Editor title bar | Open TUI as editor tab |
| Explain and Fix | Lightbulb/hover | Quick fix for diagnostics |

### Alternative Ways to Use OpenCode in VS Code (No Extension)

| Method | How | Pros | Cons |
|---|---|---|---|
| **Integrated Terminal** | Run `opencode` in terminal (Ctrl+`) | No install needed | No shortcuts, no context awareness |
| **Split Terminal** | Ctrl+\ then run `opencode` | Side-by-side view | Manual setup each time |
| **opencode serve + browser** | `opencode serve --port 4096` | Full web UI, remote | Separate browser window |
| **Desktop App** | Download from opencode.ai/download | Dedicated window | Separate from VS Code |

### Recommendation for NAVI

Use **both** the official extension and the Beta sidebar:

1. **Official extension** for quick terminal-based agent sessions (Ctrl+Esc)
2. **Beta sidebar** for persistent chat interactions while browsing/editing code
3. **Create `opencode.json`** in project root with NAVI-specific config
4. **Run `/init`** to generate AGENTS.md with project context

This dual setup gives fast terminal access for code gen tasks and a rich sidebar UI for ongoing conversations.

### References

1. Official Extension: https://marketplace.visualstudio.com/items?itemName=sst-dev.opencode
2. Beta Extension: https://marketplace.visualstudio.com/items?itemName=sst-dev.opencode-v2
3. OpenCode Docs (IDE): https://opencode.ai/docs/ide/
4. Configuration Docs: https://opencode.ai/docs/config/
5. Provider Setup: https://opencode.ai/docs/providers/
6. GitHub Repo: https://github.com/anomalyco/opencode
7. Extension Source: https://github.com/anomalyco/opencode/tree/dev/sdks/vscode
8. OpenCode UI (3rd party): https://marketplace.visualstudio.com/items?itemName=zgy.opencode-vscode-ui
9. OpenCode GUI (3rd party): https://marketplace.visualstudio.com/items?itemName=TanShiyong.opencode-gui
10. OpenCode Connector (3rd party): https://marketplace.visualstudio.com/items?itemName=l3aro.opencode-connector
