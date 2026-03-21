# Phase 1: Refactor Browser Store for Pane-Scoped State

## Context Links
- [browser-store.ts](../../src/stores/browser-store.ts) -- current store keyed by projectPath
- [pane-store.ts](../../src/stores/pane-store.ts) -- pane tree model
- [plan.md](plan.md)

## Overview
- **Priority**: P1 (blocking all subsequent phases)
- **Status**: pending
- **Description**: Change browser store keying from `projectPath` to `paneId` so multiple browser panes per project each have independent state.

## Key Insights
- Current store uses `Record<string, BrowserState>` keyed by `projectPath` -- one browser per project
- All store methods take `projectPath` as first arg -- must change to `paneId`
- The `removeProject` method calls `destroy_browser_webview` with `projectId` -- needs to accept paneId
- `useServerDetect` hook auto-navigates by `projectPath` -- must be updated to target specific pane

## Requirements

### Functional
- Store state keyed by `paneId` instead of `projectPath`
- All setter methods accept `paneId` as first parameter
- `removeProject` replaced with `removePaneState(paneId)` that destroys the correct webview
- Add `removePanesForProject(projectPath, paneIds[])` for project tab close cleanup

### Non-functional
- No breaking changes to `BrowserState` interface itself
- Keep store under 200 lines

## Related Code Files

### Files to Modify
- `src/stores/browser-store.ts` -- rekey from projectPath to paneId

### Files NOT Modified Yet (dependent phases)
- Components still pass `projectPath` -- updated in Phase 3/5

## Implementation Steps

1. **Rename all method parameters** from `projectPath` to `paneId` in the store interface
2. **Update `updateState` helper** -- same logic, just different key semantics
3. **Replace `removeProject`** with:
   ```ts
   removePaneState: (paneId: string) => void;
   ```
   That calls `destroy_browser_webview` with the paneId (Rust backend updated in Phase 2)
4. **Add bulk cleanup method**:
   ```ts
   removePanesForProject: (paneIds: string[]) => void;
   ```
   Iterates paneIds, destroys each webview and removes state
5. **Update `getState` default** -- return `DEFAULT_STATE` for unknown paneId (same behavior)

## Code Sketch

```ts
// Key change: all methods now use paneId
interface BrowserStore {
  states: Record<string, BrowserState>;  // keyed by paneId
  getState: (paneId: string) => BrowserState;
  setUrl: (paneId: string, url: string) => void;
  // ... all methods same pattern, just paneId instead of projectPath
  removePaneState: (paneId: string) => void;
  removePanesForProject: (paneIds: string[]) => void;
}
```

## Todo List
- [ ] Rename all `projectPath` params to `paneId` in store interface
- [ ] Update `updateState` helper
- [ ] Replace `removeProject` with `removePaneState`
- [ ] Add `removePanesForProject` bulk cleanup
- [ ] Verify store stays under 200 lines

## Success Criteria
- Store compiles with paneId-based keying
- No runtime errors from store operations
- `removePaneState` properly calls webview destroy

## Risk Assessment
- **Low risk**: Pure interface rename, no logic change
- **Temporarily breaks**: All components using the store -- fixed in Phase 3/5
