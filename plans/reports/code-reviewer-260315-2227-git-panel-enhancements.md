# Code Review: Git Panel Enhancements

**Date:** 2026-03-15
**Reviewer:** code-reviewer
**Focus:** Git branch/tag management, push/pull, ahead/behind tracking

## Scope

| File | LOC | Type |
|------|-----|------|
| `src-tauri/src/git_ops.rs` | 266 | Rust backend |
| `src-tauri/src/lib.rs` | 134 | Command registration |
| `src/stores/git-store.ts` | 223 | Zustand store |
| `src/components/git-branch-bar.tsx` | 155 | New component |
| `src/components/git-tag-popover.tsx` | 130 | New component |
| `src/components/git-panel.tsx` | 262 | Updated component |
| `src/components/commit-box.tsx` | 87 | Updated component |

## Overall Assessment

Solid feature addition. Clean separation between Rust backend and React frontend. Correct use of Zustand per-project state pattern. A few security and robustness issues need attention.

---

## Critical Issues

### 1. SECURITY: No input validation on branch/tag names (Rust)

`git_create_branch`, `git_create_tag`, `git_switch_branch` pass user input directly as git CLI args. While `std::process::Command` does NOT invoke a shell (so classic shell injection is mitigated), malicious branch names starting with `-` can be interpreted as git flags.

**Example attack:** User creates branch named `--upload-pack=malicious` or `-c core.sshCommand=evil`.

**Fix:** Validate names or prefix with `--`:
```rust
// In git_switch_branch, git_create_branch, git_create_tag:
if name.starts_with('-') {
    return Err("Name cannot start with '-'".into());
}
```

**Severity:** Critical -- flag injection can alter git behavior.

### 2. SECURITY: `git_delete_tag` same flag injection risk

Same issue. A tag named `-f` or `--force` could cause unexpected behavior.

**Fix:** Same validation as above.

---

## High Priority

### 3. Push upstream detection logic is fragile (git-store.ts:184-188)

```ts
const hasUpstream = state.branches.some(
  (b) => !b.is_remote && b.is_current && state.branches.some(
    (r) => r.is_remote && r.name === `origin/${state.branch}`
  ),
);
```

Problems:
- `state.branches` may be stale/empty if `fetchBranches` was never called
- Assumes remote is always `origin`
- Nested `.some()` inside `.some()` -- O(n^2) but minor

**Fix:** Query upstream directly in Rust:
```rust
fn has_upstream(cwd: &str) -> bool {
    git(&["rev-parse", "--abbrev-ref", "@{upstream}"], cwd).is_ok()
}
```
Then expose as a field on `AheadBehind` or a separate command.

### 4. Detached HEAD not handled

`git branch --show-current` returns empty string in detached HEAD state. The branch bar shows "No branch" text but:
- `git_push` with `set_upstream` will use empty branch name: `git push --set-upstream origin ""` -- this will error confusingly
- `git_switch_branch` will work but user has no way back to detached HEAD

**Fix:** In `git_push`, check for empty branch:
```rust
let branch = branch.trim();
if branch.is_empty() {
    return Err("Cannot push: detached HEAD state".into());
}
```

### 5. Missing error handling on `switchBranch` and `createBranch` (git-store.ts)

Both throw unhandled if dirty working tree prevents switch. User gets no feedback.

**Fix:** Wrap in try/catch, surface error to UI (toast or inline message).

### 6. `commit` action doesn't handle errors (git-store.ts:141-153)

If `git_commit` invoke fails, `commitMessage` is still cleared (line 146-151 runs before the await on line 152... actually no, the `set` is before `refresh` but after `invoke`). Wait -- re-reading: the `set` on line 145 is AFTER the `await invoke` on line 144, so if invoke throws, the catch is missing entirely. The commit message would be lost on retry if the component re-renders.

Actually: there IS no try/catch. If `invoke` rejects, it throws uncaught. The message in textarea persists since state wasn't updated. But the user gets no error feedback.

**Fix:** Add try/catch with error surfacing.

---

## Medium Priority

### 7. `stageFile` and `unstageFile` lack try/catch (git-store.ts:131-138)

Failures bubble as uncaught rejections.

### 8. `buildTree` rebuilds on every render (git-panel.tsx:178)

Called inside `FileSection` render without memoization. For large repos with many changes, this is wasteful.

**Fix:** Wrap in `useMemo`:
```tsx
const tree = useMemo(() => buildTree(files), [files]);
```

### 9. Polling interval is aggressive

10s polling (git-panel.tsx:31) + window focus refresh. For large repos, `git status -uall` can be slow. Consider:
- Debouncing the focus handler
- Increasing interval to 15-30s
- Using file watcher events from Tauri instead

### 10. Branch dropdown doesn't handle keyboard navigation

No arrow-key navigation, no Escape-to-close on the dropdown. Standard UX expectation for dropdowns.

### 11. Tag delete has no confirmation

One click deletes tag immediately. Accidental deletion risk.

**Fix:** Add confirmation dialog or undo mechanism.

---

## Low Priority

### 12. `git_ops.rs` file now 266 lines

Approaching the 200-line guideline. Consider splitting into `git_ops/mod.rs`, `git_ops/branch.rs`, `git_ops/tag.rs`.

### 13. Hardcoded "origin" remote

`git_push` always pushes to `origin`. Multi-remote setups won't work correctly.

### 14. Empty catch blocks (git-store.ts:167, 211)

`fetchBranches` and `fetchTags` silently swallow errors. At minimum log to console.

---

## Edge Cases Found by Scouting

1. **Detached HEAD + push** -- empty branch passed to `git push --set-upstream origin`
2. **Dirty working tree + branch switch** -- unhandled error, no user feedback
3. **No remote configured** -- `git_pull` and `git_push` will fail without clear messaging
4. **Branch name with `/`** -- `is_remote` detection uses `name.contains('/')` but local branches can contain `/` (e.g., `feature/foo`). This incorrectly classifies them as remote.
5. **Race condition** -- rapid push/pull clicks. Buttons disable during operation (good), but `refresh()` in `finally` could overlap with polling interval refresh.
6. **Large tag/branch lists** -- no pagination or virtual scrolling; max-h containers mitigate but DOM could get heavy with 100+ branches.

---

## Positive Observations

- Clean per-project state isolation in Zustand store
- `updateProjectState` helper avoids repetitive spread patterns
- Proper cleanup of event listeners in useEffect
- `Command::new("git")` avoids shell injection (no `sh -c`)
- Parallel fetch of status + ahead/behind in `refresh()`
- Good Catppuccin theme consistency across all new components
- Tree view for file list is well-implemented with collapse state

---

## Recommended Actions (Priority Order)

1. **[Critical]** Add `-` prefix validation on all name inputs in Rust commands
2. **[High]** Handle detached HEAD in `git_push`
3. **[High]** Fix `is_remote` detection -- use `refname:short` with explicit origin prefix check, not generic `/` contains
4. **[High]** Add try/catch + error feedback for `switchBranch`, `createBranch`, `commit`
5. **[High]** Query upstream status from git directly instead of branch list heuristic
6. **[Medium]** Add confirmation for tag deletion
7. **[Medium]** Memoize `buildTree` call
8. **[Low]** Split `git_ops.rs` as it grows

## Metrics

- Type Coverage: Good -- all interfaces typed, proper generics on invoke calls
- Test Coverage: Unknown -- no tests visible for new commands
- Linting Issues: Not run (not requested)

## Unresolved Questions

1. Should push/pull errors be shown as toasts or inline in the commit box?
2. Is there a plan for remote branch checkout (tracking branch creation)?
3. Should branch/tag operations be disabled during detached HEAD state?
