# Code Review: Markdown Preview Feature

## Scope
- Files: `markdown-preview.tsx` (new), `editor-view.tsx`, `editor-tab-bar.tsx`, `editor-store.ts`, `styles.css`
- LOC: ~210 added/modified
- Focus: markdown preview toggle in editor

## Overall Assessment

**Good implementation.** Clean separation of concerns, proper state cleanup, correct toggle logic. A few medium-priority edge cases below.

## Critical Issues

None.

## High Priority

### 1. Stale content in preview mode

**Problem:** `MarkdownPreview` receives `activeFile.content` from the store, but content is only updated on file open and save. If user edits markdown, toggles to preview, they see the *last saved* content, not the current editor buffer.

**Impact:** Confusing UX -- user edits are invisible in preview until saved.

**File:** `src/components/editor-view.tsx:67`

**Fix:** Before switching to preview, sync Monaco model content to the store. Either:
- (a) In `togglePreview`, read the Monaco model value and update the store's `openFiles[].content`
- (b) In `editor-view.tsx`, when `isPreview` is true, read content from the Monaco model ref instead of the store

Option (a) is simpler:
```ts
// In editor-pane.tsx or a shared util, expose a way to get current model content
// Then in togglePreview action or the toggle button handler:
const model = monacoRef.current?.editor.getModel(monaco.Uri.file(filePath));
if (model) updateContent(projectPath, filePath, model.getValue());
```

### 2. Ctrl+S does nothing in preview mode

**Problem:** When in preview mode, `EditorPane` is unmounted, so Ctrl+S keyboard shortcut is not registered. If user made edits, toggled to preview, and hits Ctrl+S, nothing happens.

**Impact:** Minor -- dirty indicator still shows, but user expects save to work.

**Fix:** Add a global keyboard listener for Ctrl+S in `editor-view.tsx` (or the tab bar) that delegates to the store's `saveFile` regardless of preview state.

## Medium Priority

### 3. Monaco model/view state not saved when entering preview

**Problem:** When toggling to preview, `EditorPane` unmounts. The unmount cleanup in `editor-pane.tsx` (lines 152-163) disposes ALL models and clears ALL view states. When toggling back, the model is recreated from the store's (possibly stale) content, and cursor position / scroll position are lost.

**Impact:** UX friction -- user loses their place in the file when toggling preview on/off.

**Fix:** The cleanup effect runs on unmount and disposes everything. Consider either:
- Not unmounting `EditorPane` (hide with CSS `display: none` instead)
- Or only dispose models for *closed* files on unmount, not all models

Hiding with CSS is the simplest fix:
```tsx
// editor-view.tsx
{isPreview && activeFile && <MarkdownPreview content={activeFile.content} />}
<div style={{ display: isPreview ? 'none' : 'block' }} className="flex-1 overflow-hidden">
  <EditorPane projectPath={projectPath} />
</div>
```

### 4. `previewModes[activeFilePath!]` non-null assertion

**File:** `src/components/editor-tab-bar.tsx:38`

**Problem:** `activeFilePath` is typed as `string | null`. The `!` assertion is guarded by `isMarkdownFile` being truthy (which requires `activeFile` to exist), so it is *safe at runtime* but not type-safe.

**Fix:** Use optional chaining:
```ts
const isPreview = isMarkdownFile && activeFilePath && (previewModes[activeFilePath] ?? false);
```

### 5. IIFE in JSX

**File:** `src/components/editor-view.tsx:63-70`

**Problem:** The IIFE pattern `{(() => { ... })()}` works but is unusual in React. It makes the render harder to scan.

**Fix:** Extract to a variable before the return:
```tsx
const showPreview = activeFile?.language === "markdown" && (previewModes[activeFilePath!] ?? false);
// In JSX:
{showPreview ? <MarkdownPreview content={activeFile!.content} /> : <EditorPane ... />}
```

## Low Priority

### 6. No syntax highlighting in code blocks

`react-markdown` renders code blocks as plain `<pre><code>`, with no syntax highlighting. This is fine for an MVP, but consider adding `rehype-highlight` or `react-syntax-highlighter` later for better DX.

### 7. CSS could use `@layer` for specificity control

The `.markdown-preview` styles are plain CSS alongside Tailwind. If Tailwind v4 `@layer` priorities shift, these could be overridden. Low risk with current setup.

## Edge Cases Found

1. **MDX files:** `language-detect.ts` maps `.mdx` to `"markdown"`, so MDX files also auto-preview. MDX content with JSX components will render as raw text. Acceptable but worth noting.
2. **Empty markdown file:** `ReactMarkdown` handles empty string fine -- no crash.
3. **Very large markdown file:** No virtualization, but unlikely to be an issue for typical .md files.
4. **Multiple projects:** `previewModes` is scoped per project path -- correct.
5. **Re-opening a closed markdown file:** Preview mode cleanup on close is correct (line 117 in store). Re-open correctly defaults to preview mode (line 92-93).

## Positive Observations

- Clean state management: preview modes stored per-file, cleaned up on close
- Auto-enable preview for .md files is good UX
- Toggle button placement (right side of tab bar) follows IDE conventions
- CSS theming is thorough and consistent with Catppuccin Mocha
- GFM support (tables, checkboxes, strikethrough) via remark-gfm
- Dependencies (`react-markdown@10`, `remark-gfm@4`) are current versions
- TypeScript compiles cleanly with no errors

## Recommended Actions

1. **[High]** Sync Monaco buffer to store before showing preview (stale content bug)
2. **[High]** Add global Ctrl+S handler that works in preview mode
3. **[Medium]** Hide EditorPane instead of unmounting to preserve cursor/scroll state
4. **[Medium]** Remove non-null assertion on line 38 of tab-bar
5. **[Low]** Extract IIFE to variable in editor-view
6. **[Low]** Consider syntax highlighting for code blocks in future iteration

## Metrics

- Type Coverage: 100% (no `any`, clean compile)
- Linting Issues: 1 (non-null assertion `!`)
- Test Coverage: N/A (no tests for this feature yet)

## Unresolved Questions

1. Should preview update live as user types (split-pane preview), or is toggle-only sufficient for v1?
2. Should Ctrl+S in preview mode save and also refresh the preview content?
