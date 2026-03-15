# Design Guidelines — DevTools

## Color Palette (Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-base` | `#0d1117` | App background |
| `bg-surface` | `#161b22` | Panels, cards, sidebar |
| `bg-elevated` | `#1c2128` | Hover states, active tabs, dropdowns |
| `bg-input` | `#0d1117` | Input fields, terminal bg |
| `border-default` | `#30363d` | Panel borders, dividers |
| `border-muted` | `#21262d` | Subtle separators |
| `text-primary` | `#e6edf3` | Primary text |
| `text-secondary` | `#8b949e` | Labels, descriptions, inactive tabs |
| `text-muted` | `#484f58` | Disabled, placeholder |
| `accent-blue` | `#58a6ff` | Links, active indicators, branch badges |
| `accent-green` | `#3fb950` | Staged files, additions, success |
| `accent-red` | `#f85149` | Deletions, errors, unstaged changes |
| `accent-yellow` | `#d29922` | Warnings, modified indicators |
| `accent-purple` | `#bc8cff` | Merge conflicts, special states |
| `diff-add-bg` | `#12261e` | Diff addition line bg |
| `diff-del-bg` | `#2d1318` | Diff deletion line bg |
| `diff-add-highlight` | `#1a4028` | Diff addition word highlight |
| `diff-del-highlight` | `#4c1520` | Diff deletion word highlight |
| `terminal-cursor` | `#58a6ff` | Terminal cursor color |
| `selection` | `#264f78` | Text selection bg |

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Terminal text | JetBrains Mono | 400 | 13px |
| Code / diff | JetBrains Mono | 400 | 12px |
| UI body | Inter | 400 | 13px |
| UI labels | Inter | 500 | 11px (uppercase tracking 0.05em) |
| UI headings | Inter | 600 | 14px |
| Status bar | Inter | 400 | 11px |
| Tab titles | Inter | 400 | 12px |
| Keyboard shortcuts | JetBrains Mono | 400 | 10px |

Line height: 1.5 for UI, 1.2 for terminal. Letter-spacing: -0.01em for Inter headings.

## Spacing System

Base unit: 4px. Scale: 0/1/2/3/4/5/6/8/10/12/16 (multiply by 4px).
- Panel padding: 12px (3 units)
- Component gap: 8px (2 units)
- Section gap: 16px (4 units)
- Sidebar width: 48px (icon-only) or 200px (expanded)
- Status bar height: 24px
- Tab bar height: 36px
- Border radius: 4px (inputs), 6px (cards), 8px (modals)

## Component Patterns

### Sidebar
- Icon-only (48px wide), vertical, top-aligned nav icons
- Active indicator: 2px left accent-blue bar
- Icons: 20px, centered, `text-secondary` default, `text-primary` on active

### Tab Bar
- Horizontal tabs with close button on hover
- Active tab: `bg-elevated` + `border-b-2 accent-blue`
- "+" button at end for new session/tab

### Split Panes
- Drag handle: 4px wide/tall, `border-default` color, cursor changes on hover
- Minimum pane size: 120px
- Visual indicator on drag: `accent-blue` 2px line

### Diff Viewer
- Line numbers: `text-muted`, right-aligned, 48px gutter
- Added lines: `diff-add-bg` with `accent-green` gutter marker
- Deleted lines: `diff-del-bg` with `accent-red` gutter marker
- Inline mode default, toggle to split via toolbar button

### Commit Interface
- Textarea: 3-line min height, `bg-input`, `border-default`
- Commit button: `accent-blue` bg, `text-primary`, full-width below textarea
- Staged/unstaged: collapsible file lists with checkbox-style staging

### Editor View
- Two-pane layout: File explorer (left, resizable) + Editor area (right)
- File explorer: Hierarchical tree with file icons, 150-500px width, click to open
- Tab bar: Horizontal tabs above editor, shows filename + dot indicator for unsaved changes
- Editor: Monaco Editor with Catppuccin Mocha theme, syntax highlighting per language
- Empty state: Large file icon with "Open a file from the explorer" message

### Status Bar
- Full-width bottom bar, `bg-surface`, `border-t border-default`
- Left: project name + branch (with git icon)
- Right: terminal session count, keyboard shortcut hints

## Icon Style

- Lucide icons (consistent with shadcn/ui)
- Size: 16px in UI, 20px in sidebar
- Stroke width: 1.5px
- Color inherits from text color tokens

## Keyboard Shortcuts (Reference)

| Action | Shortcut |
|--------|----------|
| Switch to Terminal | `Ctrl+1` |
| Switch to Git | `Ctrl+2` |
| Switch to Editor | `Ctrl+3` |
| Next project tab | `Ctrl+Tab` |
| Previous project tab | `Ctrl+Shift+Tab` |
| **Terminal View** | |
| Split horizontal | `Ctrl+Shift+H` |
| Split vertical | `Ctrl+Shift+V` |
| Close pane | `Ctrl+W` |
| **Editor View** | |
| Save file | `Ctrl+S` |
| Close file | `Ctrl+W` |
| **Git View** | |
| Commit | `Ctrl+Enter` (in commit box) |
| Stage file | `S` (with file selected) |
| Unstage file | `U` (with file selected) |

## Responsive Behavior

Desktop-only (Electron). Minimum window: 800x500px.
- Below 1000px width: sidebar collapses to icon-only
- Below 900px: diff viewer forces inline mode
- Split panes respect minimum sizes, redistribute on resize

## Accessibility

- Focus rings: 2px `accent-blue` outline, 2px offset
- All interactive elements keyboard-navigable
- ARIA labels on icon-only buttons
- Contrast ratios: all text tokens meet WCAG AA against their bg
- `prefers-reduced-motion`: disable pane resize animations
