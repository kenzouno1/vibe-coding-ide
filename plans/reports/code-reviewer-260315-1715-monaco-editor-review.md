# Code Review: Monaco Editor + File Explorer

## Scope
- **New files:** 11 (1177 LOC total)
- **Modified files:** 7
- **Focus:** Security, memory leaks, pattern consistency, edge cases, performance
- **TypeScript:** Compiles clean (0 errors)
- **ESLint:** Not configured in project

## Overall Assessment

Solid implementation. Clean component decomposition, proper Zustand patterns matching existing stores, good lazy-loading strategy for file tree. Several security and robustness issues found, mostly in the Rust backend.

---

## Critical Issues

### C1. No path traversal protection in Rust file commands
**File:** `src-tauri/src/file_ops.rs` (all 7 commands)

All file operation commands accept arbitrary absolute paths with zero validation. Any frontend code (or XSS if CSP is ever weakened) can:
- Read/write/delete any file on the filesystem the process has access to
- Traverse with `../` or absolute paths outside the project directory

**Impact:** Full filesystem access. `delete_entry` with `remove_dir_all` is especially dangerous -- a crafted path could wipe system directories.

**Fix:** Validate that the resolved (canonicalized) path is within an allowed project directory:

```rust
use std::path::PathBuf;

fn validate_path(path: &str, allowed_root: &str) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| format!("Invalid path: {}", e))?;
    let root = std::fs::canonicalize(allowed_root)
        .map_err(|e| format!("Invalid root: {}", e))?;
    if !canonical.starts_with(&root) {
        return Err("Path outside project directory".to_string());
    }
    Ok(canonical)
}
```

Alternative: pass `project_path` from frontend in every command and validate server-side.

### C2. `delete_entry` uses `remove_dir_all` with no safeguards
**File:** `src-tauri/src/file_ops.rs:110-117`

Recursive deletion with only a JS `window.confirm` gate (in `file-context-menu.tsx:60`). If the confirmation is bypassed programmatically or the path is constructed incorrectly, entire directory trees are deleted irrecoverably.

**Fix:** At minimum, refuse to delete if `path` equals any known project root. Ideally, move to trash instead of permanent delete (use `trash` crate).

### C3. CSP is set to `null` in tauri.conf.json
**File:** `src-tauri/tauri.conf.json:27`

`"csp": null` disables Content Security Policy entirely. Combined with C1, any XSS vector would have full filesystem access via Tauri commands.

**Fix:** Set a restrictive CSP. At minimum:
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
```

---

## High Priority

### H1. `getOriginalContent` closure captures stale `openFiles`
**File:** `src/components/editor-pane.tsx:27-31`

`getOriginalContent` is memoized on `openFiles`, but the `onDidChangeContent` listener (line 69-73) captures the `getOriginalContent` from creation time. After a save (which updates `openFiles[].content`), the closure still references the old content, so dirty state becomes incorrect -- the file will appear dirty even after saving.

**Fix:** Use a ref to hold the latest saved content per file, updated in the effect that switches models or after save:

```tsx
const savedContentRef = useRef<Map<string, string>>(new Map());
// Update on model creation and after save
```

### H2. `editorSaveFile` imported but unused in keyboard shortcuts
**File:** `src/hooks/use-keyboard-shortcuts.ts:27`

`editorSaveFile` is imported from the store but never called -- the save shortcut dispatches a custom event instead. This is correct (Monaco needs to provide the model content), but the unused import adds to the dependency array (line 140) causing unnecessary re-renders of the effect.

**Fix:** Remove `editorSaveFile` from the hook imports and the dependency array.

### H3. No unsaved-changes guard on tab close
**Files:** `src/stores/editor-store.ts:96-118`, `src/hooks/use-keyboard-shortcuts.ts:103-108`

`closeFile` and Ctrl+W silently discard dirty files without prompting. Users will lose work.

**Fix:** Check `isDirty` before closing and show confirmation:
```ts
const file = state.openFiles.find(f => f.filePath === filePath);
if (file?.isDirty && !window.confirm(`"${file.displayName}" has unsaved changes. Close anyway?`)) return;
```

### H4. Context menu path construction uses forward slash on Windows
**File:** `src/components/file-context-menu.tsx:77-79`, `src/components/file-explorer.tsx:50,59`

Paths are concatenated with `/` (e.g., `` `${targetDir}/${name}` ``). On Windows, `targetDir` from Rust uses `\` separators. Mixing separators may work in some cases but is fragile.

**Fix:** Use the path separator from the existing path, or normalize on the Rust side. Simplest frontend fix:
```ts
const sep = targetDir.includes("\\") ? "\\" : "/";
const fullPath = `${targetDir}${sep}${name}`;
```

---

## Medium Priority

### M1. File tree node re-renders on every store change
**File:** `src/components/file-tree-node.tsx:26-27`

Every `FileTreeNode` subscribes to `activeFilePath` and `openFile` from the editor store. In a large tree with hundreds of nodes, changing the active file triggers re-render of ALL nodes (only one needs highlight update).

**Fix:** Use `React.memo` with a custom comparator, or move the active-file highlight check into a separate wrapper component that only the active node subscribes to.

### M2. No input sanitization for file/folder names in header buttons
**File:** `src/components/file-explorer.tsx:46-65`

`handleNewFile` and `handleNewFolder` use `window.prompt` but only check for empty input. Unlike the context menu (which checks `..`, `/`, `\`), these don't validate the name at all.

**Fix:** Extract the name validation into a shared utility:
```ts
function isValidFileName(name: string): boolean {
  return name.trim().length > 0
    && !name.includes('..')
    && !name.includes('/')
    && !name.includes('\\')
    && !/[<>:"|?*]/.test(name); // Windows reserved chars
}
```

### M3. Monaco `addCommand` re-registered on every `activeFilePath` change
**File:** `src/components/editor-pane.tsx:142-155`

The Ctrl+S command is re-added via `editor.addCommand()` every time `activeFilePath` changes. Monaco `addCommand` does not remove previous bindings -- they stack up. This could cause multiple save calls or stale closure references.

**Fix:** Use `editor.addAction` with an ID (which replaces existing actions with the same ID), or register once and use a ref for `activeFilePath`:
```tsx
const activeFileRef = useRef(activeFilePath);
activeFileRef.current = activeFilePath;
// Register command once in onMount
```

### M4. `tsx` files detected as `typescript` instead of `typescriptreact`
**File:** `src/utils/language-detect.ts:6`

Monaco has a separate `typescriptreact` language ID for `.tsx` files and `javascriptreact` for `.jsx`. Using `typescript` means JSX syntax highlighting may be incomplete in some themes.

**Fix:**
```ts
tsx: "typescriptreact",
jsx: "javascriptreact",
```

### M5. Rename path computation is fragile
**File:** `src/components/file-context-menu.tsx:81`

`entry.path.substring(0, entry.path.lastIndexOf(entry.name))` fails if the entry name appears multiple times in the path (e.g., `/home/test/test`). This would construct an incorrect parent path.

**Fix:** Use `lastIndexOf` on the path separator instead:
```ts
const lastSep = Math.max(entry.path.lastIndexOf('/'), entry.path.lastIndexOf('\\'));
const parentDir = entry.path.substring(0, lastSep + 1);
```

---

## Low Priority

### L1. Double-save path: both custom event and Monaco command
**Files:** `src/hooks/use-keyboard-shortcuts.ts:87-101`, `src/components/editor-pane.tsx:141-155`

Ctrl+S is handled in two places: the global keyboard handler dispatches a custom event, and the Monaco command handler intercepts it when editor is focused. When the editor IS focused, both fire. The keyboard handler's `e.preventDefault()` may prevent the keydown from reaching Monaco, but this is fragile and browser-dependent.

**Fix:** Remove one path. Recommend keeping only the Monaco `addCommand` for when editor is focused, and the custom event for when the editor is not focused (e.g., focus is on file explorer).

### L2. No loading/error states for file open failures
**File:** `src/stores/editor-store.ts:91-93`

`openFile` silently logs errors. User gets no feedback if a file fails to open (permissions, binary file that fails UTF-8 read, etc.).

### L3. `DirEntry` type duplicated between frontend and Rust
**File:** `src/components/file-tree-node.tsx:7-12` (JS), `src-tauri/src/file_ops.rs:6-11` (Rust)

The TypeScript interface mirrors the Rust struct but isn't auto-generated. If Rust changes, the frontend will silently break.

**Suggestion:** Consider using `tauri-specta` or a shared types approach in future.

---

## Positive Observations

- Clean component decomposition -- each file is under 200 lines per project rules
- Proper Monaco model lifecycle management with disposal on close and unmount
- View state persistence across tab switches (cursor position, scroll)
- Lazy directory loading prevents upfront performance cost
- Existing Zustand patterns (per-project state, `getState` helper, `removeProject` cleanup) correctly replicated
- Catppuccin theme well-integrated with existing Catppuccin/TailwindCSS design system
- Middle-click to close tabs -- good UX detail
- `visibility: hidden` pattern for view switching matches existing terminal/git approach

---

## Recommended Actions (Priority Order)

1. **[Critical]** Add path validation in Rust `file_ops.rs` -- all commands must verify path is within project root
2. **[Critical]** Set a restrictive CSP in `tauri.conf.json`
3. **[Critical]** Add safeguards to `delete_entry` (trash crate or root-check)
4. **[High]** Fix stale closure in `getOriginalContent` for dirty tracking
5. **[High]** Add unsaved-changes confirmation on tab close
6. **[High]** Fix path separator handling for Windows
7. **[Medium]** Fix `addCommand` stacking in Monaco save handler
8. **[Medium]** Use `typescriptreact`/`javascriptreact` language IDs
9. **[Medium]** Add shared filename validation for file-explorer header buttons
10. **[Medium]** Fix rename path computation edge case

## Metrics
- **Type Coverage:** 100% (strict mode, no `any` leaks)
- **Test Coverage:** 0% (no tests written yet)
- **Linting Issues:** N/A (no ESLint config)
- **File Size Compliance:** All files under 200 lines

## Unresolved Questions

1. Should `list_directory` accept a configurable skip-list instead of hardcoded `node_modules`, `.git`, etc.? Users may want to see `.env` or config files that start with `.`.
2. Is there a plan for file-watcher integration (Tauri `fs:watch`) to auto-refresh the tree when external changes occur?
3. Should binary files be handled differently (image preview, hex view) rather than failing silently on UTF-8 read?
