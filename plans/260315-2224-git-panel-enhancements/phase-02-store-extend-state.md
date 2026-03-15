# Phase 2: Store — Extend Git State & Actions

## Priority: HIGH | Status: TODO

## Overview
Add ahead/behind, branches, tags, push/pull actions to Zustand git store.

## Related Files
- Modify: `src/stores/git-store.ts`

## Implementation Steps

### 1. Extend `ProjectGitState`
```ts
interface ProjectGitState {
  // existing...
  ahead: number;
  behind: number;
  branches: BranchInfo[];
  tags: string[];
  pushing: boolean;
  pulling: boolean;
}
```

### 2. Extend `GitStore` actions
```ts
// Fetch ahead/behind during refresh() — add to existing refresh flow
// fetchBranches(projectPath) — call git_branches
// switchBranch(projectPath, name) — call git_switch_branch, then refresh
// createBranch(projectPath, name, checkout) — call git_create_branch, then refresh
// push(projectPath) — call git_push, then refresh
// pull(projectPath) — call git_pull, then refresh
// fetchTags(projectPath) — call git_tags
// createTag(projectPath, name, message?) — call git_create_tag, then fetchTags
// deleteTag(projectPath, name) — call git_delete_tag, then fetchTags
```

### 3. Update `refresh()` to also fetch ahead/behind
- Call `git_ahead_behind` in parallel with existing `git_status`
- Silently ignore errors (no upstream = 0/0)

### 4. Update DEFAULT_STATE
- `ahead: 0, behind: 0, branches: [], tags: [], pushing: false, pulling: false`

## Success Criteria
- Store exposes all new state and actions
- Refresh cycle includes ahead/behind
- Push/pull have loading states
