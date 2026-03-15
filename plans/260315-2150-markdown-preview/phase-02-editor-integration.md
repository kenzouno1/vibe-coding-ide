# Phase 2: Integrate into EditorView with Mode Toggle

## Priority: High | Status: Complete | Effort: S

## Overview
Add preview mode state to editor store. Show toggle button in tab bar for markdown files. Swap between Monaco and MarkdownPreview based on mode.

## Implementation Steps

1. **Update `editor-store.ts`**:
   - Add `previewModes: Record<string, boolean>` to `ProjectEditorState`
   - Add `togglePreview(projectPath, filePath)` action
   - Add `isPreviewMode(projectPath, filePath)` selector
   - Default: `true` for markdown files (show preview by default)

2. **Update `editor-tab-bar.tsx`**:
   - For active markdown files, show Eye/Code toggle icon button
   - Click toggles between preview and edit mode
   - Visual indicator of current mode

3. **Update `editor-view.tsx`**:
   - Check if active file is markdown AND preview mode is on
   - If yes: render `<MarkdownPreview content={activeFile.content} />`
   - If no: render `<EditorPane />` as before
   - Content for preview comes from Monaco model if dirty, else from store

## Files to Modify
- `src/stores/editor-store.ts`
- `src/components/editor-tab-bar.tsx`
- `src/components/editor-view.tsx`

## Success Criteria
- Toggle button appears only for .md/.mdx files
- Clicking toggle swaps between Monaco editor and rendered preview
- Preview shows current content (including unsaved edits)
- State persists per-file across tab switches
