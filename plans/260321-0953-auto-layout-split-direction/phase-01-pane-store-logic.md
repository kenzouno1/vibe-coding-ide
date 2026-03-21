# Phase 1: Add auto-split logic + toggleDirection to pane-store

## Overview
- Priority: High
- Status: Pending
- Add `splitAuto` and `toggleDirection` actions to the pane store

## Requirements

### Functional
1. `splitAuto(projectPath, targetId, paneType, rect)` — split using auto-detected direction based on `rect` dimensions
2. `toggleDirection(projectPath, leafId)` — find the parent SplitNode of a leaf and flip its direction (H↔V)
3. Export a pure helper `autoDirection(width, height): SplitDirection` for reuse

### Non-functional
- No breaking changes to existing `split()` API
- Keep store under 200 lines

## Architecture

### autoDirection helper
```typescript
export function autoDirection(width: number, height: number): SplitDirection {
  return width >= height ? "horizontal" : "vertical";
}
```

### splitAuto action
```typescript
splitAuto: (projectPath, targetId, paneType, rect) => {
  const direction = autoDirection(rect.width, rect.height);
  get().split(projectPath, targetId, direction, paneType);
}
```

### toggleDirection action
Walk tree to find the parent SplitNode containing `leafId`, then flip its direction.

```typescript
toggleDirection: (projectPath, leafId) => set(s => {
  const tree = s.trees[projectPath];
  if (!tree) return s;
  const parentId = findParentSplit(tree, leafId);
  if (!parentId) return s;
  const newRoot = replaceNode(tree, parentId, node => {
    if (node.type === 'split') {
      return { ...node, direction: node.direction === 'horizontal' ? 'vertical' : 'horizontal' };
    }
    return node;
  });
  return { trees: { ...s.trees, [projectPath]: newRoot || tree } };
});
```

## Related Code Files
- Modify: `src/stores/pane-store.ts`

## Implementation Steps
1. Add `autoDirection()` pure helper function
2. Add `findParentSplit()` tree helper
3. Add `splitAuto` action to store interface and implementation
4. Add `toggleDirection` action to store interface and implementation

## Success Criteria
- `autoDirection(800, 400)` returns `"horizontal"`
- `autoDirection(400, 800)` returns `"vertical"`
- `toggleDirection` flips a split node's direction
- Existing `split()` still works unchanged
