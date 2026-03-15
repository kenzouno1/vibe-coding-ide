# Phase 3: UI — Branch Bar (Switch/Create/Ahead-Behind)

## Priority: HIGH | Status: TODO

## Overview
Replace simple branch name display in git panel header with interactive branch bar showing ahead/behind counts, branch switcher dropdown, and create-branch input.

## Related Files
- Modify: `src/components/git-panel.tsx` (header section)
- Create: `src/components/git-branch-bar.tsx` (~120 lines)

## Design

### Branch Bar Layout
```
[branch-icon] main ▾  ↑2 ↓1  [refresh]
```
- Click branch name → dropdown with branch list + search filter + "Create branch" input at bottom
- `↑2` = ahead (commits to push), `↓1` = behind (commits to pull)
- Ahead/behind only shown when > 0
- Color: ahead=green, behind=yellow

### Branch Dropdown
```
┌─────────────────────┐
│ 🔍 Filter branches  │
├─────────────────────┤
│ ● main              │  ← current (bold, mauve dot)
│   feature/auth      │
│   fix/typo          │
├─────────────────────┤
│ + Create branch...  │  ← input appears on click
└─────────────────────┘
```

## Implementation Steps

### 1. Create `git-branch-bar.tsx`
- Props: `projectPath: string`
- Read from store: branch, ahead, behind, branches
- Fetch branches on dropdown open (lazy)
- Branch list with search filter (local filter, no debounce needed)
- Click branch → `switchBranch()` → close dropdown
- "Create branch" input at bottom → `createBranch(name, true)` → close
- Click outside → close dropdown

### 2. Update `git-panel.tsx` header
- Replace inline branch display with `<GitBranchBar projectPath={projectPath} />`
- Keep refresh button in header

## Success Criteria
- Can see ahead/behind counts at a glance
- Can switch branches from dropdown
- Can create new branch with auto-checkout
- Dropdown closes on selection or outside click
- Works with 50+ branches (scrollable list)
