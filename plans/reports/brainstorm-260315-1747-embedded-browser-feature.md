# Brainstorm: Embedded Browser Feature

**Date:** 2026-03-15
**Status:** Agreed

---

## Problem Statement

DevTools cần embedded browser để:
1. Preview web app đang develop (auto-detect localhost)
2. Capture console errors → gửi vào terminal cho Claude Code xử lý
3. Screenshot + annotate (vẽ, shapes, text) → gửi feedback vào terminal
4. Text selection từ browser → paste vào terminal

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Browser engine | Tauri v2 native multi-webview | Nhẹ, cross-platform, share process |
| Layout | Split pane + floating panel | Flexible, reuse existing split-pane code |
| Console capture | JS bridge injection | `initialization_script` inject trước page load |
| Screenshot | `tauri-plugin-snapshot` / WebView2 CapturePreview | Native quality, không cần html2canvas |
| Annotation lib | Konva.js + react-konva | 55KB, full features, React-native |
| Output format | Text + structured | Text cho errors, structured (markdown) cho annotations |
| DevTools | Optional toggle | Ẩn mặc định, bật qua settings |
| Auto-detect server | Yes | Detect localhost:xxxx từ terminal output |

---

## Architecture

```
DevTools Window
├── Main Webview (React app)
│   ├── Terminal View (Ctrl+1) — xterm.js
│   ├── Git View (Ctrl+2)
│   ├── Editor View (Ctrl+3)
│   └── Browser View (Ctrl+4)
│       ├── URL Bar + Navigation (back/fwd/refresh)
│       ├── Browser Content Area
│       │   └── Secondary Webview (Tauri) ← web page loads here
│       ├── Console Panel (captured errors/logs)
│       └── Annotation Overlay (Konva.js)
│           ├── Toolbar: pen, highlighter, rect, circle, arrow, text, color, undo/redo
│           ├── Canvas: screenshot + drawings
│           └── Actions: send-to-terminal, save, clear
└── Floating Panel Mode (drag/resize, toggle dock)
```

### Data Flow

```
[Embedded Webview]
    │
    ├─ JS Bridge (injected) ──────────┐
    │   ├─ console.error/warn/log     │
    │   ├─ window.onerror             │
    │   ├─ unhandledrejection         │
    │   └─ window.getSelection()      │
    │                                 ▼
    │                        [Tauri IPC Events]
    │                                 │
    │                    ┌────────────┤
    │                    ▼            ▼
    │              [Console Panel] [Terminal PTY]
    │                                 │
    │                          Claude Code reads
    │                          error context
    │
    ├─ Screenshot Capture ────────────┐
    │   (native API)                  ▼
    │                        [Annotation Canvas]
    │                        (Konva.js overlay)
    │                                 │
    │                          Export annotated
    │                          image → base64/file
    │                                 │
    │                                 ▼
    │                        [Terminal / Clipboard]
    │                        (structured feedback)
    │
    └─ Auto-detect localhost ─────────┐
        Parse terminal output         │
        regex: localhost:\d+          │
        http://127.0.0.1:\d+         ▼
                              [Auto-navigate browser]
```

---

## Implementation Phases

### Phase 1: Browser Pane Basic (MVP)
- Tauri secondary webview trong main window
- URL bar + back/forward/refresh
- View thứ 4 (Ctrl+4) trong AppStore
- Zustand store: `browser-store.ts` (url, history, loading state)
- Rust backend: `browser_ops.rs` (create/destroy webview, navigation commands)

### Phase 2: JS Bridge — Console Capture
- Inject `initialization_script` vào webview
- Override `console.error`, `console.warn`, `console.log`
- Catch `window.onerror`, `unhandledrejection`
- Emit events qua Tauri IPC: `browser-console` event
- Console panel component hiển thị captured logs
- Button "Send to Terminal" → write text vào active PTY

### Phase 3: Text Selection → Terminal
- JS bridge bắt `mouseup` event + `window.getSelection()`
- Context menu hoặc keyboard shortcut (Ctrl+Shift+C) → send to terminal
- Format: plain text paste vào PTY

### Phase 4: Auto-detect Dev Server
- Parse terminal output stream (regex `localhost:\d+`, `127.0.0.1:\d+`, `0.0.0.0:\d+`)
- Notification: "Dev server detected at localhost:3000. Open in browser?"
- Auto-navigate nếu browser pane đang mở
- Store detected URLs per project

### Phase 5: Screenshot Capture
- Tauri command: capture webview content → PNG buffer
- Save to temp file hoặc in-memory
- Trigger annotation mode

### Phase 6: Annotation Canvas (Konva.js)
- Overlay component với captured screenshot as background
- Tools: pen (freehand), highlighter (semi-transparent), rectangle, circle, arrow, line, text
- Color picker (preset colors + custom)
- Undo/redo stack (Zustand hoặc useReducer)
- Export: `stage.toDataURL()` → base64 PNG

### Phase 7: Feedback Workflow
- "Send to Terminal" button → structured markdown format:
  ```
  ## Browser Feedback
  **URL:** https://localhost:3000/dashboard
  **Screenshot:** [attached image]
  **Annotations:** 3 markers
  **Notes:** Button alignment broken on mobile view
  ```
- Save annotated image to project `.devtools/screenshots/`
- Copy to clipboard option
- Gửi file path vào terminal: `cat .devtools/screenshots/feedback-001.png`

### Phase 8: Float/Split Layout
- Floating panel component: draggable, resizable
- Toggle float ↔ split docked
- Persist layout preference per project
- Z-index management cho floating mode

### Phase 9: DevTools Toggle
- Settings toggle: enable/disable embedded DevTools
- Khi enabled: mở DevTools panel (WebView2 hỗ trợ `OpenDevToolsWindow`)
- Keyboard shortcut: F12 trong browser view

---

## Tech Stack Additions

| Component | Library/Tool | Size |
|-----------|-------------|------|
| Secondary webview | Tauri v2 multi-webview (wry) | Built-in |
| Annotation canvas | konva + react-konva | ~55KB gzip |
| Screenshot | tauri-plugin-snapshot | ~10KB |
| Drag/resize (float) | CSS resize + custom drag | 0KB (native) |

---

## New Files Estimate

### Frontend (src/components/)
- `browser-view.tsx` — Main browser view container
- `browser-url-bar.tsx` — URL input + navigation buttons
- `browser-console-panel.tsx` — Captured console logs display
- `annotation-overlay.tsx` — Konva.js canvas overlay
- `annotation-toolbar.tsx` — Drawing tools toolbar
- `floating-panel.tsx` — Floating/draggable panel wrapper

### Frontend (src/stores/)
- `browser-store.ts` — Browser state (url, history, console logs, annotation)

### Frontend (src/hooks/)
- `use-server-detect.ts` — Auto-detect dev server from terminal output

### Backend (src-tauri/src/)
- `browser_ops.rs` — Webview lifecycle, screenshot, JS injection

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Tauri multi-webview stability | Medium | Test trên cả 3 OS, fallback to separate window |
| CORS blocking JS bridge | Medium | `initialization_script` runs before page, bypasses CORS |
| Memory 2+ webviews | Low | Lazy load, destroy when not visible |
| Konva.js performance large images | Low | Limit canvas size, downsample screenshots |
| DevTools toggle cross-platform | Medium | WebView2 only Windows, webkit2gtk trên Linux |

---

## Success Metrics

1. Browser loads any URL, navigates correctly
2. Console errors captured in <100ms, displayed in console panel
3. Text selection → terminal in 1 click
4. Screenshot → annotation → export in <3s workflow
5. Auto-detect localhost server from terminal output
6. Float/split modes work without layout bugs
7. <100MB additional memory for embedded browser

---

## Unresolved Questions

1. Tauri v2 multi-webview: webview position/size management khi split pane resize — cần test thực tế
2. Screenshot capture trên Linux (webkit2gtk) có API tương đương WebView2 CapturePreview không?
3. Annotation image size limit? Nên cap ở resolution nào?
4. Có cần sync browser state across projects (mỗi project tab có browser riêng)?
