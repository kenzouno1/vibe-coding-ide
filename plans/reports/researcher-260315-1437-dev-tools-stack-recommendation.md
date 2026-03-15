# Desktop Dev Tools Tech Stack Research
**Date:** 2026-03-15 | **Status:** Complete

---

## Executive Summary

**RECOMMENDATION: Option A (Electron + React)** for this specific use case.

While Tauri excels at general desktop apps, Electron provides the necessary terminal I/O performance and proven git integration maturity that dev tools require.

---

## Option A: Electron + React

### Strengths
- **Terminal Performance:** xterm.js + node-pty proven combination used by VS Code, Hyper, Tabby. Direct IPC (no socket overhead) on Windows.
- **Split Panes:** Native support via xterm-split or custom grid layout. Multi-pane context switching near-native latency.
- **Git Integration:** node.js child_process spawns for git commands, proven in thousands of production dev tools. Simple streaming output for diffs.
- **Developer Experience:** Single JS ecosystem. Rich npm ecosystem (chalk for diffs, simple-git library). Fast iteration.
- **Cross-platform:** Works identically on Win11, macOS, Linux via node-pty supporting Windows ConPTY API (Win 1809+, builds on all modern Win11).

### Weaknesses
- **Bundle Size:** 150–200MB installer. Not ideal for quick distribution.
- **Memory Idle:** 200–300MB baseline. Multiple panes push beyond 400MB.
- **Startup:** 1–2 seconds on mid-range laptops.

### Performance Reality
Electron-based terminal apps (Tabby, Hyper) achieve <50ms input latency in practice. Adequate for dev tool usage, though slower than GPU-native terminals (Alacritty/Kitty ~15ms). Acceptable trade-off for feature richness.

---

## Option B: Tauri + Rust

### Strengths
- **Efficiency:** <10MB installer, 30–50MB idle memory. Excellent for lightweight shipping.
- **Startup:** <500ms app launch. Responsive UI.
- **Windows 11 Native:** WebView2 (Edge Chromium) built-in; automatic updates.

### Weaknesses
- **Terminal Support:** No standard terminal emulator library in Rust ecosystem. Would require:
  - Writing custom terminal emulator (6–8 week effort) OR
  - Binding to C terminal libs (complexity) OR
  - Using xterm.js frontend (defeats Rust backend benefits)
- **Platform Divergence:** WebView2 rendering ≠ Safari/WebKit. CSS/font differences possible across platforms.
- **Learning Curve:** Rust + Tauri combo steeper for web teams. Slower feature velocity.

### Performance
Tauri provides marginal terminal latency advantage (~5ms less than Electron), but **terminal emulator implementation is the bottleneck, not the framework**. Without a mature terminal library, you gain efficiency but lose shipping speed.

---

## Option C: Next.js + Local WebSocket Server

### Strengths
- **Zero Packaging:** Just a web server. No installer complexity.
- **Browser Tooling:** DevTools, live reload, HMR out-of-the-box.

### Critical Weaknesses
- **No True Local-First:** Requires always-running Node process + browser. Users expect "click executable, runs."
- **Terminal Latency:** WebSocket round-trip adds 10–30ms to each keystroke vs. direct IPC.
- **Persistence Issues:** Session state fragile. Project-scoped terminal persistence requires custom state management.
- **Git Streaming:** Diff rendering slower due to serialization overhead.
- **Not a Desktop App:** Doesn't integrate with Windows 11 context menus, taskbar, file associations.

### When It Fits
Only viable if you're targeting teams already running local dev servers. Not recommended for general dev tool.

---

## Comparative Metrics

| Criterion | Electron | Tauri | Next.js |
|---|---|---|---|
| **Bundle Size** | 150–200MB | <10MB | N/A (server) |
| **Idle Memory** | 200–300MB | 30–50MB | 100–150MB |
| **Startup Time** | 1–2s | <500ms | <200ms (if running) |
| **Terminal Latency** | 40–50ms | 35–40ms | 50–80ms (+WS) |
| **Git Op Speed** | Fast (spawn) | Fast (native lib) | Moderate (JSON) |
| **DX (JS ecosystem)** | Excellent | Good | Excellent |
| **DX (Rust integration)** | N/A | Moderate | N/A |
| **Split Panes** | Mature patterns | Build from scratch | Simple web layout |
| **Windows 11 Integration** | Full | Full (WebView2) | None |
| **Time-to-Market** | 4–6 weeks | 8–10 weeks | 3–4 weeks |

---

## Recommendation Justification

Choose **Electron + React** because:

1. **Terminal Maturity:** xterm.js + node-pty is battle-tested. No custom terminal renderer needed.
2. **Git Integration:** Simple, fast git command spawning with streaming output. DiffStat, log parsing, commit staging all straightforward.
3. **Split Pane UX:** Proven patterns exist (VSCode, iTerm2). DOM-based layout works well for multiple panes with per-pane state.
4. **Developer Velocity:** JS ecosystem handles UI + terminal rendering. No context switching to Rust for core features.
5. **Time-to-Market:** 4–6 weeks vs. Tauri's 8–10 (terminal emulator implementation required).
6. **Memory Acceptable:** 300–400MB for 3–4 panes is reasonable 2026 standard (typical dev machine has 16GB+).

**Tauri makes sense if:**
- Lightweight distribution is critical (enterprise sandboxed deployment).
- Your team is Rust-first.
- You're willing to delay terminal features while implementing a custom emulator.

**Option C only if:**
- You're embedding terminal inside existing Next.js monorepo tooling.
- You don't need true desktop app behavior.

---

## Implementation Path (Electron)

1. **Terminal Layer:** xterm.js + node-pty for split panes. Use simple-git for git ops.
2. **Session Persistence:** Store pane layout + working directory per project in local SQLite.
3. **Git Diff UI:** Stream git diff output to xterm or custom DOM diff renderer (syntax highlight + interactivity).
4. **Build:** webpack/esbuild for fast dev, electron-builder for packaging.
5. **Estimated Effort:** 5–6 weeks (terminal + git UI + session persistence).

---

## Unresolved Questions

- **Specific Terminal Throughput:** Need benchmarks for xterm.js rendering at 10k lines/sec on Windows 11 (larger lines).
- **Multi-pane Memory Ceiling:** Unknown exact memory cost per pane; 400MB baseline or 600MB+?
- **Simple-git vs. Direct Spawn:** Performance trade-off for large repos (50k+ commits)?

---

## Sources

- [Tauri vs. Electron: performance, bundle size, and the real trade-offs](https://www.gethopp.app/blog/tauri-vs-electron)
- [Tauri VS. Electron - Real world application](https://www.levminer.com/blog/tauri-vs-electron)
- [Browser-based terminals with Electron.js and Xterm.js](https://www.opcito.com/blogs/browser-based-terminals-with-xtermjs-and-electronjs)
- [node-pty examples/electron on Microsoft GitHub](https://github.com/microsoft/node-pty)
- [Implementing WebSocket communication in Next.js - LogRocket Blog](https://blog.logrocket.com/implementing-websocket-communication-next-js/)
- [Performance | Electron](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Comparing Electron and Tauri for Desktop Applications](https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/)
- [WebView2, Electron challengers, and (slightly) lighter desktop web applications](https://blog.scottlogic.com/2023/02/01/webview2-electron-challengers-and-slightly-lighter-desktop-web-applications.html)
- [Terminal Emulators Speed & Latency Comparison (Scopir 2026)](https://scopir.com/posts/best-terminal-emulators-developers-2026/)
