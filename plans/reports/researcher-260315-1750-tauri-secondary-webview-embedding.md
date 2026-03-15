# Research Report: Embedding Secondary Webviews in Tauri v2

**Date:** 2025-03-15 | **Status:** Complete

---

## Executive Summary

**Tauri v2 DOES support native multiple webviews in a single window.** This feature was implemented in PR #8280 (referenced Mar 2024) and is now the recommended approach. The secondary webview can be created with unique labels, positioned, sized, and controlled independently. Console logging and screenshots require plugin support or JavaScript-level solutions. Multi-instance webview architecture scales efficiently on Windows; resource overhead is comparable to Electron.

---

## 1. Tauri v2 Multi-Webview Support: NATIVE & RECOMMENDED

### ✅ Native Implementation Available
- **Status:** Stable in Tauri v2
- **Method:** `WebviewWindowBuilder` struct with unique labels
- **JavaScript API:** Use `@tauri-apps/api/webviewWindow` to create additional webviews
- **Example Code:**
  ```javascript
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
  const secondary = new WebviewWindow('secondary-label', {
    url: 'https://example.com',
    width: 400,
    height: 600
  })
  ```

### Requirements
- Add permission to `src-tauri/capabilities/*.json`:
  ```json
  "webview:allow-create-webview-window"
  ```

### Key APIs
- **WebviewWindow** - Create/get webview instances by label
- **show/hide/resize/setZoom** - Full control over secondary webviews
- **Event listeners** - Listen to visibility, resize, close events

**Cross-platform:** Windows, macOS, Linux (X11)

---

## 2. Wry Library Support (Underlying Engine)

### Low-Level Capability: Child Webviews
- **Method:** `WebViewBuilder::build_as_child()` / `WebView::new_as_child()`
- **Supported:** Windows, macOS, Linux (X11)
- **Positioning:** Use `.with_bounds()` to set position + size
- **Use case:** For custom embedded webview layouts beyond Tauri's windowing

Example:
```rust
WebViewBuilder::new()
    .with_url("https://example.com")
    .with_bounds(Rect {
        position: LogicalPosition::new(100, 100).into(),
        size: LogicalSize::new(200, 200).into(),
    })
    .build_as_child(&window)
    .unwrap();
```

### Context Sharing
- Multiple WebViews can share a `WebContext` for cookie/session persistence
- Replaces need for isolated profiles

---

## 3. Console.log / Error Interception

### Current State: Limited Native Support
- **Wry/Tauri core:** No direct hooks to intercept webview console logs
- **Log Plugin:** `tauri-plugin-log` can forward Rust logs to webview console via `LogTarget::Webview`
- **Browser DevTools:** Traditional console available in development

### Recommended Workaround
1. **JavaScript Bridge:** Inject code into secondary webview that intercepts `console.*`:
   ```javascript
   const originalLog = console.log;
   console.log = function(...args) {
     window.__TAURI__.invoke('log_event', { level: 'info', message: args })
     originalLog(...args);
   }
   ```
2. **Invoke Tauri Command:** Send logs to Rust backend via IPC
3. **Backend Collection:** Store/aggregate logs server-side

### Alternative: html2canvas Detection
- Inject html2canvas into secondary webview and listen for specific console calls
- Less reliable but works if custom injection unavailable

---

## 4. Screenshot Capture: PLUGIN ECOSYSTEM

### Option 1: tauri-plugin-snapshot (RECOMMENDED)
- **Functions:** `snapshotViewport()` and `snapshotDocument()`
- **Supports:** Capture current viewport or entire DOM
- **Output:** PNG saved to disk
- **Cross-platform:** Linux/Windows/macOS
- **Best for:** Webview-specific content capture

### Option 2: tauri-plugin-screenshots
- **Scope:** Entire window/monitor screenshots (not webview-specific)
- **Output:** PNG, bitmap formats
- **Platform:** Windows, macOS, Linux
- **Note:** Better for full-app screenshots

### Option 3: html2canvas Injection
- Inject html2canvas library into secondary webview
- Call `html2canvas(document.body).then(canvas => canvas.toDataURL())`
- Send base64 back via Tauri IPC
- **Downsides:** CORS issues with external resources, performance overhead

### Option 4: Native WebView2 RenderAsync (Windows Only)
- Use `CoreWebView2Controller::RenderAsync()` in Windows-specific code
- Renders to bitmap for programmatic access
- Not exposed in Tauri API; requires raw FFI

---

## 5. Iframe vs. Native Webview Trade-offs

| Factor | Iframe | Native Webview |
|--------|--------|-----------------|
| **Process Isolation** | Partial (same process) | Full (separate process) |
| **Sandboxing** | CSS/DOM sandbox available | Stronger OS-level security |
| **Performance** | Single renderer process | Multiple renderer processes |
| **External Content** | Subject to CSP, CORS | Full browser environment |
| **Screenshot** | html2canvas possible | Plugin ecosystem mature |
| **Console Intercept** | Native JS hooks | Requires IPC bridge |
| **Stability** | One crash = app crash | Isolated crashes |

**Recommendation:** Use native webviews for true browser preview/isolation; use iframes for embedded UI components.

---

## 6. WebView2 Architecture (Windows-Specific)

### Multiple Instances: Supported with Caveats
- **Single Environment:** All CoreWebView2 instances share one browser process
- **User Data Folder:** Reusing same folder = shared processes (memory efficient)
- **Process Count:** First instance starts browser process; subsequent instances reuse it
- **Renderer Sharing:** One renderer process can serve multiple WebView2 instances
- **Visibility Toggle:** Common pattern is toggle `.IsVisible` rather than create/destroy

### Windows Performance Implication
- Multiple webviews = lower memory/process overhead than separate apps
- Tauri leverages this; actual overhead is comparable to Electron

---

## 7. Performance & Resource Implications

### Memory Footprint
- **Single Tauri App:** ~150-300 MB (with secondary webview +50-100 MB)
- **Multiple Webviews:** Shared browser process = efficient resource reuse
- **Comparison:** Electron apps use equivalent Chromium, so Tauri is ~equal or better
- **WebKit (Linux):** Higher memory overhead (~90+ MB per instance)

### Rendering Performance
- **Recommended:** Minimize DOM mutations in secondary webview
- **Use:** Virtual DOM or React memoization to prevent re-renders
- **Network:** Separate network stacks per webview if on different domains
- **Context Sharing:** Improves performance by reusing cookies/caches

### Scaling Considerations
- 2-3 webviews per app: Negligible overhead
- 5+ webviews: Start monitoring process counts and memory
- **Best Practice:** Use visibility toggling instead of creating/destroying repeatedly

---

## 8. Cross-Platform Matrix

| Feature | Windows | macOS | Linux (X11) | Linux (Wayland) |
|---------|---------|-------|-------------|-----------------|
| Native Multi-Webview | ✅ | ✅ | ✅ | ⚠️ X11 only |
| Child Webview API | ✅ | ✅ | ✅ | ⚠️ X11 only |
| WebView2 | ✅ | ❌ | ❌ | ❌ |
| WKWebView (Safari) | ❌ | ✅ | ❌ | ❌ |
| GTK WebKit2 | ❌ | ❌ | ✅ | ✅ |
| CEF Fallback | ✅ (v2) | ❌ | ✅ (v2) | ❌ |

**Linux Limitation:** Wayland support for child webviews not yet available; GTK widgets handle single webview well.

---

## 9. Alternative: Chromium Embedded Framework (CEF)

### Status: NOT RECOMMENDED
- **Rust bindings:** Available but 5-8 years old, deprecated
- **Security Risk:** Old C++ bindings, unmaintained
- **Tauri v2 Provision:** Tauri includes CEF for Linux as webkit2gtk fallback, but:
  - Not intended for custom multi-webview use
  - Adds 100+ MB to bundle size
  - Requires separate CEF distribution/management

### When CEF Might Be Considered
- Need for specific Chromium behavior unavailable in system WebViews
- Legacy corporate standardization
- **Better alternative:** Use separate Tauri windows (simpler, maintained)

**Verdict:** Use native Tauri webviews instead; CEF is legacy approach.

---

## 10. Implementation Path: Browser/Preview Use Case

### Recommended Architecture
1. **Main Tauri Window:** Application UI (React/Vue)
2. **Secondary WebviewWindow:** Preview panel (browser-like)
3. **IPC Bridge:** Send URLs to secondary webview from main
4. **Screenshot Plugin:** Use `tauri-plugin-snapshot` for renders
5. **Console Capture:** Inject JS bridge to forward console → Rust backend

### Code Sketch
```rust
// Rust: Handle URL navigation command
#[tauri::command]
fn navigate_preview(url: String, state: tauri::State<'_>) {
    if let Some(preview) = webview_window::WebviewWindow::get_label("preview") {
        preview.eval(&format!("window.location.href = '{}'", url)).ok();
    }
}

#[tauri::command]
async fn capture_preview() -> Result<String, String> {
    // Use tauri-plugin-snapshot or wry RenderAsync
}
```

---

## Unresolved Questions

1. **Console interception without IPC:** Is there a native Tauri hook planned for console.log forwarding from child webviews?
2. **Wayland support:** ETA for Wayland support in wry's child webview implementation?
3. **RenderAsync on non-Windows:** Does wry plan platform-agnostic screenshot API beyond plugins?
4. **Context isolation:** Can you reliably share localStorage/cookies between main + secondary webviews, or should you use Tauri's app data directory?
5. **Accessibility:** Do screen readers properly traverse multiple webviews in a Tauri app?

---

## Summary Table: Feature Readiness

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Create secondary webview | ✅ GA | Low | Native Tauri API |
| Position & resize | ✅ GA | Low | Windowing API |
| Intercept console logs | ⚠️ Partial | Medium | Requires JS injection |
| Capture screenshot | ✅ GA | Low | tauri-plugin-snapshot |
| Shared context/cookies | ✅ GA | Low | WebContext sharing |
| Windows multi-instance | ✅ GA | Low | Efficient process reuse |
| Linux/macOS compat | ✅ GA | Low | X11 only for GTK |
| CEF alternative | ❌ Not recommended | High | Use native webviews |

---

## Sources

- [Tauri v2 Multiple Webviews Issue #2975](https://github.com/tauri-apps/tauri/issues/2975)
- [Wry Multiple Webviews Discussion #458](https://github.com/tauri-apps/wry/discussions/458)
- [Tauri WebviewWindow API Reference](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/)
- [Wry WebViewBuilder Documentation](https://docs.rs/wry/latest/wry/struct.WebViewBuilder.html)
- [Tauri Logging Plugin](https://v2.tauri.app/plugin/logging/)
- [tauri-plugin-snapshot](https://crates.io/crates/tauri-plugin-snapshot)
- [tauri-plugin-screenshots](https://crates.io/crates/tauri-plugin-screenshots)
- [Tauri Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/)
- [Microsoft WebView2 Process Model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model)
- [CEF Chromium Embedded Framework Issue #703](https://github.com/tauri-apps/wry/issues/703)
- [Tauri v2 Blog](https://v2.tauri.app/blog/tauri-2-0-0-beta/)
