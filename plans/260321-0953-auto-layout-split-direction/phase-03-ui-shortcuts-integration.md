# Phase 3: Update keyboard shortcuts & status bar UI

## Overview
- Priority: High
- Status: Pending
- Wire auto-split and toggle-direction into keyboard shortcuts and status bar buttons

## Requirements

### Functional
1. Status bar Terminal/Claude buttons use auto-split (measure pane, pick direction)
2. `Ctrl+Shift+C` (Claude pane) uses auto-split instead of hardcoded horizontal
3. New shortcut `Ctrl+Shift+T` to toggle direction of the split containing active pane
4. Keep `Ctrl+Shift+H` and `Ctrl+Shift+V` as explicit directional splits (power users)
5. SSH view: keep explicit H/V splits (no auto needed there)

### Non-functional
- Status bar hint text updated to show toggle shortcut

## Related Code Files
- Modify: `src/hooks/use-keyboard-shortcuts.ts`
- Modify: `src/components/status-bar.tsx`

## Implementation Steps

### Keyboard shortcuts (`use-keyboard-shortcuts.ts`)
1. Import `getPaneRect` from registry and `autoDirection` from pane-store
2. Import `toggleDirection` from pane store
3. Update `Ctrl+Shift+C` handler: get rect → compute direction → split with auto direction
4. Add `Ctrl+Shift+T` handler: call `toggleDirection(project, activeId)`

### Status bar (`status-bar.tsx`)
1. Import `getPaneRect` and `autoDirection`
2. Update Terminal button onClick: measure rect → splitAuto or compute direction → split
3. Update Claude button onClick: same auto logic
4. Add toggle direction button (optional, if space allows)

## Success Criteria
- Clicking Terminal/Claude buttons in status bar splits in the optimal direction
- `Ctrl+Shift+T` toggles H↔V on the current split
- `Ctrl+Shift+H/V` still work as explicit overrides
- No regression in SSH view splitting
