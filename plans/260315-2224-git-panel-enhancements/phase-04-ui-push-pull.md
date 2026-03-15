# Phase 4: UI — Push/Pull Buttons

## Priority: HIGH | Status: TODO

## Overview
Add push and pull buttons to commit box area so user can sync with remote after committing.

## Related Files
- Modify: `src/components/commit-box.tsx`

## Design

### Layout (bottom bar of commit box)
```
Ctrl+Enter to commit    [Pull ↓1] [Push ↑2] [Commit]
```
- Pull button: shows behind count badge when > 0
- Push button: shows ahead count badge when > 0
- Both show spinner while in progress
- Push auto-sets upstream if no tracking branch (`--set-upstream origin <branch>`)

## Implementation Steps

### 1. Update `commit-box.tsx`
- Read `ahead`, `behind`, `pushing`, `pulling` from git store
- Add Pull button (left of Push) — calls `pull(projectPath)`
- Add Push button (left of Commit) — calls `push(projectPath)`
- Disable buttons during push/pull operations
- Show count badges with Catppuccin colors (green for ahead/push, yellow for behind/pull)

### 2. Button states
- Pull disabled when: `pulling` or `behind === 0` (optional: always enabled for fetch)
- Push disabled when: `pushing` or `ahead === 0`
- Actually, keep Push always enabled (user may want to push even when ahead=0, e.g. force push scenario or first push)
- Pull always enabled too (user may want to fetch)

## Success Criteria
- Can push commits to remote
- Can pull changes from remote
- Loading states prevent double-clicks
- Ahead/behind badges update after push/pull
