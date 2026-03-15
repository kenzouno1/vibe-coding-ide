# Markdown Preview in Code Editor

## Summary
When opening `.md`/`.mdx` files, show rendered markdown preview instead of raw text. Toggle between edit and preview modes.

## Status: Complete

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | Install deps & create MarkdownPreview component | Complete | S |
| 2 | Integrate into EditorView with mode toggle | Complete | S |
| 3 | Style markdown content with Catppuccin theme | Complete | S |

## Architecture

```
EditorView
├── FileExplorer (left)
├── Editor area (right)
│   ├── EditorTabBar (with preview toggle for .md files)
│   └── activeFile.language === "markdown" && previewMode?
│       ├── YES → MarkdownPreview (rendered HTML)
│       └── NO  → EditorPane (Monaco)
```

## Key Decisions
- Use `react-markdown` + `remark-gfm` — lightweight, React-native, supports GFM tables/checkboxes
- No split view (YAGNI) — simple toggle between edit/preview
- Preview mode stored in editor store per-file
- Toggle button in tab bar for markdown files only
