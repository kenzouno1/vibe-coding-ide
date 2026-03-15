# Phase 4: Clean Up & Test

## Priority: Medium | Status: ✅ | Depends: Phase 1, 2, 3

## Overview
Remove dead code, update keyboard shortcuts hints, verify build, manual test.

## Related Code Files

### Delete
- `src/components/project-selector.tsx` — replaced by tab bar

### Modify
- `src/stores/project-store.ts` — remove `showPicker` state
- `src/components/status-bar.tsx` — update shortcut hints (add tab shortcuts)
- `src/hooks/use-keyboard-shortcuts.ts` — add Ctrl+Tab (next tab), Ctrl+W (close tab)

## Implementation Steps

### 1. Remove `project-selector.tsx`
- Delete file
- Remove import from `status-bar.tsx`

### 2. Add tab keyboard shortcuts
- `Ctrl+Tab` / `Ctrl+Shift+Tab`: next/prev tab
- `Ctrl+W`: close current tab (if >1 tab open)
- Update status bar hints

### 3. Build verification
- Run `tsc` — no type errors
- Run `vite build` — clean build
- Manual test: open 2+ projects, switch tabs, verify terminals work

### 4. Update design-guidelines.md
- Document tab bar shortcuts
- Update status bar description

## Todo List
- [ ] Delete project-selector.tsx
- [ ] Clean up unused imports/state
- [ ] Add tab navigation keyboard shortcuts
- [ ] Update status bar shortcut hints
- [ ] Run tsc + vite build
- [ ] Manual smoke test

## Success Criteria
- Clean build with no type errors
- No unused imports/dead code
- Tab shortcuts work
- Design guidelines updated
