# Phase 6: Float/Pin Mode & Cleanup

## Context Links
- [floating-panel.tsx](../../src/components/floating-panel.tsx) -- reusable float panel
- [browser-store.ts](../../src/stores/browser-store.ts) -- layout mode state
- [plan.md](plan.md)

## Overview
- **Priority**: P2
- **Status**: pending
- **Description**: Re-implement float mode for browser panes (per-pane floating), add pin mode (browser stays visible across view switches), and final cleanup.

## Key Insights
- Float mode was previously rendered in `app.tsx` for the whole project. Now each BrowserPane handles its own float mode.
- Pin mode is new: webview stays visible even when switching to git/editor/ssh views
- `FloatingPanel` component is generic and reusable -- no changes needed
- Float state already exists in `BrowserState` (`layoutMode`, `floatX/Y`, `floatWidth/Height`)

## Requirements

### Functional
- **Float mode**: When a browser pane toggles to float, render it inside a `FloatingPanel` above the workspace. The pane's slot in the split tree shows a "Floating" placeholder.
- **Pin mode**: When pinned, the native webview stays visible (z-index above other views) during view switches. Un-pin reverts to standard show/hide behavior.
- **Dock**: Float/pin returns to standard docked pane behavior

### Non-functional
- Keep BrowserPane under 200 lines (float logic may require a wrapper component)

## Architecture

### Float Mode Flow
```
BrowserPane (layoutMode === "float")
  -> Render placeholder in pane slot ("Browser floating - click to dock")
  -> Render FloatingPanel via portal at document.body level
     -> Inside FloatingPanel: URL bar + webview container + console
     -> Webview positioned to FloatingPanel bounds, not pane slot
```

### Pin Mode Flow
```
BrowserPane (layoutMode === "pinned")
  -> Normal pane rendering when view === "terminal"
  -> When view !== "terminal": webview stays visible (skip hide call)
  -> Webview positioned to last known pane bounds
  -> Show a small "Browser pinned" indicator on other views
```

## Related Code Files

### Files to Modify
- `src/stores/browser-store.ts` -- add "pinned" to layoutMode type
- `src/components/browser-pane.tsx` -- implement float/pin rendering
- `src/components/browser-url-bar.tsx` -- add pin toggle button

### Existing Files Reused
- `src/components/floating-panel.tsx` -- no changes

## Implementation Steps

### Step 1: Add "pinned" Layout Mode

In `browser-store.ts`:
```ts
// BEFORE
layoutMode: "docked" | "float";
// AFTER
layoutMode: "docked" | "float" | "pinned";
```

Add `togglePinMode` method alongside existing `toggleLayoutMode`.

### Step 2: Float Mode in BrowserPane

When `layoutMode === "float"`:
- Render a placeholder div in the pane slot
- Use `createPortal` to render `FloatingPanel` at document.body
- Inside FloatingPanel: the full browser UI (url bar, container, console)
- Webview bounds sync to FloatingPanel position, not pane slot

### Step 3: Pin Mode in BrowserPane

When `layoutMode === "pinned"`:
- In the show/hide effect, skip the `hide_browser_webview` call when view changes
- Webview remains visible at its pane bounds even when terminal view is hidden
- When user returns to terminal view, the webview is already visible

### Step 4: URL Bar Pin Button

Add a pin icon toggle to `browser-url-bar.tsx` next to the float/dock button:
```tsx
<button onClick={() => togglePinMode(paneId)} title="Pin browser">
  <Pin size={16} />
</button>
```

### Step 5: Cleanup & Final Checks

- Search for any remaining `projectId` references that should be `paneId`
- Verify all browser webviews are destroyed on app close
- Verify no memory leaks from uncleaned event listeners
- Update component comments/docs

## Todo List
- [ ] Add "pinned" to layoutMode type in browser-store
- [ ] Add togglePinMode method
- [ ] Implement float mode rendering in BrowserPane (portal to body)
- [ ] Implement pin mode (skip hide on view switch)
- [ ] Add pin button to URL bar
- [ ] Test float mode: drag, resize, dock back
- [ ] Test pin mode: switch views, verify webview stays
- [ ] Final codebase search for stale projectId/browser-view references
- [ ] Compile + run full app test

## Success Criteria
- Float mode: browser pane pops out as floating panel, draggable/resizable
- Pin mode: browser stays visible when switching to git/editor/ssh
- Dock mode: standard behavior within split pane
- All three modes toggle correctly
- No orphaned webviews on any close path

## Risk Assessment
- **Float z-order**: FloatingPanel uses `z-[10]`. Native webview is always on top. If webview is positioned inside FloatingPanel, the native webview will render above FloatingPanel border/header. Acceptable -- same as current behavior.
- **Pin mode complexity**: Pinned webview overlaps other view content. User must be able to un-pin easily. Pin button in URL bar (visible when terminal view is active) is the toggle.
- **Multiple pinned panes**: If two browser panes are pinned, both stay visible. Could be confusing but is consistent behavior. Can restrict to one pinned pane later if needed (YAGNI for now).

## Next Steps
- Update README.md to reflect 4 sidebar views + browser as pane
- Update docs/system-architecture.md
- Update docs/project-overview.md
