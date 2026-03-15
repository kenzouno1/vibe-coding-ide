# DevTools UI/UX Design Report

## Deliverables

### 1. Design Guidelines
**File:** `C:\Users\Bug\Desktop\devtools\docs\design-guidelines.md` (130 lines)

- **Color palette**: 20 tokens — GitHub-dark inspired, high contrast for code readability
- **Typography**: JetBrains Mono (terminal/code), Inter (UI) — both Google Fonts
- **Spacing**: 4px base unit, defined panel/tab/status bar heights
- **Component patterns**: Sidebar, tab bar, split panes, diff viewer, commit interface, status bar
- **Icon style**: Lucide icons, 16/20px, 1.5px stroke
- **Keyboard shortcuts**: 12 primary bindings documented
- **Accessibility**: Focus rings, ARIA labels, WCAG AA contrast, reduced-motion support

### 2. Wireframes

#### Terminal View — `docs/wireframes/terminal-view.html`
- Electron title bar with window controls
- 48px icon-only sidebar (Terminal active, Git inactive, Settings)
- Tab bar with 3 sessions: bash, node server, git log
- Project selector dropdown (top-left of tab bar)
- Split pane layout: 1 left pane (55%) + 2 stacked right panes (45%)
- 4px drag handles (vertical + horizontal) with blue hover
- Active pane blue inset border indicator
- Pane headers showing shell type + cwd + pane index
- Realistic terminal output (npm dev server, HTTP logs, git log)
- Status bar: project name, branch, session count, shortcut hints

#### Git View — `docs/wireframes/git-view.html`
- Same frame/sidebar (Git tab active with change count badge)
- 288px git panel: branch selector with fetch/push, staged files (2), unstaged files (3)
- File status badges: M (yellow), A (green) — color-coded
- Commit interface: textarea + commit button + amend toggle
- Full-width inline diff viewer with:
  - Dual gutter (old/new line numbers)
  - Word-level diff highlighting (green add, red delete backgrounds)
  - Hunk headers with @@ markers
  - Inline/Split toggle in toolbar
  - Realistic TypeScript diff content (terminal resize handler)
- Status bar: project, branch, change stats (+24/-8), contextual shortcuts

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Color base | GitHub Dark (#0d1117) | Familiar to developers, proven readability |
| Sidebar | Icon-only 48px | Maximizes terminal/diff space; tooltips for labels |
| Diff mode default | Inline | Works at all window widths; split available via toggle |
| Active pane indicator | 1px inset blue border | Subtle but clear; doesn't consume layout space |
| Tab status dots | Colored circles (green/yellow) | Quick visual scan of session health |
| Font sizes | 13px terminal, 12px diff, 13px UI | Dense but readable at typical dev monitor distances |
| Change badge on sidebar | Blue circle with count | Draws attention to pending git changes |

## Inspiration Sources
- **VSCode**: Sidebar icon nav, status bar layout, diff viewer gutters
- **Warp**: Modern terminal aesthetics, compact tab bar
- **GitKraken**: Staged/unstaged file tree, branch selector
- **Lazygit**: Keyboard-first UX, information density, shortcut hints in status bar
