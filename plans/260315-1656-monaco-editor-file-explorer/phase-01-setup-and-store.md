---
phase: 1
title: "Setup + Store"
status: complete
effort: 2h
---

# Phase 1: Setup + Store

## Context Links
- [plan.md](plan.md) | [app-store.ts](../../src/stores/app-store.ts) | [git-store.ts](../../src/stores/git-store.ts)

## Overview
Install Monaco npm package, create editor Zustand store with per-project isolation, and add Rust file operations backend module.

## Requirements
- **Functional:** Editor store manages open files, active file, dirty tracking, Monaco view states per project
- **Non-functional:** Store must handle 50+ open files without perf degradation; Rust file ops must handle files up to 10MB

## Architecture

### Editor Store (`src/stores/editor-store.ts`)

```typescript
interface EditorFileTab {
  filePath: string;        // absolute path
  displayName: string;     // basename
  content: string;         // original content from disk
  isDirty: boolean;
  language: string;        // detected from extension
}

interface ProjectEditorState {
  openFiles: EditorFileTab[];
  activeFilePath: string | null;
  viewStates: Record<string, unknown>; // Monaco ICodeEditorViewState per file
  explorerWidth: number;               // resizable panel width
}

interface EditorStore {
  states: Record<string, ProjectEditorState>;
  getState: (projectPath: string) => ProjectEditorState;
  openFile: (projectPath: string, filePath: string) => Promise<void>;
  closeFile: (projectPath: string, filePath: string) => void;
  setActiveFile: (projectPath: string, filePath: string) => void;
  setDirty: (projectPath: string, filePath: string, isDirty: boolean) => void;
  saveFile: (projectPath: string, filePath: string, content: string) => Promise<void>;
  saveViewState: (projectPath: string, filePath: string, viewState: unknown) => void;
  setExplorerWidth: (projectPath: string, width: number) => void;
  removeProject: (projectPath: string) => void;
}
```

Follow `git-store.ts` pattern exactly: `Record<string, ProjectEditorState>`, `updateProjectState` helper, `DEFAULT_STATE` constant.

### Rust File Ops (`src-tauri/src/file_ops.rs`)

Commands:
- `list_directory(path: String) -> Vec<DirEntry>` -- returns `{name, path, is_dir, extension}` sorted (dirs first, then alpha)
- `read_file(path: String) -> String` -- read text content
- `write_file(path: String, content: String) -> ()` -- write text content
- `create_file(path: String) -> ()` -- create empty file
- `create_directory(path: String) -> ()` -- mkdir
- `rename_entry(old_path: String, new_path: String) -> ()` -- rename file/dir
- `delete_entry(path: String) -> ()` -- delete file/dir (dir recursive)

### AppView Extension

Update `app-store.ts`:
```typescript
export type AppView = "terminal" | "git" | "editor";
```

## Related Code Files

### Modify
- `src/stores/app-store.ts` -- add `"editor"` to AppView union
- `src-tauri/src/lib.rs` -- register file_ops module and commands

### Create
- `src/stores/editor-store.ts` -- new Zustand store
- `src-tauri/src/file_ops.rs` -- new Rust module

## Implementation Steps

1. **Install Monaco package**
   ```bash
   npm install @monaco-editor/react
   ```

2. **Update `app-store.ts`** -- extend `AppView` type to include `"editor"`

3. **Create `src-tauri/src/file_ops.rs`**
   - Define `DirEntry` struct with Serialize derive
   - Implement `list_directory`: use `std::fs::read_dir`, sort dirs-first then alphabetically, skip hidden files (configurable)
   - Implement `read_file`: `std::fs::read_to_string` with size check (reject >10MB)
   - Implement `write_file`: `std::fs::write`
   - Implement `create_file`: `std::fs::File::create`
   - Implement `create_directory`: `std::fs::create_dir_all`
   - Implement `rename_entry`: `std::fs::rename`
   - Implement `delete_entry`: check is_dir, use `remove_dir_all` or `remove_file`
   - All commands: `#[tauri::command]`, return `Result<T, String>`

4. **Register in `lib.rs`**
   - Add `mod file_ops;`
   - Add all 7 commands to `invoke_handler` macro

5. **Create `src/stores/editor-store.ts`**
   - Define interfaces as shown above
   - Implement `openFile`: invoke `read_file`, detect language from extension, add to openFiles if not already open, set as active
   - Implement `closeFile`: remove from openFiles, if was active select adjacent tab
   - Implement `saveFile`: invoke `write_file`, update content, clear dirty
   - Implement `saveViewState`: store Monaco view state for restoring cursor/scroll position
   - Language detection helper: map common extensions to Monaco language IDs (`ts`->`typescript`, `rs`->`rust`, `json`->`json`, etc.)

6. **Verify build**
   ```bash
   npm run build  # check TS compilation
   cd src-tauri && cargo check  # check Rust compilation
   ```

## Todo List

- [x] `npm install @monaco-editor/react`
- [x] Extend AppView in app-store.ts
- [x] Create file_ops.rs with all 7 commands
- [x] Register file_ops in lib.rs
- [x] Create editor-store.ts with per-project state
- [x] Language detection helper function
- [x] Verify TS + Rust compilation

## Success Criteria
- `cargo check` passes with file_ops module
- `npm run build` passes with editor store
- AppView type includes "editor"
- Editor store follows same Record<projectPath, State> pattern as git-store

## Risk Assessment
- **Large file handling:** Mitigated by 10MB size limit in `read_file`
- **Binary files:** Mitigated by checking file extension before opening; show warning for unknown binary types
