# Editor Language Styles

## Overview
Add language-specific color styling to editor tabs and status bar for: TSX, JSX, JS, HTML, CSS, TS, Python.

**Priority:** Low | **Status:** Planned | **Effort:** Small

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Create language color map utility | ⬜ |
| 2 | Update editor tab bar with language colors | ⬜ |
| 3 | Update status bar language indicator | ⬜ |

## Architecture

Simple utility-based approach using Catppuccin Mocha palette colors mapped to languages.

### Color Mapping (Catppuccin Mocha)
| Language | Color | Rationale |
|----------|-------|-----------|
| TypeScript | `ctp-blue` | Blue = TS brand color |
| TSX | `ctp-blue` | TS variant |
| JavaScript | `ctp-yellow` | Yellow = JS brand color |
| JSX | `ctp-yellow` | JS variant |
| HTML | `ctp-peach` | Orange/peach = HTML |
| CSS | `ctp-sapphire` | Blue variant = CSS |
| Python | `ctp-green` | Green = Python |

### Files to Modify
- `src/utils/language-detect.ts` — Add `getLanguageColor()` export
- `src/components/editor-tab-bar.tsx` — Add colored dot/indicator per tab
- `src/components/status-bar.tsx` — Color the language text

### Implementation Details

**Phase 1: Language color map** (`language-detect.ts`)
- Add `LANGUAGE_COLOR_MAP` mapping Monaco language IDs → Catppuccin CSS class names
- Export `getLanguageColor(language: string): string` function
- Return empty string for unmapped languages (no color)

**Phase 2: Editor tab bar** (`editor-tab-bar.tsx`)
- Add small colored dot before file name in each tab
- Use `getLanguageColor()` to get the `bg-ctp-*` class
- Only show dot if color exists

**Phase 3: Status bar** (`status-bar.tsx`)
- Apply `text-ctp-*` color to the language name text
- Use `getLanguageColor()` with `text-` prefix variant

## Success Criteria
- [ ] Each target language shows its assigned color in tabs
- [ ] Status bar language text is colored
- [ ] No color shown for unmapped languages (fallback to default)
- [ ] No visual regression on existing tabs
