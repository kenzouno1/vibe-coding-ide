# Web Terminal Emulator Research Report
**Date:** 2026-03-15 | **Status:** Complete

## Executive Summary
xterm.js is production-ready but **lacks native split-pane support**—you must implement splits as multiple terminal instances. node-pty provides robust Windows support via conpty API (Win1809+). Session persistence requires custom architecture mapping shell history + working directory state to disk per project.

---

## 1. Split Terminal Panes Architecture

### Current Landscape
- **xterm.js**: No built-in split support. Implement via:
  - Multiple xterm instances in DOM containers
  - Custom layout engine (flex grid or binary tree model)
  - Shared/independent processes per pane

- **Tmux Backend Model**: Hierarchical structure (Server → Session → Window → Panes)
  - Binary tree for nested splits (horizontal/vertical)
  - Scalable to 100+ panes (performance tested via zellij)
  - Each pane can be independent PTY or muxed to single PTY

### Recommended Web Approach
**Split container architecture:**
```
Project Terminal Manager
├── Split Layout Engine (binary tree or flex)
├── Terminal Pane 1 (xterm.js instance + node-pty process)
├── Terminal Pane 2 (xterm.js instance + node-pty process)
└── Resize Handler (observer for container changes)
```

**Key consideration:** Font consistency across panes critical for dimension matching in muxed scenarios.

---

## 2. Session Persistence Strategy

### Command History
- **Windows CMD**: No native persistence (use Clink alternative)
- **PowerShell**: PSReadLine module handles .ps_history per session
- **Bash**: ~/.bash_history + HISTFILE/HISTSIZE variables

### Architecture for Project-Scoped Sessions
Per-project metadata file: `.devtools-session.json`
```json
{
  "projectId": "uuid",
  "panes": [
    {
      "id": "pane-1",
      "cwd": "/path/to/project",
      "history": ["npm install", "npm start"],
      "shell": "bash|powershell|cmd",
      "env": {"NODE_ENV": "dev"}
    }
  ]
}
```

**Restoration flow:**
1. Load `.devtools-session.json` on project open
2. Spawn PTY in restored `cwd` with saved environment
3. Inject history into shell (bash: `history -r`, PowerShell: custom loader)
4. On close: serialize pane state + command history

**Limitation:** Shell history isolated per session file—no cross-session history merging without custom wrapper.

---

## 3. Node-pty for Windows Terminals

### Windows Support & Compatibility
- **Conpty API**: Windows 1809+ native pseudoterminal (recommended)
- **Winpty fallback**: Older Windows versions
- **Electron compatibility**: Node.js 16+, Electron 19+

### Session Management Pattern
```
Main Process (node-pty)
  ├── PTY Spawn → shell process
  ├── IPC Bridge → Renderer (xterm.js)
  └── Session State Manager
       └── Save to .devtools-session.json
```

### Critical Constraints
- **NOT thread-safe**: Keep PTY operations on main thread only
- **Permission level**: Child processes inherit parent permissions
- **Requires build tools**: Windows SDK for Windows builds

---

## 4. Performance Considerations

### xterm.js Bottlenecks
- **Main thread bound**: All I/O + rendering on single thread
  - Multiple panes = proportional main-thread pressure
  - Heavy logs (100+ lines/sec) cause GPU/CPU lag
  - Mitigation: Coalescing/burst buffering, disable scrollback limits

- **Windows-specific**: Refresh rate limits on syncScrollArea cause forced reflows
  - Solution: VS Code uses lazy viewport updates

- **Memory**: 160x24 terminal + 5000 scrollback ≈ 34MB
  - Consider disabling scrollback for ephemeral shells

### Optimization Checklist
- [ ] Use canvas renderer (default is fastest)
- [ ] Disable scrollback or cap at 1000 lines for high-volume terminals
- [ ] Debounce resize handlers
- [ ] Isolate parser to worker (xterm addon available)
- [ ] Lazy-load non-visible panes

---

## 5. Recommended Implementation Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Frontend | xterm.js 5.x | Production-ready, 100k+ npm weekly downloads |
| Backend PTY | node-pty (Microsoft) | Official, Windows-native, Electron-tested |
| Split Layout | Custom (flex/tree) | ~200 LOC, no external deps |
| Persistence | JSON per project | Simplest, handles workspace isolation |
| Shell Support | bash/PowerShell/cmd | Cross-platform, history native support |

---

## Implementation Priorities

1. **Phase 1**: Single terminal + node-pty spawning + basic history save
2. **Phase 2**: Split pane layout + multi-pane session storage
3. **Phase 3**: Session restoration + cross-pane synchronization
4. **Phase 4**: Performance tuning (scrollback limits, parser worker)

---

## Unresolved Questions

- How to handle process cleanup if app crashes (orphaned processes)?
- Desired scrollback limit for typical dev workflows?
- Should split panes share single PTY (muxed) or independent PTYs?
- Need for cross-project session history aggregation?

---

## Sources
- [GitHub - xtermjs/xterm.js](https://github.com/xtermjs/xterm.js/)
- [Xterm.js Official Docs](https://xtermjs.org/)
- [GitHub - microsoft/node-pty](https://github.com/microsoft/node-pty)
- [Electron + node-pty Example](https://github.com/microsoft/node-pty/blob/main/examples/electron/README.md)
- [tmux Core Concepts](https://tmux.info/docs/core-concepts)
- [xterm.js Performance Wiki](https://github.com/xtermjs/xterm.js/wiki/Performance-testing)
