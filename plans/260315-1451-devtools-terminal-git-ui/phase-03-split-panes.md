# Phase 3: Split Pane Manager

## Priority: High
## Status: Pending

## Overview
Binary tree-based split pane layout for terminal instances.

## Architecture
- Binary tree: each node = pane or split (horizontal/vertical)
- Leaf nodes = terminal instances
- Drag handles for resizing

## Files
- `components/split-pane-container.tsx` — recursive layout renderer
- `components/split-handle.tsx` — draggable resize handle
- `stores/pane-store.ts` — Zustand store for pane tree state

## Steps
1. Define PaneNode type (leaf | split with direction + ratio)
2. Create Zustand store with split/close/resize actions
3. Build recursive SplitPaneContainer component
4. Add drag handle with mouse event handlers
5. Wire split/close to keyboard shortcuts
6. Each leaf renders a TerminalPane

## Success Criteria
- Split horizontally/vertically
- Drag to resize
- Close pane
- Active pane indicator
- Min pane size enforced
