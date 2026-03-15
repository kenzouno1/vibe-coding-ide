# Phase 3: Terminal Integration

## Context
- Plan: `plan.md`
- Depends on: Phase 2 (console bridge)
- Pattern reference: `use-pty.ts`, `pty_manager.rs` (write_pty command)

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Send console errors and text selection from browser to active terminal PTY. Auto-detect dev server URLs from terminal output.

## Key Insights
- Terminal write is already available via `write_pty` IPC command — just need active PTY session ID
- PTY output is streamed via `pty-output` event — can parse for localhost URLs in frontend
- Text selection in secondary webview requires JS bridge (`window.getSelection()`)

## Architecture

```
Browser Console Panel                    Terminal PTY
├─ "Send to Terminal" button ──────────► write_pty(activeSessionId, errorText)
│
Browser Webview (JS bridge)
├─ Ctrl+Shift+C or context menu
│  └─ window.getSelection() ──────────► write_pty(activeSessionId, selectedText)
│
Terminal Output Stream (pty-output)
├─ Regex match: localhost:\d+ ─────────► BrowserStore.detectedUrls[]
│                                        └─ Notification → auto-navigate
```

## Requirements

### Functional
- [ ] "Send to Terminal" button on each console log entry
- [ ] "Send All Errors" button to batch-send all error logs
- [ ] Text selection in webview → Ctrl+Shift+C sends to terminal
- [ ] Auto-detect localhost URLs from terminal output
- [ ] Notification when dev server detected: "Open in browser?"
- [ ] Auto-navigate if browser view is active

### Non-functional
- [ ] Text sent to terminal as plain text (no ANSI formatting)
- [ ] URL detection regex handles: `localhost:PORT`, `127.0.0.1:PORT`, `0.0.0.0:PORT`, `http://` prefix

## Related Code Files

### Files to Modify
- `src/stores/browser-store.ts` — Add detectedUrls, sendToTerminal action
- `src/components/browser-console-panel.tsx` — Add send buttons
- `src-tauri/src/browser_ops.rs` — Add text selection bridge to initialization_script

### Files to Create
- `src/hooks/use-server-detect.ts` — Parse terminal output for localhost URLs

## Implementation Steps

### Step 1: Add sendToTerminal helper
Need to get active PTY session ID. The `use-pty` hook stores session IDs locally — need to expose via store or shared ref.

Option: Add `activePtyId` to `PaneStore` per project, set when PTY spawns.

```typescript
// browser-store.ts or a shared util
async function sendToTerminal(sessionId: string, text: string) {
  await invoke("write_pty", { id: sessionId, data: text + "\n" });
}
```

### Step 2: Add send buttons to console panel
- Per-entry "Send" icon button (ArrowRight icon)
- "Send All Errors" button in toolbar
- Format: plain text, one error per line
- Prefix with comment marker so terminal treats as info:
  ```
  # [Browser Error] Uncaught TypeError: Cannot read property 'x' of undefined
  # at src/app.js:42:15
  ```

### Step 3: Add text selection bridge to JS bridge
Extend `browser-bridge.js`:
```javascript
// Listen for selection send shortcut
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    const sel = window.getSelection()?.toString();
    if (sel) {
      window.__TAURI__.event.emit('browser-selection', {
        text: sel,
        url: location.href,
      });
    }
  }
});
```

### Step 4: Create use-server-detect.ts
```typescript
// Listen to pty-output events and parse for localhost URLs
export function useServerDetect(projectPath: string) {
  useEffect(() => {
    const URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/g;

    const unlisten = listen<PtyOutput>("pty-output", (event) => {
      const matches = event.payload.data.matchAll(URL_REGEX);
      for (const match of matches) {
        const url = match[0].replace("0.0.0.0", "localhost");
        addDetectedUrl(projectPath, url);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [projectPath]);
}
```

### Step 5: Add notification UI
When new URL detected:
- Toast/notification at bottom: "Dev server detected: localhost:3000 — [Open in Browser]"
- If browser view is active and URL is `about:blank`, auto-navigate
- Store detected URLs per project in `browser-store.ts`

## Todo List
- [ ] Expose active PTY session ID (modify `pane-store.ts` or `use-pty.ts`)
- [ ] Add `sendToTerminal` action to `browser-store.ts`
- [ ] Add send buttons to `browser-console-panel.tsx`
- [ ] Extend JS bridge with text selection capture
- [ ] Listen for `browser-selection` event in `browser-view.tsx`
- [ ] Create `use-server-detect.ts` hook
- [ ] Add `detectedUrls` state to `browser-store.ts`
- [ ] Add notification UI for detected dev servers
- [ ] Test: send error to terminal, select text and send, detect localhost from `npm run dev`

## Success Criteria
- Click "Send" on console error → text appears in terminal
- Select text in browser → Ctrl+Shift+C → text appears in terminal
- Run `npm run dev` in terminal → notification shows detected URL
- Click notification → browser navigates to detected URL

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Active PTY session ID not easily accessible | Add to PaneStore or create shared session registry |
| False positive URL detection (URLs in logs, not servers) | Only detect on common patterns: "running at", "listening on", "ready on" |
| Ctrl+Shift+C conflicts with browser copy | Use different shortcut or context menu; Ctrl+Shift+C is DevTools in Chrome but we control the webview |

## Next Steps
- Phase 4: Screenshot capture + Konva.js annotation
