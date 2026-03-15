# DevTools Desktop App — Gap Analysis vs 1DevTool.com

**Date:** 2026-03-15
**Goal:** Identify missing features compared to 1DevTool.com (desktop all-in-one IDE)
**Status:** Planning

---

## Product Comparison

Both products are **Tauri-based desktop apps** — all-in-one developer workspaces that consolidate multiple tools.

| Feature | Your App | 1DevTool | Status |
|---------|----------|----------|--------|
| **Multi-pane Terminal (PTY)** | ✅ Split panes, resize, shortcuts | ✅ Unlimited sessions | ✅ Parity |
| **Git Client** | ✅ Status, stage, diff, commit | ✅ Stage, commit, branch, diff, merge | ⚠️ Missing merge UI |
| **Session Persistence** | ✅ Tabs + pane layouts | ✅ Persistent across restarts | ✅ Parity |
| **Keyboard Shortcuts** | ✅ Comprehensive | ✅ | ✅ Parity |
| **Monaco Code Editor** | ❌ | ✅ Syntax highlight, multi-tab, autocomplete | 🔴 **Missing** |
| **File Explorer** | ❌ | ✅ Tree view, file CRUD | 🔴 **Missing** |
| **HTTP Client** | ❌ | ✅ Craft requests, inspect responses, save collections | 🔴 **Missing** |
| **Database Client** | ❌ | ✅ SQL + NoSQL support | 🔴 **Missing** |
| **Embedded Browser** | ❌ | ✅ In-app preview, no alt-tab | 🔴 **Missing** |
| **Markdown Preview** | ❌ | ✅ Live side-by-side | 🟡 **Missing** |
| **AI Agent Integration** | ❌ | ✅ Console capture, context-aware debug, browser↔agent | 🟡 **Missing** |

---

## Missing Features — Priority & Effort

| # | Feature | Priority | Effort | Why |
|---|---------|----------|--------|-----|
| 1 | **Monaco Editor + File Explorer** | 🔴 Critical | High | Core IDE — without this it's just a terminal |
| 2 | **HTTP Client** | 🔴 High | High | Replaces Postman, daily-use tool |
| 3 | **Database Client** | 🔴 High | High | Replaces TablePlus/DBeaver |
| 4 | **Embedded Browser** | 🟡 Medium | Medium | Preview without alt-tab, Tauri webview capable |
| 5 | **Git Merge UI** | 🟡 Medium | Medium | Complete git workflow |
| 6 | **Markdown Preview** | 🟢 Low | Low | Side-by-side MD rendering |
| 7 | **AI Agent Integration** | 🟡 Medium | High | Console log capture → AI context, differentiator |

---

## Recommended Implementation Phases

### Phase 1 — Code Editor & File Explorer
- [x] Monaco Editor integration (syntax highlight, multi-tab, autocomplete)
- [x] File explorer tree view (read project directory via Rust)
- [x] File CRUD operations (create, rename, delete)
- [ ] Editor ↔ Terminal integration (open file from terminal, etc.) — deferred stretch goal
- [x] New sidebar view: "Editor"

### Phase 2 — HTTP Client
- [ ] Request builder (method, URL, headers, body, query params)
- [ ] Response viewer (status, headers, body with syntax highlight)
- [ ] Request history & collections (save/load)
- [ ] Environment variables support
- [ ] New sidebar view: "API"

### Phase 3 — Database Client
- [ ] Connection manager (save DB connections)
- [ ] SQL editor with Monaco (syntax highlight, autocomplete)
- [ ] Query results table view
- [ ] Support: PostgreSQL, MySQL, SQLite (via Rust drivers)
- [ ] NoSQL support: MongoDB (stretch goal)
- [ ] New sidebar view: "Database"

### Phase 4 — Browser & Preview
- [ ] Embedded browser (Tauri webview, URL bar, nav controls)
- [ ] Markdown preview (live side-by-side with editor)
- [ ] Auto-refresh on file save
- [ ] Console log capture from embedded browser

### Phase 5 — Git Enhancements & AI Integration
- [ ] Git merge UI (conflict resolution)
- [ ] Git log/history viewer
- [ ] Branch management (create, switch, delete)
- [ ] AI agent log capture (console output → clipboard/file)
- [ ] Context-aware debugging (send errors to AI tools)

---

## Architecture Notes

All features leverage existing Tauri + React + Rust stack:
- **Monaco Editor**: `@monaco-editor/react` npm package
- **File Explorer**: Rust `std::fs` for directory listing, Tauri commands
- **HTTP Client**: Rust `reqwest` crate (avoids CORS issues vs browser fetch)
- **Database**: Rust `sqlx`/`tokio-postgres`/`rusqlite` crates
- **Embedded Browser**: Tauri `WebviewWindow` or iframe
- **Markdown**: `react-markdown` or Monaco's built-in MD preview

---

## Key Differentiators to Pursue

Beyond matching 1DevTool, consider:
1. **Free & open-source** vs their $29 one-time
2. **Better terminal** — your split-pane system is already strong
3. **Plugin/extension system** — community tools
4. **Cmd+K command palette** — quick access to everything
5. **Theme customization** — Catppuccin already in place

---

## Summary

- **You have:** Terminal (strong), Git (basic), Session persistence
- **Missing:** 5 major features (Editor, HTTP Client, DB Client, Browser, AI)
- **Quick win:** Monaco Editor + File Explorer (Phase 1) — transforms from "terminal app" to "IDE"
- **Biggest effort:** Database Client (Phase 3) — multiple DB drivers, query UI
- **Stack advantage:** Tauri+Rust backend handles all I/O natively (no CORS, native DB drivers)

## Unresolved Questions
1. Open-source or commercial? Pricing strategy?
2. Plugin/extension architecture — worth investing early?
3. Which databases to prioritize? (PostgreSQL first?)
4. AI integration scope — just log capture or deeper (inline suggestions)?
