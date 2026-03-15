# Refactor UI: Project Tab Panels

## Overview
Replace the current single-project-with-dropdown model with a tab-based UI where each open project gets its own tab panel. Switching tabs swaps terminal panes + git context without `window.location.reload()`.

## Current Architecture
- `project-store.ts`: stores `currentProject` (single), switching calls `window.location.reload()`
- `project-selector.tsx`: dropdown in status bar to pick project
- `app.tsx`: single `SplitPaneContainer` + `GitPanel`, both tied to `currentProject`
- `pane-store.ts`: single pane tree for terminals
- `use-pty.ts`: each terminal pane spawns 1 PTY tied to cwd
- `git-store.ts`: single git state tied to `setCwd(currentProject)`

## Target Architecture
- Tab bar below TitleBar showing open projects
- Each tab owns: pane tree (terminals) + git state
- Switching tabs = hide/show (preserve PTY sessions, no reload)
- Close tab = kill PTYs for that project
- Status bar: remove ProjectSelector dropdown, show current tab's branch info

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Refactor stores for multi-project | ✅ | [phase-01](phase-01-refactor-stores.md) |
| 2 | Add tab bar component | ✅ | [phase-02](phase-02-tab-bar.md) |
| 3 | Refactor App layout | ✅ | [phase-03](phase-03-app-layout.md) |
| 4 | Clean up & test | ✅ | [phase-04](phase-04-cleanup.md) |

## Key Decisions
- **Hide/show vs mount/unmount**: Hide inactive tabs (keep PTYs alive, instant switch)
- **Store approach**: Single `project-store` manages array of open projects + activeId, each project has its own pane tree and git state
- **No backend changes needed**: PTY manager already supports multiple sessions via IDs; git_ops takes cwd as param
