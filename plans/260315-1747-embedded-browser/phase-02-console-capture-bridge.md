# Phase 2: Console Capture Bridge

## Context
- Plan: `plan.md`
- Depends on: Phase 1 (browser webview must exist)
- Pattern reference: `pty_manager.rs` (event emission pattern)

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: Inject JS bridge into embedded webview to capture console.log/error/warn and DOM errors, emit to frontend via Tauri events

## Key Insights
- Tauri `WebviewBuilder` supports `initialization_script()` — JS injected before any page scripts run
- This bypasses CORS since it runs in the webview context before page load
- Pattern matches `pty-output` event emission in `pty_manager.rs`

## Architecture

```
Embedded Webview (page context)
│
├─ initialization_script (injected by Rust)
│  ├─ Override console.log/warn/error/info
│  ├─ window.onerror handler
│  ├─ window.onunhandledrejection handler
│  └─ window.__DEVTOOLS_BRIDGE__.postMessage() → Tauri IPC
│
▼
Rust Backend (browser_ops.rs)
│  Receives IPC from webview → emits Tauri event
▼
React Frontend
├─ browser-store.ts (consoleLogs array per project)
└─ browser-console-panel.tsx (renders logs with level/timestamp/source)
```

## Requirements

### Functional
- [ ] Capture `console.log`, `console.warn`, `console.error`, `console.info`
- [ ] Capture `window.onerror` (uncaught exceptions)
- [ ] Capture `unhandledrejection` (Promise rejections)
- [ ] Display captured logs in console panel below browser content
- [ ] Each log entry: level, timestamp, message, source (file:line)
- [ ] Console panel toggle (show/hide, resizable height)
- [ ] Clear logs button
- [ ] Filter by log level (all/error/warn/info)

### Non-functional
- [ ] Capture latency <100ms from page event to panel display
- [ ] Max 500 log entries per project (FIFO eviction)
- [ ] Bridge script <2KB minified

## Related Code Files

### Files to Modify
- `src-tauri/src/browser_ops.rs` — Add initialization_script to webview creation, add event emission
- `src/stores/browser-store.ts` — Add consoleLogs state, addLog/clearLogs actions

### Files to Create
- `src/components/browser-console-panel.tsx` — Console log display component

## Implementation Steps

### Step 1: Create JS bridge script (in browser_ops.rs as const string)
```javascript
(function() {
  const MAX_LOGS = 500;
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  function serialize(args) {
    return Array.from(args).map(a => {
      try {
        if (typeof a === 'object') return JSON.stringify(a, null, 2);
        return String(a);
      } catch { return '[Unserializable]'; }
    }).join(' ');
  }

  function send(level, args) {
    originalConsole[level](...args); // preserve original behavior
    window.__TAURI__.event.emit('browser-console', {
      level,
      message: serialize(args),
      timestamp: Date.now(),
      url: location.href,
    });
  }

  console.log = (...args) => send('log', args);
  console.warn = (...args) => send('warn', args);
  console.error = (...args) => send('error', args);
  console.info = (...args) => send('info', args);

  window.onerror = (msg, source, line, col, err) => {
    send('error', [`${msg} at ${source}:${line}:${col}`]);
  };

  window.addEventListener('unhandledrejection', (e) => {
    send('error', [`Unhandled Promise: ${e.reason}`]);
  });
})();
```

**Note**: Check if `window.__TAURI__` is available in secondary webviews. If not, use `postMessage` to main webview and relay.

### Step 2: Inject script in browser_ops.rs
```rust
let bridge_script = include_str!("../scripts/browser-bridge.js");

WebviewBuilder::new("browser-xxx", url)
    .initialization_script(bridge_script)
    // ... position, size
```

Alternative: store bridge JS as a separate file `src-tauri/scripts/browser-bridge.js` and use `include_str!`.

### Step 3: Add ConsoleLog type to browser-store.ts
```typescript
interface ConsoleLog {
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
  url: string;
}

// Add to BrowserState:
consoleLogs: ConsoleLog[];

// Add actions:
addLog: (projectPath: string, log: ConsoleLog) => void;
clearLogs: (projectPath: string) => void;
```

### Step 4: Listen for browser-console events in browser-view.tsx
```typescript
useEffect(() => {
  const unlisten = listen<ConsoleLog>("browser-console", (event) => {
    addLog(projectPath, event.payload);
  });
  return () => { unlisten.then(fn => fn()); };
}, [projectPath]);
```

### Step 5: Create browser-console-panel.tsx
- Scrollable log list with auto-scroll to bottom
- Color-coded by level: error=red, warn=yellow, info=blue, log=gray
- Timestamp display (HH:MM:SS.ms)
- Source URL truncated
- Filter tabs: All | Errors | Warnings | Info
- Clear button
- Resizable height via drag handle (reuse `SplitHandle` pattern)
- Collapse/expand toggle

## Todo List
- [ ] Write `browser-bridge.js` script
- [ ] Add `initialization_script()` to webview creation in `browser_ops.rs`
- [ ] Add `ConsoleLog` type and state to `browser-store.ts`
- [ ] Listen for `browser-console` event in `browser-view.tsx`
- [ ] Create `browser-console-panel.tsx`
- [ ] Add level filtering and clear button
- [ ] Add console panel toggle (show/hide)
- [ ] Test with a page that has console.log/error calls

## Success Criteria
- Console.log/warn/error/info captured and displayed in panel
- Uncaught exceptions and Promise rejections captured
- Log entries show level, message, timestamp
- Filter works correctly
- Max 500 entries with FIFO eviction
- Original console behavior preserved (page's own console still works)

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| `window.__TAURI__` not available in secondary webview | Use `postMessage` relay to main webview, or enable Tauri IPC for secondary webview |
| initialization_script runs after page scripts on SPA navigation | Re-inject on navigation events; test with React/Next.js apps |
| High-frequency console.log floods store | Throttle/batch updates; FIFO eviction at 500 entries |

## Next Steps
- Phase 3: Add "Send to Terminal" action from console panel + text selection bridge
