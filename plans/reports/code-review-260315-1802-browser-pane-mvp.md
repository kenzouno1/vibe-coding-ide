# Code Review: Embedded Browser Pane MVP

**Date:** 2026-03-15 | **Reviewer:** code-reviewer | **Focus:** New feature review

## Scope

- **Files reviewed:** 10 (4 new, 6 modified)
- **LOC added:** ~350
- **Focus areas:** Tauri v2 multi-webview correctness, memory leaks, race conditions, state isolation, security

## Overall Assessment

Solid MVP implementation. Architecture is clean: lazy webview creation, show/hide toggling, ResizeObserver-based positioning. Follows existing codebase patterns well (Zustand stores, memo components, Catppuccin theming). However, several issues need attention before merge.

---

## Critical Issues

### C1. Missing browser cleanup on tab close (Memory Leak / Resource Leak)

**File:** `src/stores/project-store.ts` lines 148-151

`closeTab()` calls `removeProject()` on pane, git, and editor stores but does NOT clean up browser state. The native webview is never destroyed, and `browser-store` state is never removed.

**Impact:** Each closed project tab leaks a hidden native webview process. Over time this exhausts system resources.

**Fix:** Add to `closeTab()`:
```typescript
// After line 151:
import { invoke } from "@tauri-apps/api/core";
useBrowserStore.getState().removeProject(path); // need to add this method
invoke("destroy_browser_webview", { projectId: path }).catch(() => {});
```

Also add `removeProject` to `browser-store.ts`:
```typescript
removeProject: (projectPath) =>
  set((s) => {
    const { [projectPath]: _, ...rest } = s.states;
    return { states: rest };
  }),
```

### C2. Event listeners not filtered by project - cross-project event bleed

**File:** `src/components/browser-view.tsx` lines 104-140

The `listen()` calls for `browser-navigated`, `browser-page-load`, `browser-title-changed` receive ALL events from ALL browser webviews but blindly apply them to the current `projectPath`. There is no filtering by `event.payload.label`.

**Impact:** If two projects have browser webviews, navigation in project A updates the URL bar of project B.

**Fix:** Filter by label in each listener:
```typescript
listen<{ label: string; url: string }>("browser-navigated", (event) => {
  const expectedLabel = `browser-${hashProjectId(projectPath)}`;
  if (event.payload.label !== expectedLabel) return;
  setUrl(projectPath, event.payload.url);
}),
```

Since the label hash is generated in Rust, either expose a command to get the label, or replicate the hash on the frontend, or (simpler) include `projectId` in the Rust event payload instead of the hashed label.

---

## High Priority

### H1. Race condition: double webview creation

**File:** `src/components/browser-view.tsx` lines 52-69

The creation guard uses `browserState.webviewCreated` from Zustand, but `invoke("create_browser_webview")` is async. If the user rapidly toggles to browser view, two `invoke` calls can fire before `markWebviewCreated` runs. The Rust side has an existence check (`get_webview`), so it won't crash, but the `.then()` on the second call would redundantly mark creation.

**Fix:** Use a ref-based guard:
```typescript
const creatingRef = useRef(false);
// In useEffect:
if (creatingRef.current || browserState.webviewCreated) return;
creatingRef.current = true;
invoke("create_browser_webview", {...})
  .then(() => markWebviewCreated(projectPath))
  .catch(err => { creatingRef.current = false; console.error(...); });
```

### H2. `on_page_load` uses `webview.emit()` instead of `app.emit()` - events may not reach main webview

**File:** `src-tauri/src/browser_ops.rs` line 82

`on_navigation` (line 68) and `on_document_title_changed` (line 92) use `app.emit()` (global emit). But `on_page_load` (line 82) uses `webview.emit()` which emits to the child browser webview itself, not the main React webview. The React frontend listens via `listen()` on the main webview, so these events may never arrive.

**Impact:** `isLoading` state never updates. Loading spinner never shows/hides.

**Fix:** Change line 82 from `webview.emit(` to use a cloned app handle:
```rust
let app_for_load = app.clone();
// ...
.on_page_load(move |_webview, payload| {
    let _ = app_for_load.emit("browser-page-load", ...);
})
```

### H3. URL input not synced when store URL changes from navigation events

**File:** `src/components/browser-url-bar.tsx` line 13

`inputValue` is initialized from `browserState.url` via `useState`, but never updated when `browserState.url` changes (e.g., user clicks a link inside the webview). The URL bar will show stale text.

**Fix:** Add a sync effect:
```typescript
useEffect(() => {
  setInputValue(browserState.url);
}, [browserState.url]);
```

### H4. No `canGoBack`/`canGoForward` state updates

The store has `canGoBack`/`canGoForward` fields and `setNavState`, but nothing ever calls `setNavState`. The back/forward buttons will always be disabled (initial state is `false`).

**Impact:** Users cannot use back/forward buttons even after navigation.

**Note:** Tauri v2's webview API does not expose `canGoBack`/`canGoForward` events natively. Options:
1. Remove the disabled state and always enable the buttons (simplest for MVP)
2. Track navigation history manually in the store
3. Use `webview.eval()` to query `history.length` after navigation events

---

## Medium Priority

### M1. Hash collision risk in webview labels

**File:** `src-tauri/src/browser_ops.rs` lines 7-11

`DefaultHasher` produces 64-bit hashes. While collision probability is astronomically low for typical usage, using a truncated hex of a non-cryptographic hash is fragile. More importantly, `DefaultHasher` is not guaranteed stable across Rust versions.

**Recommendation for post-MVP:** Use a deterministic hash (e.g., FNV or a simple slug of the path).

### M2. No URL validation/sanitization

**File:** `src/components/browser-url-bar.tsx` lines 17-26, `src-tauri/src/browser_ops.rs` lines 23-33

URLs are parsed but not validated for security. `file://`, `javascript:`, and other dangerous schemes are allowed. The Rust `on_navigation` callback returns `true` unconditionally (line 75).

**Recommendation:**
```rust
.on_navigation(move |nav_url| {
    let scheme = nav_url.scheme();
    if scheme == "javascript" || scheme == "file" || scheme == "data" {
        return false; // block dangerous schemes
    }
    // ... emit event
    true
})
```

### M3. Resize debounce is very short (50ms)

**File:** `src/components/browser-view.tsx` line 93

50ms debounce on ResizeObserver may cause excessive IPC calls during window resize. Consider 100-150ms.

---

## Low Priority

### L1. Empty catch blocks in browser-view.tsx

Lines 47, 79, 81 - silent error swallowing. At minimum log to console for debuggability.

### L2. `SshPanel` view missing from app.tsx `openTabs.map` loop

`SshPanel` is rendered outside the per-project loop (correct, it's connection-based), but `BrowserView` is inside. This is correct for the browser use case. Just noting the architectural difference is intentional.

---

## Edge Cases Found by Scout

1. **Tab close without webview cleanup** - confirmed as C1 above
2. **Cross-project event routing** - confirmed as C2 above
3. **`webview.emit` vs `app.emit` scoping** - confirmed as H2 above
4. **Window minimize/restore** - webview position may desync; ResizeObserver should handle this but worth testing
5. **Multiple rapid view switches** - creation race condition confirmed as H1
6. **DPI/scale changes** - `LogicalPosition`/`LogicalSize` used correctly, should handle this

---

## Positive Observations

- Clean separation: Rust handles webview lifecycle, React handles UI state
- Lazy creation pattern avoids wasted resources for unused browser views
- `memo()` on BrowserView prevents unnecessary re-renders
- ResizeObserver approach is correct for tracking container bounds
- Show/hide pattern avoids costly create/destroy cycles on view switch
- Consistent with existing codebase patterns (store structure, component organization, styling)
- Good use of refs to avoid stale closures in ResizeObserver callback

---

## Recommended Actions (Priority Order)

1. **[C1]** Add browser cleanup to `closeTab()` and `removeProject` to browser-store
2. **[C2]** Filter events by label/projectId in browser-view listeners
3. **[H2]** Fix `on_page_load` to use `app.emit()` instead of `webview.emit()`
4. **[H3]** Sync URL input with store state via useEffect
5. **[H1]** Add ref-based guard for webview creation race
6. **[H4]** Always enable back/forward buttons for MVP (remove disabled logic)
7. **[M2]** Block dangerous URL schemes in `on_navigation`
8. **[M1]** Consider stable hash for webview labels post-MVP

---

## Metrics

| Metric | Value |
|--------|-------|
| Type Coverage | Good - TypeScript interfaces defined, props typed |
| Test Coverage | 0% - No tests (acceptable for MVP, should add for stabilization) |
| Linting Issues | Not run (no compile errors apparent) |
| Security | Medium risk - no URL scheme filtering (M2) |

---

## Unresolved Questions

1. Should `destroy_browser_webview` also be called in `removeProject` (store action) in addition to `closeTab`? Currently `removeProject` only updates the project list, not tabs.
2. Is there a plan for DevTools integration (opening browser DevTools for the embedded webview)? Tauri v2 supports `open_devtools()` on webviews.
3. Should browser state persist across app restarts (like tabs do via localStorage)?
