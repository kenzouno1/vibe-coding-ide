---
title: "Monaco Editor + File Explorer"
description: "Add code editor view with file explorer, multi-tab editing, and terminal integration"
status: complete
priority: P1
effort: 12h
branch: feat/monaco-editor-file-explorer
tags: [editor, file-explorer, monaco, phase-1]
created: 2026-03-15
---

# Monaco Editor + File Explorer

## Summary

Add a third sidebar view ("editor") with a file explorer tree panel and Monaco-based multi-tab code editor. Follows existing per-project state isolation pattern (`Record<projectPath, State>`), CSS visibility toggle for view switching, and Catppuccin Mocha theming.

## Architecture

- **New Rust module:** `src-tauri/src/file_ops.rs` -- directory listing, file read/write, create/rename/delete
- **New store:** `src/stores/editor-store.ts` -- open editor tabs, active file, dirty state, view states
- **New components:** `file-explorer.tsx`, `editor-view.tsx`, `editor-tab-bar.tsx`, `editor-pane.tsx`
- **Modified files:** `app-store.ts` (add "editor" view), `sidebar.tsx` (Code icon, Ctrl+3), `app.tsx` (editor view layer), `status-bar.tsx` (cursor pos, language), `use-keyboard-shortcuts.ts` (Ctrl+3, Ctrl+S)
- **Deps:** `@monaco-editor/react` (npm), no new Rust crates needed

## Phases

| # | Phase | File | Effort | Status |
|---|-------|------|--------|--------|
| 1 | Setup + Store | [phase-01](phase-01-setup-and-store.md) | 2h | complete |
| 2 | File Explorer | [phase-02](phase-02-file-explorer.md) | 3h | complete |
| 3 | Monaco Editor | [phase-03](phase-03-monaco-editor.md) | 4h | complete |
| 4 | Integration | [phase-04](phase-04-integration.md) | 3h | complete |

## Key Decisions

1. Single Monaco editor instance, swap models per file (perf)
2. Rust backend for file I/O (not `@tauri-apps/plugin-fs`) -- consistent with existing pattern of custom Tauri commands
3. File explorer uses lazy loading -- only expand dirs on click
4. Per-project editor state isolation matches `git-store.ts` pattern
5. Catppuccin Mocha Monaco theme defined in code, not imported

## Dependencies

- `@monaco-editor/react` ^4.7.0
- No new Rust crates (std::fs sufficient)
