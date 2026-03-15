# Code Review: Multi-Tab Architecture Refactor

**Date:** 2026-03-15
**Scope:** 13 files (~650 LOC) -- stores, components, hooks
**Focus:** Correctness, edge cases, React patterns, potential bugs

---

## Overall Assessment

Solid refactor. Clean separation of per-project state via `Record<string, T>` pattern across all three stores. Lazy initialization in pane-store is well-designed. Hide/show strategy for preserving PTY sessions is the correct approach. A few edge cases and one potential bug worth addressing.

---

## Critical Issues

None.

---

## High Priority

### 1. BUG: `getTree()` side-effect during render causes infinite loop risk

**File:** `src/stores/pane-store.ts:76-86`

`getTree()` calls `set()` to lazily create a default tree. This is called from `SplitPaneContainer` during render via `getTree(projectPath)`. Calling `set()` inside a Zustand selector/getter during React render triggers a re-render, which calls `getTree()` again. Zustand's shallow equality check should prevent the loop since the key already exists on second call, but this is fragile.

**Fix:** Initialize the tree in an effect or in `openTab`/`loadProjects` when a tab is opened, rather than lazily in a getter that runs during render.

```ts
// In project-store's openTab:
openTab: (path) => {
  // ... existing logic ...
  usePaneStore.getState().getTree(path); // pre-init
}
```

### 2. Session persistence only saves active tab's pane tree

**File:** `src/hooks/use-session-persistence.ts:18-21`

Only `trees[activeTabPath]` is persisted. If the user modifies panes on Tab A, switches to Tab B, and the app crashes, Tab A's pane changes are lost unless the debounce timer fired while Tab A was still active.

**Fix:** Save all trees, or save each tree when switching away from a tab.

```ts
// Save all trees at once:
invoke("save_session", { trees, view }).catch(() => {});
```

### 3. Git polling runs for ALL open GitPanels, not just active

**File:** `src/components/git-panel.tsx:21-32`

Every `GitPanel` instance sets up a 10-second polling interval. With 5 open tabs, that is 5 concurrent polling loops running against potentially different repos, even though only one is visible.

**Fix:** Guard the interval with an `isActive` check or move polling to a single location that only refreshes the active tab's git state.

```ts
useEffect(() => {
  if (activeTabPath !== projectPath) return; // skip inactive
  refresh(projectPath);
  const interval = setInterval(() => refresh(projectPath), 10000);
  // ...
}, [projectPath, refresh, activeTabPath]);
```

### 4. `closeTab` does not clean up per-project state in other stores

**File:** `src/stores/project-store.ts:127-144`

When a tab is closed, `pane-store.removeProject()` and `git-store.removeProject()` are never called. PTY sessions, pane trees, and git state for closed tabs accumulate as memory/resource leaks.

**Fix:** Call cleanup in `closeTab`:

```ts
closeTab: (path) => {
  // ... existing filtering logic ...
  usePaneStore.getState().removeProject(path);
  useGitStore.getState().removeProject(path);
  // Note: PTY kill is handled by TerminalPane unmount, but since
  // hide/show keeps components mounted, closing tab should unmount them
}
```

**Related concern:** Since the app uses `visibility: hidden` (not conditional rendering), closing a tab via store state change removes it from `openTabs.map()`, which WILL unmount the component and kill PTYs. This is correct. But if a future refactor changes to keeping closed tabs in the array, PTYs would leak.

---

## Medium Priority

### 5. `TerminalPane` effect has empty deps array with captured closures

**File:** `src/components/terminal-pane.tsx:80-137`

The main `useEffect` has `[]` deps but captures `write` and `resize` from `usePty`. These are stable refs (`useCallback` with `[]` deps), so this works today. But the `// eslint-disable-line` suppression hides a real coupling -- if `usePty` ever returns non-stable callbacks, the terminal would use stale references.

**Impact:** Low risk currently; fragile for future changes.

### 6. Global `nextId` counter in pane-store resets on hot reload

**File:** `src/stores/pane-store.ts:38-41`

`let nextId = 1` is module-scoped. During development with HMR, the counter resets, potentially producing duplicate pane IDs if the store state is preserved across reloads (Zustand with `persist` middleware or manual restoration).

**Impact:** Dev-only issue. Could cause split/close to target wrong pane.

**Fix:** Use `crypto.randomUUID()` or timestamp-based IDs instead.

### 7. `selectedFile` ambiguity in git-store

**File:** `src/stores/git-store.ts:13` + `src/components/git-panel.tsx:134-136`

`selectedFile` stores only `path`, but the same file can appear in both staged and unstaged lists (partially staged). The highlight `selectedFile === f.path` will highlight both rows. The `selectFile` action does distinguish via the `staged` param for fetching the diff, but the visual selection is ambiguous.

**Fix:** Store `selectedFile` as `{ path: string; staged: boolean } | null` or use a compound key like `${staged}-${path}`.

### 8. `useKeyboardShortcuts` subscribes to entire `gitStore`

**File:** `src/hooks/use-keyboard-shortcuts.ts:24`

```ts
const gitStore = useGitStore();
```

This subscribes to ALL git store changes. Every git refresh (every 10s per open tab) triggers the effect to re-register the keydown handler. Use individual selectors instead.

**Fix:**
```ts
const gitCommit = useGitStore((s) => s.commit);
const gitGetState = useGitStore((s) => s.getState);
const gitStageFile = useGitStore((s) => s.stageFile);
const gitUnstageFile = useGitStore((s) => s.unstageFile);
```

---

## Low Priority

### 9. `stageFile` / `unstageFile` don't handle errors

**File:** `src/stores/git-store.ts:102-109`

`invoke("git_add")` and `invoke("git_reset")` can throw. The error propagates uncaught to the component.

### 10. Path normalization inconsistency

`toDisplayName` normalizes backslashes to forward slashes for display. But `tab.path` comparisons throughout the codebase use raw paths. On Windows, Tauri may return paths with either separator. Two paths pointing to the same directory with different separators would create duplicate tabs.

### 11. Tab close button accessibility

**File:** `src/components/tab-bar.tsx:27-34`

The close button lacks an `aria-label`. Minor a11y gap.

---

## Edge Cases Found

1. **Empty project list + no saved tabs:** `loadProjects` auto-opens first project. If `list_projects` returns empty, user sees blank screen with no tabs. The "+" button works, but there is no empty-state messaging.

2. **Rapid tab switching during git refresh:** `selectFile` in git-store is `async` but store updates use stale `s.states` closure. If two `selectFile` calls interleave, the second overwrites the first's state update. Not a crash risk, but could show wrong diff briefly.

3. **`Ctrl+W` in terminal view closes pane, not tab:** Could confuse users expecting browser-like "close tab" behavior. The `closeTab` function is imported in the hook but never wired to a shortcut.

4. **Window `beforeunload` handler:** `invoke` is async. The `beforeunload` event does not wait for async operations. Session save on close is best-effort and may not complete.

---

## Positive Observations

- Clean `updateProjectState` helper avoids repetitive spread patterns in git-store
- `visibility: hidden` strategy is correct for preserving xterm + PTY state
- Proper ResizeObserver guard against resizing hidden terminals
- Good tab-close adjacent-selection logic (picks next or previous)
- `memo` on `TerminalPane` prevents unnecessary re-renders
- `usePty` double-init guard handles StrictMode correctly
- Consistent use of Catppuccin theme tokens throughout

---

## Recommended Actions (Priority Order)

1. Wire `closeTab` to call `removeProject` on pane-store and git-store (resource leak)
2. Fix git polling to only run for active tab (perf)
3. Use individual Zustand selectors in `useKeyboardShortcuts` (perf)
4. Move `getTree` lazy init out of render path (correctness)
5. Persist all pane trees, not just active tab (data loss risk)
6. Store `selectedFile` with staged flag (UX bug)
7. Switch pane ID generation to UUID (dev stability)

---

## Unresolved Questions

1. Does the Rust backend `save_session` command accept a full `Record<string, PaneNode>` or only a single tree? If only single, the persistence fix needs backend changes.
2. Is there a plan for tab reordering (drag-and-drop)? Current array-index-based tab switching would break if tabs can be reordered.
3. Should `removeProject` (from project list) also close the tab, or are they intentionally independent operations?
