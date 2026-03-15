# Code Review: Phase 2 -- Console Capture Bridge

**Date**: 2026-03-15
**Reviewer**: code-reviewer
**Files**: `browser_ops.rs`, `browser-store.ts`, `browser-view.tsx`, `browser-console-panel.tsx`
**LOC**: ~290 new/modified

---

## Overall Assessment

Solid implementation with good DRY refactoring (`updateState` helper), correct FIFO eviction, and safe rendering (React text nodes = no XSS). Two critical/high issues found around event routing and log attribution.

---

## Critical Issues

### 1. CRITICAL: Console events from child webview may not reach main webview listener

**File**: `browser_ops.rs` L54, `browser-view.tsx` L159

The JS bridge calls `window.__TAURI__.event.emit('browser-console', {...})` inside the **child webview** context. However, `listen()` in `browser-view.tsx` listens on the **main webview's** event bus. Tauri's `event.emit()` from a child webview emits to that webview's own scope -- it does **not** automatically propagate to the main window's event system.

**Impact**: Console logs may never arrive in the React UI. The entire feature could be non-functional.

**Fix options**:
- A) In `browser_ops.rs`, use `.on_page_load()` (Finished event) to inject a polling mechanism or use `webview.eval()` to set up a `__TAURI_INTERNALS__` IPC call instead of `event.emit`.
- B) Use Tauri's `emitTo('main', ...)` if available in the child context, to explicitly target the main window.
- C) Register a Tauri command (Rust side) that the child webview calls, and have Rust emit the event to the main window via `app.emit()`.

**Recommended**: Option C is most reliable -- add a Rust command `forward_console_log` that takes level/message/timestamp/url/projectId and calls `app.emit("browser-console", payload)`.

### 2. HIGH: No project attribution in console events -- logs go to wrong project

**File**: `browser_ops.rs` L50-59, `browser-view.tsx` L159-162

The `browser-console` event payload contains `{ level, message, timestamp, url }` but **no `projectId` or `label`**. The listener uses `activeTabRef.current !== projectPath` as a guard, but this means:
- Logs from **background tabs are silently dropped** (permanently lost)
- If two webviews emit simultaneously, logs could be attributed to whichever project is currently active

**Fix**: Include `projectId` (or `label`) in the event payload. On the Rust side (if using option C above), pass `projectId` through. On the JS side, filter by `projectId` match instead of `activeTabRef`.

---

## High Priority

### 3. FIFO eviction creates N array copies under high log volume

**File**: `browser-store.ts` L90-92

```ts
const logs = current.consoleLogs.length >= MAX_CONSOLE_LOGS
  ? [...current.consoleLogs.slice(1), log]
  : [...current.consoleLogs, log];
```

Each `addLog` call creates a full array copy. Under rapid console output (e.g., `for` loop logging), this triggers 500-element array copies + Zustand re-renders per log.

**Impact**: UI jank during log-heavy pages.

**Fix**: Batch incoming logs with a short debounce (e.g., collect logs in a buffer, flush every 100ms). This also reduces React re-renders.

---

## Medium Priority

### 4. `getState` selector defeats Zustand memo optimization

**File**: `browser-console-panel.tsx` L71

```ts
const browserState = useBrowserStore((s) => s.getState(projectPath));
```

`getState()` returns a new object reference if the project doesn't exist yet (returns `DEFAULT_STATE` literal). Even when state exists, the selector returns the whole `BrowserState` object -- any field change (url, isLoading, title) triggers re-render of the entire console panel.

**Fix**: Select only needed fields:
```ts
const consoleLogs = useBrowserStore((s) => s.states[projectPath]?.consoleLogs ?? []);
const consoleFilter = useBrowserStore((s) => s.states[projectPath]?.consoleFilter ?? "all");
const consolePanelOpen = useBrowserStore((s) => s.states[projectPath]?.consolePanelOpen ?? true);
```

### 5. Error count/warn count computed on every render

**File**: `browser-console-panel.tsx` L88-89

Two `.filter()` calls on up to 500 logs every render. Minor but easily optimizable with `useMemo`.

---

## XSS Assessment: SAFE

React renders `log.message` as a text node via `{log.message}` in JSX (L58). React auto-escapes text content. No `dangerouslySetInnerHTML`. No XSS vector.

## FIFO Eviction: CORRECT

`MAX_CONSOLE_LOGS = 500`, `slice(1)` drops oldest. Array length capped. Memory bounded.

## Original console preserved: CORRECT

`orig[level].apply(console, args)` on L51 of the bridge script calls the original bound method before emitting. Users still see native console output.

---

## Positive Observations

- `updateState` helper eliminates repetitive spread patterns -- good DRY refactor
- Guard flag `__DEVTOOLS_BRIDGE__` prevents double-injection
- `ser()` function handles null/undefined/circular refs gracefully
- `memo()` on `ConsoleLogEntry` avoids re-rendering unchanged rows
- Auto-scroll with manual-scroll detection (isAtBottomRef) is good UX
- `window.onerror` + `unhandledrejection` coverage is thorough

---

## Recommended Actions (priority order)

1. **[CRITICAL]** Fix event routing: Add Rust command to forward console logs from child to main webview
2. **[CRITICAL]** Add `projectId` to console event payload for correct attribution
3. **[HIGH]** Batch log additions with debounce to reduce array copies + re-renders
4. **[MEDIUM]** Use granular Zustand selectors in console panel
5. **[MEDIUM]** Memoize error/warn badge counts

---

## Unresolved Questions

- Does Tauri v2's `window.__TAURI__.event.emit()` from a child webview actually reach the parent's `listen()`? Needs empirical verification. If it does work, issue #1 downgrades to non-issue but #2 (project attribution) remains critical.
