# Phase 5: Remove Browser Sidebar View & Update Shortcuts

## Context Links
- [app-store.ts](../../src/stores/app-store.ts) -- AppView type
- [sidebar.tsx](../../src/components/sidebar.tsx) -- sidebar nav items
- [app.tsx](../../src/app.tsx) -- main app layout
- [use-keyboard-shortcuts.ts](../../src/hooks/use-keyboard-shortcuts.ts) -- shortcuts
- [plan.md](plan.md)

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Remove "browser" from AppView, remove browser sidebar button, remove browser view rendering from app.tsx, update keyboard shortcuts (Ctrl+4 becomes SSH).

## Key Insights
- `AppView = "terminal" | "git" | "editor" | "browser" | "ssh"` -- remove "browser"
- Sidebar has 5 items -- becomes 4
- `app.tsx` renders browser view div and floating browser panels -- remove both
- Keyboard shortcuts Ctrl+4 (browser) and Ctrl+5 (SSH) -- SSH becomes Ctrl+4
- F5 (browser reload) and F12 (browser devtools) need to work in terminal view when a browser pane is focused
- `browser-view.tsx` can be deleted after this phase

## Requirements

### Functional
- Remove "browser" from `AppView` type
- Remove browser button from sidebar (Globe icon, Ctrl+4)
- SSH moves to Ctrl+4 position
- Remove browser view div from app.tsx per-project rendering
- Remove floating browser panel rendering from app.tsx (float mode moves to Phase 6)
- F5/F12 shortcuts work when focused on a browser pane in terminal view
- Delete `browser-view.tsx`

### Non-functional
- README.md references to "Browser" view may need updating (separate doc task)

## Related Code Files

### Files to Modify
- `src/stores/app-store.ts` -- remove "browser" from AppView
- `src/components/sidebar.tsx` -- remove browser nav item
- `src/app.tsx` -- remove browser view div, remove floating panel section
- `src/hooks/use-keyboard-shortcuts.ts` -- update view shortcuts, move F5/F12

### Files to Delete
- `src/components/browser-view.tsx` -- replaced by browser-pane.tsx

## Implementation Steps

### Step 1: Update AppView type

```ts
// BEFORE
export type AppView = "terminal" | "git" | "editor" | "browser" | "ssh";
// AFTER
export type AppView = "terminal" | "git" | "editor" | "ssh";
```

### Step 2: Update Sidebar

Remove the browser entry from `NAV_ITEMS`:
```ts
const NAV_ITEMS: { view: AppView; icon: typeof Terminal; label: string }[] = [
  { view: "terminal", icon: Terminal, label: "Terminal" },
  { view: "git", icon: GitBranch, label: "Git" },
  { view: "editor", icon: Code, label: "Editor" },
  { view: "ssh", icon: Monitor, label: "SSH" },
];
```

Remove `Globe` import from lucide-react.

### Step 3: Update app.tsx

Remove the browser view rendering block (lines ~87-96):
```tsx
{/* REMOVE THIS BLOCK */}
<div
  className="absolute inset-0"
  style={{
    visibility: view === "browser" ? "visible" : "hidden",
    zIndex: view === "browser" ? 1 : 0,
  }}
>
  <BrowserView projectPath={tab.path} />
</div>
```

Remove the floating browser panels section (lines ~112-131):
```tsx
{/* REMOVE THIS BLOCK -- floating panels handled in Phase 6 */}
{openTabs.map((tab) => { ... FloatingPanel ... })}
```

Remove imports: `BrowserView`, `FloatingPanel`, `useBrowserStore`.

### Step 4: Update Keyboard Shortcuts

```ts
// BEFORE
if (isCtrl && e.key === "4") { setView("browser"); }
if (isCtrl && e.key === "5") { setView("ssh"); }

// AFTER
if (isCtrl && e.key === "4") { setView("ssh"); }
// Remove Ctrl+5 (no 5th view)
```

### Step 5: Move F5/F12 to Browser Pane Context

Current shortcuts check `view === "browser"`. Change to check if active pane is a browser pane:

```ts
// F5: refresh browser pane (not the app)
if (e.key === "F5") {
  e.preventDefault();
  if (isCtrl) { window.location.reload(); return; }
  // Check if active pane in terminal view is a browser pane
  if (view === "terminal") {
    const activeId = getActiveId(project);
    const paneType = usePaneStore.getState().getPaneType(project, activeId);
    if (paneType === "browser") {
      invoke("browser_reload", { paneId: activeId });
    }
  }
  return;
}

// F12: open browser devtools
if (view === "terminal") {
  const activeId = getActiveId(project);
  const paneType = usePaneStore.getState().getPaneType(project, activeId);
  if (e.key === "F12" && paneType === "browser") {
    e.preventDefault();
    invoke("open_browser_devtools", { paneId: activeId });
    return;
  }
}
```

### Step 6: Delete browser-view.tsx

Remove the file. All its logic has been ported to `browser-pane.tsx` (Phase 3).

## Todo List
- [ ] Remove "browser" from AppView type
- [ ] Remove Globe import and browser nav item from sidebar.tsx
- [ ] Remove browser view div from app.tsx
- [ ] Remove floating panel rendering from app.tsx
- [ ] Remove BrowserView, FloatingPanel, useBrowserStore imports from app.tsx
- [ ] Update Ctrl+4 to SSH, remove Ctrl+5
- [ ] Update F5/F12 shortcuts for browser pane context
- [ ] Delete `src/components/browser-view.tsx`
- [ ] Compile check -- fix any remaining "browser" view references
- [ ] Search codebase for `view === "browser"` -- update or remove

## Success Criteria
- Only 4 sidebar buttons (Terminal, Git, Editor, SSH)
- Ctrl+1-4 switches between the 4 views
- No `view === "browser"` references remain
- `browser-view.tsx` deleted
- F5/F12 work when browser pane is focused in terminal view
- App compiles and runs cleanly

## Risk Assessment
- **Breaking change**: Any code checking `view === "browser"` will fail TypeScript check -- good, compiler catches it
- **Floating panels**: Removed from app.tsx here. Re-added per-pane in Phase 6. Brief gap if phases aren't done sequentially.
- **README**: Says "Six views. One sidebar." -- becomes 5 views. Doc update is separate.
