# Phase 3: Refactor App Layout

## Priority: High | Status: ✅ | Depends: Phase 1, 2

## Overview
Refactor `app.tsx` and child components to render one panel per open project tab, hide/show based on active tab. Each project panel has its own terminal panes + git panel.

## Key Insights
- Use visibility hidden (not unmount) to keep PTY sessions alive across tab switches
- Terminal panes need project-scoped PTY — `usePty` already takes `cwd` param
- Git panel needs project-scoped state — pass `projectPath` prop
- Sidebar remains global (terminal/git view toggle applies to all tabs)

## Related Code Files

### Modify
- `src/app.tsx` — render per-project panels, wire to active tab
- `src/components/terminal-pane.tsx` — accept `projectPath` prop for PTY cwd
- `src/components/git-panel.tsx` — accept `projectPath` prop for scoped git ops
- `src/components/commit-box.tsx` — accept `projectPath` prop
- `src/components/split-pane-container.tsx` — accept `projectPath` prop for pane tree lookup
- `src/components/status-bar.tsx` — remove ProjectSelector, show active tab's branch
- `src/hooks/use-session-persistence.ts` — persist per-project pane trees
- `src/hooks/use-keyboard-shortcuts.ts` — update split/close to pass projectPath

## Implementation Steps

### 1. Refactor `app.tsx`
```tsx
// For each openTab, render a project panel (hidden if not active)
{openTabs.map((tab) => (
  <div
    key={tab.path}
    className="absolute inset-0"
    style={{ visibility: tab.path === activeTabPath ? "visible" : "hidden" }}
  >
    {/* Terminal view */}
    <div style={{ visibility: view === "terminal" ? "visible" : "hidden" }}>
      <SplitPaneContainer projectPath={tab.path} node={getTree(tab.path)} />
    </div>
    {/* Git view */}
    <div style={{ visibility: view === "git" ? "visible" : "hidden" }}>
      <GitPanel projectPath={tab.path} />
    </div>
  </div>
))}
```

### 2. Update `terminal-pane.tsx`
- Add `projectPath` prop
- Pass `projectPath` as `cwd` to `usePty()` instead of reading from project-store
- Remove direct dependency on `useProjectStore`

### 3. Update `git-panel.tsx` + `commit-box.tsx`
- Add `projectPath` prop
- Read git state via `useGitStore.getState(projectPath)`
- All actions (stage, unstage, commit, refresh) pass `projectPath`

### 4. Update `split-pane-container.tsx`
- Add `projectPath` prop
- Read pane tree from `usePaneStore.getTree(projectPath)`
- Pass `projectPath` down to `TerminalPane`

### 5. Update `status-bar.tsx`
- Remove `ProjectSelector` component (tabs replace it)
- Read branch from `useGitStore.getState(activeTabPath)`
- Show active project name + branch

### 6. Update `use-session-persistence.ts`
- Save all project pane trees (not just single root)
- Save open tabs list + active tab

### 7. Update `use-keyboard-shortcuts.ts`
- Split/close pane shortcuts need `activeTabPath` context

## Todo List
- [ ] Refactor app.tsx to render per-project panels
- [ ] Add projectPath prop to terminal-pane.tsx
- [ ] Add projectPath prop to git-panel.tsx + commit-box.tsx
- [ ] Add projectPath prop to split-pane-container.tsx
- [ ] Update status-bar.tsx (remove ProjectSelector)
- [ ] Update session persistence for multi-project
- [ ] Update keyboard shortcuts for project-scoped panes
- [ ] Re-fit terminals on tab switch (visibility change)

## Success Criteria
- Each tab shows its own terminal panes and git panel
- Switching tabs is instant (no PTY restart)
- Terminal resize works correctly after tab switch
- Git state is independent per tab
- Session persistence saves/restores all open tabs

## Risk Assessment
- **Terminal fit on tab switch**: Hidden terminals have 0 dimensions. Must re-fit when tab becomes visible (same pattern already used for terminal/git view toggle).
- **Memory usage**: Each open tab keeps PTYs alive. Document this as expected behavior.
