# Browser IPC & Screenshot Debug Report
**Date:** 2026-03-15
**Files changed:** `src-tauri/src/browser_ops.rs`, `src-tauri/capabilities/browser-webview.json`

---

## Issue 1: Console Capture Not Working

### Root Cause
`window.__TAURI__` (from `@tauri-apps/api/core`) is **not available** on external pages — it's populated by the npm package bundled into the main webview's JS. Child webviews loading external URLs never load this package.

However, Tauri v2 **does** inject `window.__TAURI_INTERNALS__` into all webviews (including child webviews with external URLs) via its own `initialization_script` in `manager/webview.rs`. This is the low-level IPC layer.

The bridge script was checking `window.__TAURI__` → always `undefined` on external pages → IPC call silently skipped.

### Fix
Replaced `window.__TAURI__.core.invoke(...)` with `window.__TAURI_INTERNALS__.invoke(...)` throughout `CONSOLE_BRIDGE_SCRIPT`. Extracted into a `tauriInvoke(cmd, args)` helper used by both `send()` (console relay) and the Ctrl+Shift+S selection relay.

```js
// Before (broken on external pages):
if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
  window.__TAURI__.core.invoke('forward_console_log', { ... });
}

// After (works in all webviews):
if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
  window.__TAURI_INTERNALS__.invoke('forward_console_log', { ... });
}
```

### Also Added
`src-tauri/capabilities/browser-webview.json` — capability granting remote-origin webviews (label `browser-*`) access to Tauri IPC. This is needed if/when a permissions manifest is added in the future. Currently app-level commands (no `plugin:` prefix) are not ACL-gated because no app ACL manifest exists (`has_app_acl_manifest = false` in `mod.rs:1802`), so this is forward-proofing.

---

## Issue 2: Screenshot/Annotation Not Working

### Root Cause
`capture_browser_screenshot` used the **SVG foreignObject + XMLSerializer** approach, which has fundamental limitations on external pages:
1. `XMLSerializer` can only serialize the DOM tree — not computed styles from external stylesheets
2. Canvas `drawImage(svg)` triggers a CORS taint check — any external resource (images, fonts, stylesheets) causes `canvas.toDataURL()` to throw `SecurityError: Tainted canvases may not be exported`
3. SVG foreignObject rendering is inconsistent across WebView2 versions

Result: blank or broken PNG for virtually any real external page.

Also: the fallback still used `window.__TAURI__.core.invoke` (same Issue 1 bug).

### Fix
Replaced SVG approach with **html2canvas** loaded dynamically from CDN:
- `useCORS: true` — fetches external images with CORS headers where available
- `allowTaint: false` — skips tainted resources rather than throwing
- `scale: devicePixelRatio` — correct resolution on HiDPI displays
- Falls back gracefully (sends `dataUrl: ''`) if CDN is unreachable or CSP blocks the script
- Uses `window.__TAURI_INTERNALS__.invoke` for the result relay (same fix as Issue 1)
- If `html2canvas` is already on the page (some sites include it), skips CDN load

### Limitation
html2canvas still can't capture: cross-origin iframes, CSS `backdrop-filter`, some CSS animations, WebGL canvas content. For pages that block CDN scripts via strict CSP, screenshot will silently fail (empty `dataUrl`). The frontend already handles empty `dataUrl` gracefully (no annotation opens).

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/browser_ops.rs` | Fixed `CONSOLE_BRIDGE_SCRIPT`: `__TAURI__` → `__TAURI_INTERNALS__`; replaced SVG screenshot with html2canvas |
| `src-tauri/capabilities/browser-webview.json` | New: grants remote-origin browser webviews IPC access |

## Compile Status
`cargo check` passes with 0 errors, 1 pre-existing unrelated warning (`list_sessions_info` dead code in `ssh_manager.rs`).

---

## Unresolved Questions
1. Some sites serve a strict CSP (`script-src 'self'`) that will block the CDN script injection — should there be a user-visible error message when `dataUrl` is empty rather than silently doing nothing?
2. The html2canvas CDN URL is pinned to `1.4.1` — consider bundling it as a Tauri asset served via custom protocol to avoid network dependency and CSP issues.
3. The `browser-webview.json` capability uses `"urls": ["https://**", "http://**"]` which is a broad wildcard — acceptable for a dev tool but worth noting.
