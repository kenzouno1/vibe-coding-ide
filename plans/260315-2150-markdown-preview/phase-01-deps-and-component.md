# Phase 1: Install Dependencies & Create MarkdownPreview Component

## Priority: High | Status: Complete | Effort: S

## Overview
Install `react-markdown` and `remark-gfm`, create a `MarkdownPreview` component that renders markdown content with proper styling.

## Requirements
- Render GFM markdown (tables, checkboxes, strikethrough, autolinks)
- Match Catppuccin Mocha dark theme
- Scrollable content area
- Code blocks with syntax highlighting colors

## Dependencies
```bash
npm install react-markdown remark-gfm
```

## Implementation Steps

1. Install `react-markdown` and `remark-gfm`
2. Create `src/components/markdown-preview.tsx`:
   - Accept `content: string` prop
   - Render with `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
   - Wrap in scrollable container with Catppuccin-themed styles
   - Style headings, code blocks, tables, links, lists via Tailwind

## Files to Create
- `src/components/markdown-preview.tsx`

## Success Criteria
- Component renders markdown string to styled HTML
- GFM features work (tables, checkboxes, strikethrough)
- Matches dark theme aesthetics
