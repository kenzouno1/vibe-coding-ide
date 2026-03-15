# Phase 2: Add Tab Bar Component

## Priority: High | Status: ✅ | Depends: Phase 1

## Overview
Create a horizontal tab bar below TitleBar showing open project tabs. Each tab shows project name, has close button, supports reordering via click.

## Key Insights
- Design guidelines specify: Tab bar height 36px, active tab `bg-elevated` + `border-b-2 accent-blue`, "+" button at end
- Tab titles: Inter 400, 12px
- Close button appears on hover

## Related Code Files

### Create
- `src/components/tab-bar.tsx` — horizontal tab bar component

### Modify
- `src/app.tsx` — insert TabBar between TitleBar and main content

## Implementation Steps

### 1. Create `tab-bar.tsx`
```tsx
// Props: none (reads from project-store)
// Shows: one tab per openTabs entry
// Active tab: highlighted with accent
// Each tab: project displayName + close button (hover)
// "+" button: opens project picker / addProject dialog
// Click tab: setActiveTab
// Close button: closeTab (don't close if last tab)
```

Layout:
```
[Tab1 ×] [Tab2 ×] [Tab3 ×] [+]
```

- Tab width: auto (based on name), max 160px, truncate with ellipsis
- Active tab: `bg-ctp-surface0 border-b-2 border-ctp-mauve`
- Inactive: `text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0`
- Close button: `X` icon, 12px, only visible on hover, `hover:bg-ctp-surface1`
- "+" button: `Plus` icon, same height as tabs
- Overflow: horizontal scroll if many tabs, no wrapping

### 2. Update `app.tsx`
- Add `<TabBar />` between `<TitleBar />` and the main flex container
- Tab bar sits in the vertical flex layout

## Todo List
- [ ] Create `tab-bar.tsx` component
- [ ] Wire up to project-store actions (openTab, closeTab, setActiveTab, addProject)
- [ ] Insert TabBar in app.tsx layout
- [ ] Style per design guidelines (Catppuccin theme tokens)

## Success Criteria
- Tab bar renders all open projects as tabs
- Click tab switches active project (no reload)
- Close button removes tab (disabled/hidden if last tab)
- "+" button opens folder dialog to add new project
- Active tab visually distinct
