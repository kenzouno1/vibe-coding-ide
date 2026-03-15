---
phase: 4
title: "Integration"
status: complete
effort: 3h
depends_on: [phase-02, phase-03]
---

# Phase 4: Integration

## Context Links
- [plan.md](plan.md) | [sidebar.tsx](../../src/components/sidebar.tsx) | [use-keyboard-shortcuts.ts](../../src/hooks/use-keyboard-shortcuts.ts) | [status-bar.tsx](../../src/components/status-bar.tsx)

## Overview
Wire editor view into sidebar navigation, add keyboard shortcuts, update status bar with editor context, and implement terminal-to-editor file opening.

## Requirements
- **Functional:** Ctrl+3 switches to editor view, Ctrl+S saves active file, sidebar shows Code icon, status bar shows cursor position + language when in editor view, terminal link clicking opens file in editor
- **Non-functional:** No regressions in terminal/git views

## Related Code Files

### Modify
- `src/components/sidebar.tsx` -- add Code icon for editor view
- `src/hooks/use-keyboard-shortcuts.ts` -- add Ctrl+3 (editor view), Ctrl+S (save), Ctrl+W (close editor tab when in editor view)
- `src/components/status-bar.tsx` -- show cursor pos + language in editor view
- `src/components/terminal-pane.tsx` -- add file link matcher to xterm
- `src/stores/editor-store.ts` -- add cursor position tracking

## Implementation Steps

1. **Update `sidebar.tsx`**
   - Import `Code` icon from lucide-react
   - Add to NAV_ITEMS: `{ view: "editor", icon: Code, label: "Editor" }`
   - No other changes needed -- existing map rendering handles it

2. **Update `use-keyboard-shortcuts.ts`**
   - Add Ctrl+3 -> `setView("editor")`
   - Add Ctrl+S -> when `view === "editor"`, prevent default, get active file from editor store, trigger save
   - Add Ctrl+W -> when `view === "editor"`, close active editor tab (not project tab)
   - Import `useEditorStore`

3. **Update `status-bar.tsx`**
   - When `view === "editor"`:
     - Show cursor position: `Ln {line}, Col {col}` (from editor store)
     - Show language: `TypeScript`, `Rust`, etc.
     - Show file path (truncated)
   - When `view !== "editor"`: keep existing git branch + changes display
   - Add cursor position to editor store: `cursorPosition: { line: number, col: number }` per project, updated via Monaco `onDidChangeCursorPosition` event
   - Add `Ctrl+3 Editor` to shortcut hints in status bar

4. **Update `editor-store.ts`** -- add cursor tracking
   - Add to `ProjectEditorState`: `cursorLine: number, cursorCol: number`
   - Add action: `setCursorPosition(projectPath, line, col)`
   - In editor-pane.tsx: hook `editor.onDidChangeCursorPosition` -> update store

5. **Terminal-to-editor file link** (stretch goal, can defer)
   - In `terminal-pane.tsx`, register xterm link matcher for file paths
   - Pattern: common compiler output format `filepath:line:col` or `filepath(line,col)`
   - On click: `setView("editor")`, `editorStore.openFile(projectPath, filePath)`, set cursor to line:col
   - Use xterm `registerLinkProvider` with custom regex
   - **Note:** This is lower priority. Implement basic version matching absolute paths only.

6. **Clean up project close**
   - In `project-store.ts` `closeTab`: also call `editorStore.removeProject(path)` to clean up editor state
   - Matches existing pattern: already calls `paneStore.removeProject` and `gitStore.removeProject`

7. **Verify complete flow**
   - Open app -> terminal view (default)
   - Ctrl+3 -> editor view with file explorer
   - Click file -> opens in Monaco with syntax highlighting
   - Edit file -> dirty indicator appears
   - Ctrl+S -> saves, dirty clears
   - Open multiple files -> tab switching preserves state
   - Ctrl+1 -> back to terminal, Ctrl+3 -> editor restored
   - Close project tab -> editor state cleaned up

## Todo List

- [x] Add Code icon to sidebar
- [x] Add Ctrl+3 shortcut for editor view
- [x] Add Ctrl+S shortcut for save
- [x] Add Ctrl+W shortcut for close editor tab
- [x] Update status bar with cursor position + language
- [x] Add cursor position tracking to editor store
- [x] Hook Monaco cursor events in editor-pane
- [x] Clean up editor state on project close
- [x] Add Ctrl+3 hint to status bar
- [ ] (Deferred) Terminal file link opening
- [x] End-to-end testing of complete flow

## Success Criteria
- Sidebar shows 3 icons: Terminal, Git, Code
- Ctrl+1/2/3 switches between views
- Status bar context-aware (git info for terminal/git, cursor+lang for editor)
- Ctrl+S saves active editor file
- Project close cleans up all editor state
- No regressions in terminal or git views

## Risk Assessment
- **Keyboard shortcut conflicts:** Ctrl+S in terminal should pass through to PTY (already works since shortcuts only fire when terminal not focused). Ctrl+W needs careful handling -- only close editor tab in editor view, not browser tab.
- **Terminal link matching:** Regex may produce false positives. Start with strict absolute path matching only.

## Security Considerations
- File save: Rust backend validates path is within project root before writing
- Terminal link click: validate path exists before attempting to open
