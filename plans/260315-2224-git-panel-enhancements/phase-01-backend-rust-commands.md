# Phase 1: Backend — New Rust Git Commands

## Priority: HIGH | Status: TODO

## Overview
Add Tauri commands for ahead/behind counts, branch list/switch/create, push, pull, and tag list/create/delete.

## Related Files
- Modify: `src-tauri/src/git_ops.rs`, `src-tauri/src/lib.rs`

## Implementation Steps

### 1. `git_ahead_behind(cwd) -> { ahead: u32, behind: u32 }`
```rust
// git rev-list --count --left-right @{upstream}...HEAD
// Returns "3\t5" → behind=3, ahead=5
// If no upstream, return { ahead: 0, behind: 0 }
```

### 2. `git_branches(cwd) -> Vec<BranchInfo>`
```rust
// git branch -a --format="%(refname:short)\t%(upstream:short)\t%(HEAD)"
// Parse into: { name, upstream, is_current }
```

### 3. `git_switch_branch(cwd, name) -> ()`
```rust
// git switch <name>
```

### 4. `git_create_branch(cwd, name, checkout: bool) -> ()`
```rust
// git branch <name> OR git switch -c <name>
```

### 5. `git_push(cwd, set_upstream: bool) -> String`
```rust
// git push [--set-upstream origin <branch>]
```

### 6. `git_pull(cwd) -> String`
```rust
// git pull
```

### 7. `git_tags(cwd) -> Vec<String>`
```rust
// git tag --list --sort=-creatordate
```

### 8. `git_create_tag(cwd, name, message: Option<String>) -> ()`
```rust
// git tag <name> OR git tag -a <name> -m <message>
```

### 9. `git_delete_tag(cwd, name) -> ()`
```rust
// git tag -d <name>
```

### 10. Register all commands in `lib.rs` invoke_handler

## Success Criteria
- All commands callable from frontend via `invoke()`
- Error messages propagated cleanly
- No panics on edge cases (detached HEAD, no upstream, etc.)
