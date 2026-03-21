# Phase 2: Update Rust Backend for Pane-Scoped Webviews

## Context Links
- [browser_ops.rs](../../src-tauri/src/browser_ops.rs) -- Rust browser webview commands
- [plan.md](plan.md)

## Overview
- **Priority**: P1 (blocking Phase 3)
- **Status**: pending
- **Description**: Update `browser_ops.rs` to accept `pane_id` instead of `project_id` for webview label generation, enabling multiple webviews per project.

## Key Insights
- `webview_label()` hashes `project_id` to generate label like `browser-a1b2c3d4`
- All 12 Tauri commands use `project_id: String` parameter
- Webview labels must be unique across all webviews -- paneId is already unique
- Event payloads include `label` for filtering -- no change needed there
- The paneId IS the unique identifier, so label generation can just hash paneId

## Requirements

### Functional
- All commands accept `pane_id: String` instead of `project_id: String`
- `webview_label` generates unique label from pane ID
- Multiple webviews can exist simultaneously for the same project
- Event payloads continue to include `label` for frontend filtering

### Non-functional
- No new Cargo dependencies
- Keep existing security checks (URL scheme blocking)

## Related Code Files

### Files to Modify
- `src-tauri/src/browser_ops.rs` -- rename `project_id` to `pane_id` in all commands
- `src-tauri/src/lib.rs` -- no changes needed (command signatures auto-derived)

## Implementation Steps

1. **Rename `project_id` to `pane_id`** in all command function signatures (12 commands):
   - `create_browser_webview`
   - `flush_browser_logs`
   - `navigate_browser`
   - `browser_go_back`
   - `browser_go_forward`
   - `browser_reload`
   - `resize_browser_webview`
   - `show_browser_webview`
   - `hide_browser_webview`
   - `destroy_browser_webview`
   - `capture_browser_screenshot`
   - `open_browser_devtools`

2. **Update `webview_label` function** -- same hash approach, just different semantic:
   ```rust
   fn webview_label(pane_id: &str) -> String {
       let mut hasher = DefaultHasher::new();
       pane_id.hash(&mut hasher);
       format!("browser-{:x}", hasher.finish())
   }
   ```

3. **Update all `invoke("...", { projectId: ... })` calls** on the frontend side -- this is done in Phase 3 when BrowserPane is created, but note all Rust commands now expect `paneId` field.

4. **Verify event emission** -- events like `browser-navigated`, `browser-page-load`, `browser-console` still emit with `label` field. No change needed since the label is derived from the webview, not from the parameter name.

## Frontend Invocation Change

All `invoke` calls change from:
```ts
invoke("create_browser_webview", { projectId: projectPath, ... })
```
To:
```ts
invoke("create_browser_webview", { paneId: paneId, ... })
```

Note: Tauri command parameter naming is case-sensitive and uses snake_case on Rust side, camelCase on JS side. The Rust parameter `pane_id: String` maps to JS `paneId`.

## Todo List
- [ ] Rename `project_id` to `pane_id` in all 12 command signatures
- [ ] Update `webview_label` function comment (semantic change only)
- [ ] Verify `write_screenshot` command -- uses `project_path` for file save location, NOT webview ID. This stays unchanged since it writes to project directory.
- [ ] Compile and verify no errors

## Success Criteria
- `cargo build` succeeds
- All commands accept `pane_id` parameter
- Multiple webviews with different pane IDs can coexist

## Risk Assessment
- **Low risk**: Pure rename, no logic change
- **`write_screenshot`**: This command uses `project_path` for filesystem path -- it should NOT be renamed. It's independent of the webview identity. BrowserPane will need to pass both `paneId` (for webview ops) and `projectPath` (for file saves).
- **`forward_browser_selection` / `forward_console_log`**: These extract label from the calling webview, not from a parameter. No change needed.
