# Phase 1: Pane Type System

## Context
- [pane-store.ts](../../src/stores/pane-store.ts) — current pane tree (leaf = terminal only)
- [split-pane-container.tsx](../../src/components/split-pane-container.tsx) — renders pane tree, portals TerminalPane

## Overview
- **Priority**: High (foundation for all other phases)
- **Status**: Pending

## Key Insight
Currently all leaf panes are implicitly terminal panes. We need to add a `paneType` discriminator to leaf nodes so the split container can render either a TerminalPane or ClaudeChatPane.

## Requirements

### Functional
- Leaf nodes track their type: `"terminal"` | `"claude"`
- When splitting a pane, user can choose the type for the new pane
- Default split creates same type as source pane (terminal → terminal)
- A context menu or UI affordance allows choosing pane type on split

### Non-Functional
- Backward compatible — existing pane trees default to `"terminal"`
- No performance impact on current terminal panes

## Architecture

### PaneStore changes
```typescript
// LeafNode gets paneType field
interface LeafNode {
  type: "leaf";
  id: string;
  paneType: "terminal" | "claude";  // NEW — default "terminal"
}

// split() accepts optional paneType parameter
split: (projectPath: string, targetId: string, direction: SplitDirection, paneType?: "terminal" | "claude") => void;
```

### SplitPaneContainer changes
```typescript
// Render different component based on paneType
{leafIds.map((id) => {
  const paneType = getPaneType(tree, id); // walk tree to find leaf
  return createPortal(
    paneType === "claude"
      ? <ClaudeChatPane key={id} projectPath={projectPath} paneId={id} ... />
      : <TerminalPane key={id} projectPath={projectPath} paneId={id} ... />,
    container,
  );
})}
```

## Related Code Files
- **Modify**: `src/stores/pane-store.ts` — add paneType to LeafNode, update split()
- **Modify**: `src/components/split-pane-container.tsx` — render by paneType
- **Create**: (none yet — ClaudeChatPane placeholder comes in Phase 4)

## Implementation Steps
1. Add `paneType: "terminal" | "claude"` to `LeafNode` interface in pane-store.ts
2. Update `createDefaultTree()` to set `paneType: "terminal"`
3. Update `split()` to accept optional `paneType` param, default to `"terminal"`
4. Add `getPaneType(tree, leafId)` helper to walk tree and return pane type
5. Export `PaneType` type for use by other components
6. Update `SplitPaneContainer` to check pane type and conditionally render
7. Add placeholder for ClaudeChatPane (simple div with "Claude" text) until Phase 4

## Todo
- [ ] Add paneType to LeafNode interface
- [ ] Update createDefaultTree with default paneType
- [ ] Update split() with paneType param
- [ ] Add getPaneType helper
- [ ] Update SplitPaneContainer conditional rendering
- [ ] Add placeholder ClaudeChatPane component

## Success Criteria
- Existing terminal panes work identically (no regression)
- `split(path, id, dir, "claude")` creates a pane that renders different component
- Pane type queryable from store for any leaf ID

## Risk Assessment
- **Low risk**: Additive change, backward compatible with default values
- No migration needed — existing LeafNode objects without paneType treated as "terminal"
