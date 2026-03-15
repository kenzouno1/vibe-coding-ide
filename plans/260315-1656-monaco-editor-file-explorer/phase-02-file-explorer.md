---
phase: 2
title: "File Explorer"
status: complete
effort: 3h
depends_on: [phase-01]
---

# Phase 2: File Explorer

## Context Links
- [plan.md](plan.md) | [phase-01](phase-01-setup-and-store.md)

## Overview
Build recursive file tree component with lazy-loading directory expansion, file CRUD context menu, and resizable panel.

## Requirements
- **Functional:** Display project directory tree, expand/collapse dirs, click to open file, right-click context menu (new file, new folder, rename, delete), drag-to-resize explorer width
- **Non-functional:** Render 1000+ files without jank, lazy-load dirs on expand

## Architecture

### Component Tree
```
EditorView (layout container)
  +-- FileExplorer (left panel, resizable)
  |     +-- FileTreeNode (recursive)
  |           +-- FileTreeNode ...
  +-- ResizeHandle (drag to resize)
  +-- EditorPane (right, monaco + tabs -- Phase 3)
```

### FileTreeNode State
Each directory node has local state: `{expanded: boolean, children: DirEntry[] | null}`. Children loaded on first expand via `invoke("list_directory")`. Cache children in component state (cleared on manual refresh).

### Context Menu
Simple absolute-positioned div triggered by `onContextMenu`. Options vary by target (file vs dir vs empty space). Close on click-outside or Escape.

## Related Code Files

### Create
- `src/components/file-explorer.tsx` -- tree panel with header + scroll area (~180 lines)
- `src/components/file-tree-node.tsx` -- recursive tree node (~150 lines)
- `src/components/file-context-menu.tsx` -- right-click menu (~100 lines)
- `src/components/editor-view.tsx` -- layout container for explorer + editor (~80 lines)

### Modify
- `src/app.tsx` -- add editor view layer (same visibility pattern as terminal/git)

## Implementation Steps

1. **Create `editor-view.tsx`** -- Layout wrapper
   - Horizontal flex: FileExplorer (left) + resize handle + editor placeholder (right)
   - Explorer width from `editorStore.getState(projectPath).explorerWidth` (default 250px)
   - Resize handle: mousedown -> mousemove updates width, mouseup stops. Clamp 150-500px.
   - Props: `{ projectPath: string }`

2. **Create `file-explorer.tsx`** -- Tree panel
   - Header row: project name + refresh button + new file/folder buttons
   - Scrollable tree area below header
   - On mount, call `invoke("list_directory", { path: projectPath })` to load root entries
   - Render `FileTreeNode` for each entry
   - Styling: `bg-ctp-mantle`, items use `text-ctp-text`, hover `bg-ctp-surface0`, selected `bg-ctp-surface1 text-ctp-mauve`

3. **Create `file-tree-node.tsx`** -- Recursive node
   - Props: `{ entry: DirEntry, depth: number, projectPath: string }`
   - Indent: `paddingLeft = depth * 16px`
   - Directory: chevron icon (rotates on expand), folder icon, name. Click toggles expand.
   - File: file icon (use lucide `File`, `FileCode`, `FileJson` based on extension), name. Click calls `editorStore.openFile`.
   - On expand: if children null, call `list_directory` and cache. Show spinner while loading.
   - Right-click: show context menu with position

4. **Create `file-context-menu.tsx`** -- Context menu
   - Absolute positioned at mouse coords
   - Items: New File, New Folder, Rename, Delete (conditionally shown)
   - New File/Folder: show inline input in tree (temporary node)
   - Rename: show inline input replacing the name text
   - Delete: confirm dialog via `@tauri-apps/plugin-dialog` `ask()`
   - After CRUD ops, refresh parent directory children

5. **Wire into `app.tsx`**
   - Add editor view div alongside terminal and git divs
   - Same CSS visibility toggle pattern:
   ```tsx
   <div
     className="absolute inset-0"
     style={{
       visibility: view === "editor" ? "visible" : "hidden",
       zIndex: view === "editor" ? 1 : 0,
     }}
   >
     <EditorView projectPath={tab.path} />
   </div>
   ```

6. **File icons helper** -- `src/utils/file-icons.ts`
   - Map extensions to lucide icon components
   - `.ts/.tsx` -> FileCode, `.json` -> FileJson, `.md` -> FileText, default -> File
   - Keep simple, ~30 lines

## Todo List

- [x] Create editor-view.tsx with resizable layout
- [x] Create file-explorer.tsx with directory listing
- [x] Create file-tree-node.tsx with lazy expand
- [x] Create file-context-menu.tsx with CRUD operations
- [x] Create file-icons.ts utility
- [x] Wire editor view into app.tsx
- [x] Test: expand/collapse dirs, open file, CRUD operations
- [x] Verify all files under 200 lines

## Success Criteria
- File tree renders project directory recursively
- Lazy loading: dirs only fetched on expand
- Context menu: create file, create folder, rename, delete all functional
- Resizable explorer panel persists width in store
- Catppuccin themed consistently with sidebar/terminal

## Risk Assessment
- **Large directories (node_modules):** Lazy loading mitigates. Consider adding `.gitignore`-aware filtering later (YAGNI for now, but list_directory should skip `node_modules` and `.git` by default)
- **Race conditions on rapid expand/collapse:** Use local loading flag per node

## Security Considerations
- Delete operations require confirmation dialog
- Rename validation: prevent path traversal (`..`), empty names
- File paths sanitized on Rust side (resolve to absolute, verify within project root)
