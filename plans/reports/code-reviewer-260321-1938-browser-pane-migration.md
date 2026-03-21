# Code Review: Browser Sidebar Tab to Workspace Pane Migration

**Date**: 2026-03-21 19:38
**Reviewer**: code-reviewer
**Scope**: 19 files, ~775 LOC changed (302 added, 473 removed)

## Overall Assessment

Solid migration. The re-keying from `projectPath` to `paneId` is consistent, the pane lifecycle (create/show/hide/destroy) is well-structured, and TypeScript compiles clean. Event filtering by `paneId` in `browser-pane.tsx` is correct for all events emitted from `create_browser_webview`. A few real issues found, mostly around event routing gaps in legacy IPC commands and a double-destroy race.

---

## Critical Issues

None.

---

## High Priority

### H1. `forward_console_log` and `forward_browser_selection` emit events WITHOUT `paneId`

**File**: `src-tauri/src/browser_ops.rs` lines 185-201, 376-396

Both commands emit `"browser-console"` and `"browser-selection"` events with only `"label"` -- no `"paneId"` field. The frontend filters on `event.payload.paneId` (browser-pane.tsx lines 137, 165, 178), so these events will **never match** any browser pane.

- `forward_console_log`: Console logs forwarded via this command path (direct IPC from child webview) will be silently dropped. The polling path (`flush_browser_logs` -> `on_document_title_changed`) does include `paneId`, so this only affects the IPC path, which external pages can't use anyway. **Low practical impact** but still incorrect.
- `forward_browser_selection`: Selection events via this command path will be silently dropped. The `on_document_title_changed` path includes `paneId` and is the one actually used. **Low practical impact** for same reason.

**Fix**: Add `paneId` to both emit payloads by reverse-looking up the pane_id from webview label, or accept these commands are dead code paths for external pages and add a comment explaining why.

### H2. `receive_browser_screenshot` emits globally without `paneId`

**File**: `src-tauri/src/browser_ops.rs` line 590
**File**: `src/components/browser-pane.tsx` lines 187-191

`receive_browser_screenshot` emits `"browser-screenshot-captured"` without a `paneId`. The frontend listener only checks `activeTabRef.current !== projectPath` but does NOT filter by paneId. If multiple browser panes exist across different project tabs, the screenshot will be delivered to the correct project tab but to **all** browser panes for that project.

**Fix**: Pass `pane_id` to `receive_browser_screenshot` or have the capture command set a pending paneId that gets included in the response event.

### H3. Double destroy on pane close via Ctrl+W

**File**: `src/hooks/use-keyboard-shortcuts.ts` lines 150-153
**File**: `src/components/browser-pane.tsx` lines 197-202
**File**: `src/stores/browser-store.ts` lines 179-184

When closing a browser pane via Ctrl+W, the flow is:
1. `useBrowserStore.getState().removePaneState(activeId)` -- calls `invoke("destroy_browser_webview")`
2. `closePane(project, activeId)` -- removes from pane tree
3. React unmounts `BrowserPane` -- cleanup effect calls `invoke("destroy_browser_webview")` again

The Rust `destroy_browser_webview` handles this gracefully (checks if webview exists first), so no crash. But it's two unnecessary IPC calls. Same issue in `removePanesForProject` during tab close (project-store.ts lines 165-167) followed by unmount.

**Fix**: Either remove the unmount destroy (rely on explicit cleanup) or remove the destroy from `removePaneState` (rely on unmount). Recommend keeping the unmount destroy as the safety net and removing from `removePaneState` since `closePane` already triggers unmount which destroys.

---

## Medium Priority

### M1. `useServerDetect` listens to ALL pty-output events globally

**File**: `src/hooks/use-server-detect.ts` lines 22-43

Every `BrowserPane` instance registers a listener on `"pty-output"` that receives output from **all** terminal panes across all projects. With multiple browser panes, each one independently processes the same output. If a URL is detected and browser is on `about:blank`, multiple browser panes will navigate simultaneously to the same URL.

Mitigated by: `detectedRef` prevents duplicate navigations within a single pane, and the `about:blank` check prevents already-navigated panes from re-navigating. But the first detection will still navigate ALL blank browser panes.

**Fix**: Filter `pty-output` by matching the PTY session to the same project. Or accept this as "feature" behavior (all blank browsers in the project pick up the first detected server).

### M2. `layoutMode: "float" | "pinned"` modes partially orphaned

**File**: `src/stores/browser-store.ts` lines 33-38

The `BrowserState` still has `layoutMode`, `floatX/Y`, `floatWidth/Height` fields. `toggleLayoutMode` and `togglePinMode` are implemented. `browser-url-bar.tsx` exposes the pin toggle button. But the float mode no longer has UI to resize/reposition the floating window (the old `browser-view.tsx` had drag/resize handlers that were deleted). Pin mode shows the webview but there's no visual indicator it's pinned beyond the button highlight.

No immediate breakage but floating mode is inaccessible. Either add float UI to `BrowserPane` or remove the float/pin state to reduce dead code.

### M3. Missing `getAiPtySessionId` from `sendToTerminal` deps in console panel

**File**: `src/components/browser-console-panel.tsx` line 111

`sendToTerminal` callback calls `getAiPtySessionId(projectPath)` but the dependency array only includes `[projectPath, getActivePtySessionId]`. Missing `getAiPtySessionId`. Zustand selectors are stable references so this won't cause bugs in practice, but it's technically an incorrect deps array.

---

## Low Priority

### L1. Hash collision risk in `webview_label`

**File**: `src-tauri/src/browser_ops.rs` lines 8-12

Uses `DefaultHasher` to hash pane IDs. Pane IDs are sequential (`pane-1`, `pane-2`, ...) so collisions are astronomically unlikely in practice. Not a real concern.

### L2. Console bridge script `__DEVTOOLS_FLUSH_` prefix includes counter

The `CONSOLE_BRIDGE_SCRIPT` and `flush_browser_logs` use document title signaling. The title change handler uses `starts_with("__DEVTOOLS_FLUSH_")` which correctly matches the pattern with counter appended. No issue, just noting the mechanism is well-designed.

---

## Edge Cases Verified

| Scenario | Status | Notes |
|----------|--------|-------|
| Multiple browser panes in one project | OK | Each gets own `paneId`, own store entry, own webview label |
| Close single browser pane (Ctrl+W) | OK | Cleans up browser store + pane tree + unmount destroys webview (double-destroy is harmless) |
| Close project tab | OK | `closeTab` walks leaf IDs, collects browser pane IDs, calls `removePanesForProject`, then `removeProject` |
| Switch views (terminal -> git -> back) | OK | show/hide based on `isVisible`, `ResizeObserver` gated by view check |
| Pinned browser visible across views | OK | `isPinned` check in show/hide effect skips hide |
| Webview creation race (double mount) | OK | `creatingRef` guard prevents concurrent creates |
| Event cleanup on unmount | OK | All listeners properly unsubscribed via returned cleanup functions |
| `about:blank` scheme not blocked | OK | `on_navigation` blocks `javascript:`, `data:`, `file:` but allows `about:` |

---

## Positive Observations

- Clean separation: `BrowserPane` owns the webview lifecycle, `BrowserUrlBar` handles navigation UI, store is pure state
- `webview_label` hashing avoids Tauri label conflicts across panes
- `creatingRef` prevents double-create race conditions
- ResizeObserver properly debounced at 50ms
- Event filtering by `paneId` in all browser-pane listeners is consistent
- Tab close cleanup in `project-store.ts` is thorough -- walks all leaves, dispatches to correct store
- TypeScript compiles with no errors

---

## Recommended Actions

1. **H1/H2** (event routing): Add `paneId` to `forward_console_log`, `forward_browser_selection`, and `receive_browser_screenshot` events -- or add comments documenting they are unused code paths. Medium effort, prevents future confusion.
2. **H3** (double destroy): Remove `invoke("destroy_browser_webview")` from `removePaneState` since unmount already handles it. Low effort.
3. **M2** (dead float code): Remove `layoutMode: "float"` and related float position/size state. Keep `"pinned"` only if the pin feature is staying. Low effort cleanup.
4. **M1** (server detect): Consider acceptable behavior -- all blank browsers navigating to first detected server may be intentional UX.

---

## Metrics

- **Type Coverage**: Full -- `PaneType` union updated, `AppView` no longer includes `"browser"`, all props correctly typed
- **TypeScript Errors**: 0
- **Linting Issues**: 0 (compilation clean)

## Unresolved Questions

1. Are `forward_console_log` and `forward_browser_selection` actually called from anywhere? External pages can't invoke Tauri commands, so these may be dead code. If so, consider removing them to reduce surface area.
2. Is the float layout mode intended to return in a future iteration? If not, the `floatX/Y/Width/Height` fields and `toggleLayoutMode` are dead weight.
