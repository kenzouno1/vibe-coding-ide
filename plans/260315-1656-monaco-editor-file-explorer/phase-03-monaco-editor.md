---
phase: 3
title: "Monaco Editor"
status: complete
effort: 4h
depends_on: [phase-01, phase-02]
---

# Phase 3: Monaco Editor

## Context Links
- [plan.md](plan.md) | [phase-01](phase-01-setup-and-store.md) | [phase-02](phase-02-file-explorer.md)

## Overview
Integrate Monaco editor with multi-tab file editing, Catppuccin Mocha theme, dirty state tracking, save functionality, and view state persistence per file.

## Requirements
- **Functional:** Syntax-highlighted code editing, multi-tab bar with close/dirty indicators, Ctrl+S save, view state (cursor, scroll) restored on tab switch, language auto-detection
- **Non-functional:** Single Monaco instance for performance, model-swapping pattern, responsive resize

## Architecture

### Monaco Model Management
- One `monaco.editor.IStandaloneCodeEditor` instance (via `@monaco-editor/react` `Editor` component with `onMount` ref)
- One `monaco.editor.ITextModel` per open file. Create on file open, dispose on file close.
- On tab switch: save current view state (`editor.saveViewState()`), set new model (`editor.setModel(model)`), restore view state (`editor.restoreViewState()`)
- Models stored in a `Map<filePath, ITextModel>` ref (not in Zustand -- Monaco objects not serializable)

### Catppuccin Mocha Theme
Define custom Monaco theme in `src/utils/monaco-catppuccin-theme.ts` using `monaco.editor.defineTheme()`. Map Catppuccin colors to token categories.

### Tab Bar
Separate from project TabBar. Editor tabs sit above Monaco, show filename + dirty dot + close button.

## Related Code Files

### Create
- `src/components/editor-pane.tsx` -- Monaco wrapper with model management (~180 lines)
- `src/components/editor-tab-bar.tsx` -- file tabs above editor (~120 lines)
- `src/utils/monaco-catppuccin-theme.ts` -- theme definition (~80 lines)
- `src/utils/language-detect.ts` -- extension to Monaco language map (~40 lines)

### Modify
- `src/components/editor-view.tsx` -- replace placeholder with EditorPane + EditorTabBar

## Implementation Steps

1. **Create `language-detect.ts`**
   - Export `detectLanguage(filePath: string): string`
   - Map: `ts/tsx` -> `typescript`, `js/jsx` -> `javascript`, `rs` -> `rust`, `json` -> `json`, `md` -> `markdown`, `html` -> `html`, `css` -> `css`, `py` -> `python`, `toml` -> `toml`, `yaml/yml` -> `yaml`, `sh/bash` -> `shell`, default -> `plaintext`
   - Extract extension via `filePath.split('.').pop()`

2. **Create `monaco-catppuccin-theme.ts`**
   - Export `CATPPUCCIN_MOCHA_THEME` object conforming to `monaco.editor.IStandaloneThemeData`
   - Base: `vs-dark`
   - Colors mapping:
     - `editor.background` -> `#1e1e2e` (ctp-base)
     - `editor.foreground` -> `#cdd6f4` (ctp-text)
     - `editor.lineHighlightBackground` -> `#313244` (ctp-surface0)
     - `editor.selectionBackground` -> `#45475a` (ctp-surface1)
     - `editorCursor.foreground` -> `#f5e0dc` (ctp-rosewater)
     - `editorLineNumber.foreground` -> `#6c7086` (ctp-overlay0)
     - `editorLineNumber.activeForeground` -> `#cba6f7` (ctp-mauve)
     - `editorWidget.background` -> `#181825` (ctp-mantle)
     - `editorSuggestWidget.background` -> `#181825`
     - `editorSuggestWidget.selectedBackground` -> `#313244`
   - Token rules: keywords -> `ctp-mauve`, strings -> `ctp-green`, comments -> `ctp-overlay0`, functions -> `ctp-blue`, types -> `ctp-yellow`, numbers -> `ctp-peach`, variables -> `ctp-text`

3. **Create `editor-tab-bar.tsx`**
   - Horizontal scrollable tab list
   - Each tab: filename, dirty indicator (dot before name if dirty), close button (X)
   - Active tab: `bg-ctp-base text-ctp-mauve border-b-2 border-ctp-mauve`
   - Inactive: `bg-ctp-mantle text-ctp-overlay1 hover:text-ctp-text`
   - Close button: `hover:bg-ctp-surface1 rounded`
   - Click tab -> `editorStore.setActiveFile()`
   - Close tab -> `editorStore.closeFile()` (prompt save if dirty)
   - Middle-click -> close tab
   - Props: `{ projectPath: string }`

4. **Create `editor-pane.tsx`** -- Core Monaco integration
   - Import `Editor` from `@monaco-editor/react`
   - On mount (`handleEditorDidMount`):
     - Store editor ref
     - Register Catppuccin theme via `monaco.editor.defineTheme("catppuccin-mocha", theme)`
     - Set theme: `monaco.editor.setTheme("catppuccin-mocha")`
   - **Model management** (useRef `Map<string, ITextModel>`):
     - `getOrCreateModel(filePath, content, language)`: check map, create if missing via `monaco.editor.createModel(content, language, Uri.file(filePath))`
     - On file open: create model, set on editor
     - On file close: dispose model, remove from map
   - **Tab switch effect** (react to `activeFilePath` change):
     - Save current view state: `viewStatesRef.current[prevFile] = editor.saveViewState()`
     - Also persist to store: `editorStore.saveViewState(projectPath, prevFile, viewState)`
     - Get/create model for new file, `editor.setModel(model)`
     - Restore view state: `editor.restoreViewState(viewStatesRef.current[newFile])`
   - **Dirty tracking**:
     - On model content change (`model.onDidChangeContent`): compare with original content from store, set dirty flag
   - **Save** (called from Ctrl+S or tab bar):
     - Get current model value, call `editorStore.saveFile()`
   - Editor options: `fontSize: 14`, `minimap: { enabled: false }` (KISS), `scrollBeyondLastLine: false`, `automaticLayout: true`, `padding: { top: 8 }`
   - Props: `{ projectPath: string }`

5. **Update `editor-view.tsx`**
   - Replace right-side placeholder with:
   ```tsx
   <div className="flex-1 flex flex-col overflow-hidden">
     <EditorTabBar projectPath={projectPath} />
     <EditorPane projectPath={projectPath} />
   </div>
   ```
   - Show empty state when no files open: centered text "Open a file from the explorer" with file icon

## Todo List

- [x] Create language-detect.ts
- [x] Create monaco-catppuccin-theme.ts
- [x] Create editor-tab-bar.tsx
- [x] Create editor-pane.tsx with model management
- [x] Wire into editor-view.tsx
- [x] Dirty state tracking with visual indicator
- [x] View state save/restore on tab switch
- [x] Empty state when no files open
- [x] Verify Monaco loads and renders with theme

## Success Criteria
- Monaco editor renders with Catppuccin Mocha theme
- Opening file creates model, displays content with syntax highlighting
- Switching tabs preserves cursor position and scroll
- Dirty indicator shows when content modified
- Ctrl+S saves file to disk and clears dirty state
- Multiple files can be open simultaneously
- Closing file disposes Monaco model (no memory leak)

## Risk Assessment
- **Monaco bundle size:** ~2MB. Acceptable for desktop app. Worker loading handled by `@monaco-editor/react` defaults.
- **Monaco + React 19:** Confirmed compatible with `@monaco-editor/react` v4.7+
- **View state serialization:** Store view state in ref (not Zustand) to avoid serialization issues. Only persist to store on unmount for session recovery (future enhancement).
