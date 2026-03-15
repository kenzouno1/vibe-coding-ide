# Git Panel Enhancements

## Overview
Add missing git operations to git panel: ahead/behind commit counts, branch switching, branch creation, push, pull, and tag management.

## Current State
- **Backend** (`src-tauri/src/git_ops.rs`, 151 lines): `git_status`, `git_diff`, `git_add`, `git_reset`, `git_commit`, `git_branch`, `git_log`
- **Store** (`src/stores/git-store.ts`, 131 lines): Per-project state with branch, files, diff, commitMessage
- **UI** (`src/components/git-panel.tsx`, 260 lines): Header (branch + refresh), file tree, diff viewer, commit box

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | Backend: new Rust commands | TODO | `git_ops.rs`, `lib.rs` |
| 2 | Store: extend git state & actions | TODO | `git-store.ts` |
| 3 | UI: branch bar (switch/create/ahead-behind) | TODO | `git-panel.tsx`, new `git-branch-bar.tsx` |
| 4 | UI: push/pull buttons | TODO | `git-panel.tsx` or `commit-box.tsx` |
| 5 | UI: tag management | TODO | new `git-tag-popover.tsx` |

## Key Design Decisions
- Keep git commands thin (shell out to git CLI) — consistent with existing pattern
- Branch switching/creation via popover dropdown, not a modal
- Ahead/behind counts fetched during `git_status` refresh cycle
- Push/pull buttons next to commit button in commit box
- Tags as lightweight popover from header area
