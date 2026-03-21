# Auto Layout Split Direction

## Overview
When adding a new panel, auto-detect the optimal split direction (horizontal vs vertical) based on the active pane's dimensions. Also allow toggling an existing split's direction.

## Current Behavior
- `Ctrl+Shift+H` → horizontal split (side-by-side)
- `Ctrl+Shift+V` → vertical split (top-bottom)
- `Ctrl+Shift+C` → Claude pane (always horizontal)
- Status bar buttons → always horizontal
- No way to toggle existing split direction

## Target Behavior
- New "auto" split option: measures active pane, picks horizontal if wider than tall, vertical otherwise
- Status bar buttons use auto-layout by default
- `Ctrl+Shift+C` uses auto-layout
- New `toggleDirection` action to flip H↔V on the parent split node
- Keyboard shortcut `Ctrl+Shift+T` to toggle direction of the split containing active pane

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Add auto-split logic + toggleDirection to pane-store | Pending |
| 2 | Wire up pane dimension measurement | Pending |
| 3 | Update keyboard shortcuts & status bar UI | Pending |

## Key Design Decisions
- **Dimension measurement**: Use the portal container element's `getBoundingClientRect()` — already available via `containersRef` in `split-pane-container.tsx`
- **Auto-split algorithm**: `width >= height → horizontal`, else `vertical`. Simple aspect-ratio heuristic.
- **No new dependencies**: Pure DOM measurement, no ResizeObserver needed for this
- **Toggle scope**: Toggle the nearest parent SplitNode of the active leaf
