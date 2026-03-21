# Phase 2: Wire up pane dimension measurement

## Overview
- Priority: High
- Status: Pending
- Expose a way for UI callers to get the active pane's dimensions for auto-split

## Requirements

### Functional
1. When status bar or keyboard shortcut triggers auto-split, measure the active pane's container element dimensions
2. Pass `{ width, height }` to `splitAuto`

### Non-functional
- No new state — measure on-demand via DOM
- No new dependencies

## Architecture

### Approach: Expose container ref lookup
`split-pane-container.tsx` already maintains `containersRef` (Map of paneId → HTMLDivElement). We need to expose a way to look up a pane's container element and call `getBoundingClientRect()`.

**Option A — Store a global registry of pane containers**
Add a simple module-level `Map<string, HTMLDivElement>` that `SplitPaneContainer` populates. Any caller can import `getPaneRect(paneId)`.

This is the simplest approach — no context, no hooks, just a registry.

```typescript
// pane-containers.ts
const registry = new Map<string, HTMLDivElement>();

export function registerPaneContainer(id: string, el: HTMLDivElement) {
  registry.set(id, el);
}
export function unregisterPaneContainer(id: string) {
  registry.delete(id);
}
export function getPaneRect(id: string): DOMRect | null {
  return registry.get(id)?.getBoundingClientRect() ?? null;
}
```

## Related Code Files
- Create: `src/utils/pane-container-registry.ts`
- Modify: `src/components/split-pane-container.tsx` — register/unregister containers

## Implementation Steps
1. Create `pane-container-registry.ts` with register/unregister/getPaneRect
2. In `SplitPaneContainer`, call `registerPaneContainer` when creating containers and `unregisterPaneContainer` on cleanup

## Success Criteria
- `getPaneRect(activeId)` returns valid DOMRect when pane is mounted
- Returns null for unmounted/unknown pane IDs
