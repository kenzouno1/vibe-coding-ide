# Phase 5: Git Diff + Commit UI

## Priority: High
## Status: Pending

## Overview
Git status panel with staged/unstaged files, diff viewer, commit interface. Uses `git` CLI directly.

## Architecture
```
[React UI] <--Tauri Commands--> [Rust git_ops.rs] <--shell--> [git CLI]
```

## Rust Backend
- `git_ops.rs` — shell out to git for: status, diff, add, reset, commit, log, branch
- Parse git output into structured JSON

## Frontend Components
- `components/git-panel.tsx` — sidebar: staged/unstaged file lists
- `components/diff-viewer.tsx` — diff rendering with diff2html
- `components/commit-box.tsx` — message textarea + commit button
- `components/branch-selector.tsx` — current branch + switch
- `stores/git-store.ts` — Zustand store for git state

## Steps
1. Rust: git status/diff/add/reset/commit commands
2. GitPanel: file tree with stage/unstage actions
3. DiffViewer: render selected file diff with diff2html
4. CommitBox: textarea + commit button + amend toggle
5. Auto-refresh git status on file changes (polling or fs watcher)
6. Branch selector with switch support

## Success Criteria
- See changed files (staged/unstaged)
- Click file → see diff
- Stage/unstage files
- Write commit message and commit
- See current branch
