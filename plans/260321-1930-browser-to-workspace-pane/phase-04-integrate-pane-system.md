# Phase 4: Integrate Browser into Pane System

## Context Links
- [pane-store.ts](../../src/stores/pane-store.ts) -- pane tree binary model
- [split-pane-container.tsx](../../src/components/split-pane-container.tsx) -- renders pane tree
- [plan.md](plan.md)

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Add `"browser"` to `PaneType`, update `SplitPaneContainer` to render `BrowserPane` for browser leaf nodes, and add `Ctrl+Shift+B` shortcut.

## Key Insights
- `PaneType` is a string union: `"terminal" | "claude"` -- just add `"browser"`
- `SplitPaneContainer` uses a simple ternary to pick component: `paneType === "claude" ? ClaudeChatPane : TerminalPane`. Must extend to 3-way.
- Pane close cleanup must destroy webview -- similar to Claude pane cleanup pattern in `use-keyboard-shortcuts.ts`
- Default tree creation should NOT change (still terminal + claude)

## Requirements

### Functional
- `PaneType = "terminal" | "claude" | "browser"`
- `SplitPaneContainer` renders `BrowserPane` for `paneType === "browser"` leaves
- `Ctrl+Shift+B` splits active pane with a browser pane (auto direction)
- `Ctrl+W` on browser pane destroys its webview before closing
- Browser pane receives `projectPath` and `paneId` from container

### Non-functional
- Keep `pane-store.ts` under 287 lines (currently 286)
- Keep `split-pane-container.tsx` under 200 lines (currently 131)

## Related Code Files

### Files to Modify
- `src/stores/pane-store.ts` -- add "browser" to PaneType union
- `src/components/split-pane-container.tsx` -- add BrowserPane import and rendering
- `src/hooks/use-keyboard-shortcuts.ts` -- add Ctrl+Shift+B, update Ctrl+W cleanup

## Implementation Steps

### Step 1: Update PaneType

In `pane-store.ts`, line 4:
```ts
// BEFORE
export type PaneType = "terminal" | "claude";
// AFTER
export type PaneType = "terminal" | "claude" | "browser";
```

No other changes needed in pane-store. The `split()` method already accepts `paneType` parameter.

### Step 2: Update SplitPaneContainer

In `split-pane-container.tsx`:

```tsx
import { BrowserPane } from "@/components/browser-pane";

// In the portal rendering section (line ~117):
// BEFORE
const PaneComponent = paneType === "claude" ? ClaudeChatPane : TerminalPane;

// AFTER
function getPaneComponent(paneType: PaneType) {
  switch (paneType) {
    case "claude": return ClaudeChatPane;
    case "browser": return BrowserPane;
    default: return TerminalPane;
  }
}
const PaneComponent = getPaneComponent(paneType);
```

### Step 3: Add Ctrl+Shift+B Shortcut

In `use-keyboard-shortcuts.ts`, inside the `view === "terminal"` block, after Ctrl+Shift+C:

```ts
// Ctrl+Shift+B: Split with browser pane (auto direction)
if (isCtrl && e.shiftKey && e.key === "B") {
  e.preventDefault();
  const rect = getPaneRect(activeId);
  const dir = rect ? autoDirection(rect.width, rect.height) : "horizontal";
  split(project, activeId, dir, "browser");
  return;
}
```

### Step 4: Update Ctrl+W Cleanup

In `use-keyboard-shortcuts.ts`, the Ctrl+W handler already cleans up Claude state. Extend it:

```ts
if (isCtrl && e.key === "w") {
  e.preventDefault();
  const paneType = usePaneStore.getState().getPaneType(project, activeId);
  if (paneType === "claude") {
    useClaudeStore.getState().removePaneState(activeId);
  }
  if (paneType === "browser") {
    useBrowserStore.getState().removePaneState(activeId);
  }
  closePane(project, activeId);
  return;
}
```

### Step 5: Handle project tab close

When a project tab is closed, all browser panes for that project must have their webviews destroyed. Check where `removeProject` is called in `browser-store.ts` and ensure the new `removePanesForProject` is invoked with all browser leaf IDs from the project's pane tree.

In whatever component handles tab close (likely in `project-store` or `tab-bar`):
```ts
// Collect browser pane IDs from the tree
const tree = usePaneStore.getState().trees[projectPath];
if (tree) {
  const leafIds = collectLeafIds(tree);
  const browserPaneIds = leafIds.filter(id =>
    usePaneStore.getState().getPaneType(projectPath, id) === "browser"
  );
  useBrowserStore.getState().removePanesForProject(browserPaneIds);
}
```

## Todo List
- [ ] Add "browser" to PaneType union in pane-store.ts
- [ ] Import BrowserPane in split-pane-container.tsx
- [ ] Update pane component selection to 3-way switch
- [ ] Add Ctrl+Shift+B shortcut in use-keyboard-shortcuts.ts
- [ ] Update Ctrl+W to clean up browser state
- [ ] Handle project tab close -- destroy all browser webviews
- [ ] Test: split terminal with browser, verify webview appears
- [ ] Test: close browser pane, verify webview destroyed
- [ ] Test: switch views, verify webview hides/shows

## Success Criteria
- Ctrl+Shift+B creates a browser pane in the split tree
- Browser pane renders correctly alongside terminal and Claude panes
- Webview positions and resizes correctly within split layout
- Closing browser pane destroys native webview
- Closing project tab destroys all browser webviews for that project

## Risk Assessment
- **Webview z-order**: Native webview overlays everything. If two browser panes overlap during resize, both webviews render on top. Acceptable since split layout prevents overlap.
- **Performance**: Multiple webviews per project increase memory. Acceptable tradeoff for multi-browser workflow.
