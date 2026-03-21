# Phase 3: Create BrowserPane Component

## Context Links
- [browser-view.tsx](../../src/components/browser-view.tsx) -- current full-screen browser view (source of logic)
- [claude-chat-pane.tsx](../../src/components/claude-chat-pane.tsx) -- reference pane pattern
- [terminal-pane.tsx](../../src/components/terminal-pane.tsx) -- reference pane pattern
- [plan.md](plan.md)

## Overview
- **Priority**: P1 (core deliverable)
- **Status**: pending
- **Description**: Create `BrowserPane` component that works within the split pane system, managing its own native webview lifecycle. Port logic from `BrowserView` into the pane interface pattern.

## Key Insights
- **Pane interface contract**: `{ projectPath, paneId, isActive?, onFocus? }` -- same as TerminalPane and ClaudeChatPane
- **BrowserView has ~257 lines** of lifecycle logic -- must be refactored into a pane component under 200 lines
- **Native webview is NOT DOM**: positioned via absolute window coordinates, must track pane container bounds
- **Critical difference from TerminalPane**: terminal uses xterm.js (DOM element inside container). Browser uses native overlay OUTSIDE React DOM tree. Container div is just a positioning reference.
- **ResizeObserver pattern**: same as BrowserView, but visibility check changes from `view === "browser"` to `view === "terminal"` (since browser panes live in the terminal view)

## Requirements

### Functional
- BrowserPane renders URL bar + container div + console panel + annotation overlay + feedback composer
- Creates native webview on first mount, positioned over container div
- Tracks container bounds via ResizeObserver, syncs to native webview
- Shows/hides webview based on: view === "terminal" AND activeTabPath === projectPath AND pane is visible
- Polls console logs every 500ms when webview is active
- Listens for browser events (navigation, page load, title change, console, selection, screenshot)
- All Rust invocations use `paneId` instead of `projectId`
- Supports `useServerDetect` for auto-URL detection

### Non-functional
- Under 200 lines -- extract event listeners into a custom hook if needed
- Follows existing pane component patterns (memo, cleanup on unmount)

## Architecture

```
BrowserPane (src/components/browser-pane.tsx)
  |-- BrowserUrlBar (reused, passes paneId)
  |-- Container div (positioning reference for native webview)
  |-- BrowserConsolePanel (reused, passes paneId)
  |-- AnnotationOverlay (reused, passes paneId)
  |-- FeedbackComposer (reused, passes paneId)
```

### Webview Lifecycle per Pane

```
Mount -> containerRef available
  -> invoke("create_browser_webview", { paneId, url, x, y, width, height })
  -> markWebviewCreated(paneId)

ResizeObserver fires:
  -> Check: view === "terminal" && activeTabPath === projectPath
  -> invoke("resize_browser_webview", { paneId, x, y, width, height })

View/tab changes:
  -> visible: invoke("show_browser_webview", { paneId }) + syncBounds
  -> hidden:  invoke("hide_browser_webview", { paneId })

Unmount (pane closed):
  -> invoke("destroy_browser_webview", { paneId })
  -> removePaneState(paneId)
```

## Related Code Files

### Files to Create
- `src/components/browser-pane.tsx` -- new pane component

### Files to Modify
- `src/components/browser-url-bar.tsx` -- change `projectPath` prop to accept either `paneId` (rename parameter)
- `src/components/browser-console-panel.tsx` -- same: rename `projectPath` to `paneId` in props
- `src/hooks/use-server-detect.ts` -- update to work with paneId-based store

### Existing Files Reused (no changes)
- `src/components/annotation-overlay.tsx` -- rename prop from `projectPath` to `paneId`
- `src/components/feedback-composer.tsx` -- rename prop from `projectPath` to `paneId`
- `src/components/floating-panel.tsx` -- used as-is

## Implementation Steps

### Step 1: Create `browser-pane.tsx`

Port logic from `browser-view.tsx` with these changes:

```tsx
interface BrowserPaneProps {
  projectPath: string;
  paneId: string;
  isActive?: boolean;
  onFocus?: () => void;
}
```

Key differences from BrowserView:
- **Visibility check**: `view === "terminal"` instead of `view === "browser"`
- **All store calls**: use `paneId` instead of `projectPath`
- **All invoke calls**: use `paneId` instead of `projectId`
- **Event listeners**: filter by paneId-derived webview label (or use a mapping)
- **Cleanup on unmount**: destroy webview + remove pane state

### Step 2: Handle event filtering

Problem: Rust events include `label` (hash of paneId), but frontend doesn't know the hash. Two solutions:

**Option A (recommended)**: Have Rust include `pane_id` in event payloads alongside `label`. Add `pane_id` field to events emitted in `create_browser_webview` callbacks.

**Option B**: Maintain a JS-side `Map<paneId, label>` and filter by label. More fragile.

Going with **Option A** -- add `pane_id` to Rust event payloads:
```rust
// In on_navigation callback:
serde_json::json!({
    "label": label_for_nav,
    "pane_id": pane_id_for_nav,  // ADD THIS
    "url": url_str,
})
```

Then in BrowserPane:
```ts
listen("browser-navigated", (event) => {
    if (event.payload.pane_id !== paneId) return;
    setUrl(paneId, event.payload.url);
});
```

### Step 3: Update child components

Rename `projectPath` prop to `paneId` in:
- `BrowserUrlBar` -- all invoke calls change `projectId` to `paneId`
- `BrowserConsolePanel` -- all invoke calls change `projectId` to `paneId`
- `AnnotationOverlay` -- pass `paneId`
- `FeedbackComposer` -- needs both `paneId` (for browser ops) and `projectPath` (for file save)

### Step 4: Update `useServerDetect`

The hook listens to terminal PTY output and auto-navigates the browser. It must now:
- Accept both `projectPath` and `paneId`
- Use `paneId` for store operations and invoke calls
- Be called from BrowserPane with its specific paneId

```ts
export function useServerDetect(projectPath: string, paneId: string) {
  // ... same logic, but:
  // setUrl(paneId, url) instead of setUrl(projectPath, url)
  // invoke("navigate_browser", { paneId, url }) instead of projectId
}
```

## Todo List
- [ ] Create `src/components/browser-pane.tsx` with pane interface
- [ ] Port webview creation/show/hide/destroy lifecycle from browser-view.tsx
- [ ] Port ResizeObserver with correct visibility check (view === "terminal")
- [ ] Port console log polling
- [ ] Port event listeners with paneId filtering
- [ ] Update `browser-url-bar.tsx` props from projectPath to paneId
- [ ] Update `browser-console-panel.tsx` props from projectPath to paneId
- [ ] Update `annotation-overlay.tsx` props
- [ ] Update `feedback-composer.tsx` props (needs both paneId + projectPath)
- [ ] Update `use-server-detect.ts` to accept paneId
- [ ] Add `pane_id` to Rust event payloads (back in browser_ops.rs)
- [ ] Verify component under 200 lines (extract hook if needed)
- [ ] Add cleanup: destroy webview on unmount

## Success Criteria
- BrowserPane renders URL bar, webview container, console panel
- Native webview creates on mount, positions correctly, resizes with pane
- Webview hides when switching away from terminal view
- Webview destroys on pane close
- Console log polling works
- Server auto-detect navigates the correct browser pane

## Risk Assessment
- **Event filtering**: Without `pane_id` in payloads, events from one browser pane could reach another. Mitigated by Option A (adding pane_id to events).
- **200-line limit**: BrowserView is 257 lines. Must extract event listeners into `use-browser-events.ts` hook if needed.
- **Webview positioning during splits**: When a pane split occurs, the tree restructures. The portal system preserves DOM containers, so ResizeObserver should fire and update positions. Test carefully.

## Security Considerations
- URL scheme blocking (javascript:, data:, file:) already handled in Rust -- no change
- Console bridge script injection unchanged
