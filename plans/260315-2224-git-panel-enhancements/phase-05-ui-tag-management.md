# Phase 5: UI — Tag Management

## Priority: MEDIUM | Status: TODO

## Overview
Add tag popover to git panel header for viewing, creating, and deleting tags.

## Related Files
- Create: `src/components/git-tag-popover.tsx` (~100 lines)
- Modify: `src/components/git-panel.tsx` (add tag button to header)

## Design

### Header with tag button
```
[branch-icon] main ▾  ↑2 ↓1  [tag-icon] [refresh]
```

### Tag Popover
```
┌─────────────────────────┐
│ Tags                    │
├─────────────────────────┤
│ v1.2.0              [×] │
│ v1.1.0              [×] │
│ v1.0.0              [×] │
├─────────────────────────┤
│ + New tag name...  [✓]  │
│ □ Annotated  Message... │
└─────────────────────────┘
```

## Implementation Steps

### 1. Create `git-tag-popover.tsx`
- Props: `projectPath: string`
- Fetch tags on open (lazy via `fetchTags`)
- List tags sorted by creation date (newest first)
- Delete button per tag → `deleteTag(projectPath, name)`
- Create input at bottom with optional "annotated" checkbox + message
- Click outside → close

### 2. Update `git-panel.tsx` header
- Add tag icon button between branch bar and refresh button
- Toggle popover on click

## Success Criteria
- Can view all tags
- Can create lightweight and annotated tags
- Can delete tags
- Popover closes on outside click
