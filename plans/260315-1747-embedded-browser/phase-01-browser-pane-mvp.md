# Phase 1: Browser Pane MVP

## Context
- Plan: `plan.md`
- Brainstorm: `plans/reports/brainstorm-260315-1747-embedded-browser-feature.md`
- Existing patterns: `app-store.ts`, `sidebar.tsx`, `app.tsx`, `lib.rs`, `pty_manager.rs`

## Overview
- **Priority**: P0 (foundation for all other phases)
- **Status**: complete
- **Description**: Add "browser" as 4th view (Ctrl+4) with Tauri secondary webview, URL bar, and navigation controls

## Key Insights
- Tauri v2 supports multiple webviews in a single window via `WebviewBuilder` / `WebviewWindowBuilder`
- The secondary webview is a **native OS webview** (WebView2 on Windows), not an iframe
- Positioning: the secondary webview must be positioned/resized to match a React container div's bounds
- Current app uses visibility toggle (not unmount) for view switching — browser webview must follow same pattern (hide/show, not destroy/create)

## Architecture

```
React Frontend                          Rust Backend
─────────────                          ────────────
BrowserView                            browser_ops.rs
├─ BrowserUrlBar                       ├─ create_browser_webview()
│  ├─ URL input                        ├─ navigate_browser()
│  └─ Back/Fwd/Refresh buttons         ├─ go_back_browser()
├─ <div ref> (webview mount target)    ├─ go_forward_browser()
└─ BrowserStore (Zustand)              ├─ reload_browser()
   ├─ url, isLoading, canGoBack/Fwd   ├─ resize_browser_webview()
   └─ per-project state               ├─ show_browser_webview()
                                       ├─ hide_browser_webview()
                                       └─ destroy_browser_webview()
```

### Webview Positioning Strategy
The secondary webview is **not** a React component — it's a native window overlaid on top of the app. We must:
1. Create a `<div ref={containerRef}>` as a placeholder in React
2. Use `ResizeObserver` + `getBoundingClientRect()` to track its position/size
3. Send position updates to Rust via IPC → Rust repositions the native webview
4. Hide webview when switching away from browser view

## Requirements

### Functional
- [ ] Browser appears as 4th sidebar icon (Globe icon)
- [ ] Ctrl+4 switches to browser view
- [ ] URL bar with input field, back, forward, refresh buttons
- [ ] Navigate to any URL
- [ ] Webview content renders inside the view area
- [ ] Per-project browser state (each project tab has its own browser)
- [ ] Browser webview hides when switching to other views (not destroyed)

### Non-functional
- [ ] Webview lazy-created on first browser view activation (not on app start)
- [ ] Memory: single additional webview process (~50-100MB)
- [ ] Resize follows container div in <100ms

## Related Code Files

### Files to Modify
- `src/stores/app-store.ts` — Add `"browser"` to `AppView` type
- `src/components/sidebar.tsx` — Add Globe icon for browser view
- `src/components/app.tsx` — Add browser view layer (visibility toggle)
- `src/hooks/use-keyboard-shortcuts.ts` — Add Ctrl+4 shortcut
- `src-tauri/src/lib.rs` — Register browser_ops commands
- `src-tauri/Cargo.toml` — Add `tauri-plugin-webview` if needed (check if built-in)
- `src-tauri/tauri.conf.json` — Add webview permissions if needed

### Files to Create
- `src/stores/browser-store.ts` — Browser state per project
- `src/components/browser-view.tsx` — Main browser view container
- `src/components/browser-url-bar.tsx` — URL bar + navigation buttons
- `src-tauri/src/browser_ops.rs` — Rust commands for webview lifecycle

## Implementation Steps

### Step 1: Extend AppView type
```typescript
// app-store.ts
export type AppView = "terminal" | "git" | "editor" | "browser";
```

### Step 2: Create browser-store.ts
```typescript
// Per-project browser state
interface BrowserState {
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  title: string;
  webviewCreated: boolean; // lazy creation flag
}

interface BrowserStore {
  states: Record<string, BrowserState>;
  getState: (projectPath: string) => BrowserState;
  setUrl: (projectPath: string, url: string) => void;
  setLoading: (projectPath: string, isLoading: boolean) => void;
  setNavState: (projectPath: string, canGoBack: boolean, canGoForward: boolean) => void;
  setTitle: (projectPath: string, title: string) => void;
  markWebviewCreated: (projectPath: string) => void;
}
```
Default URL: `about:blank` or `https://localhost:3000`

### Step 3: Create browser_ops.rs (Rust backend)
Key commands using Tauri v2's `WebviewBuilder`:

```rust
// Create a child webview positioned within the main window
#[tauri::command]
async fn create_browser_webview(
    app: AppHandle,
    project_id: String,
    url: String,
    x: f64, y: f64, width: f64, height: f64
) -> Result<(), String>

// Navigate to URL
#[tauri::command]
async fn navigate_browser(app: AppHandle, project_id: String, url: String) -> Result<(), String>

// Back/Forward/Reload
#[tauri::command]
async fn browser_go_back(app: AppHandle, project_id: String) -> Result<(), String>

#[tauri::command]
async fn browser_go_forward(app: AppHandle, project_id: String) -> Result<(), String>

#[tauri::command]
async fn browser_reload(app: AppHandle, project_id: String) -> Result<(), String>

// Reposition/resize the native webview to match React container
#[tauri::command]
async fn resize_browser_webview(
    app: AppHandle,
    project_id: String,
    x: f64, y: f64, width: f64, height: f64
) -> Result<(), String>

// Show/hide without destroying
#[tauri::command]
async fn show_browser_webview(app: AppHandle, project_id: String) -> Result<(), String>

#[tauri::command]
async fn hide_browser_webview(app: AppHandle, project_id: String) -> Result<(), String>

// Cleanup
#[tauri::command]
async fn destroy_browser_webview(app: AppHandle, project_id: String) -> Result<(), String>
```

Webview label convention: `browser-{project_id_hash}` (Tauri requires unique labels)

### Step 4: Create browser-url-bar.tsx
- Input field for URL (Enter to navigate)
- Back/Forward/Refresh buttons using Lucide icons (`ArrowLeft`, `ArrowRight`, `RotateCw`)
- Loading indicator
- Display current page title

### Step 5: Create browser-view.tsx
- Container div with `ref` for tracking position/size
- `ResizeObserver` to track bounds → send to Rust for webview positioning
- On mount (first activation): call `create_browser_webview`
- On view switch away: call `hide_browser_webview`
- On view switch to browser: call `show_browser_webview` + resize

### Step 6: Wire into app.tsx
Add browser view layer following existing pattern:
```tsx
{/* Browser view */}
<div
  className="absolute inset-0"
  style={{
    visibility: view === "browser" ? "visible" : "hidden",
    zIndex: view === "browser" ? 1 : 0,
  }}
>
  <BrowserView projectPath={tab.path} />
</div>
```

### Step 7: Update sidebar.tsx
Add Globe icon:
```typescript
import { Terminal, GitBranch, Code, Globe } from "lucide-react";

const NAV_ITEMS = [
  { view: "terminal", icon: Terminal, label: "Terminal" },
  { view: "git", icon: GitBranch, label: "Git" },
  { view: "editor", icon: Code, label: "Editor" },
  { view: "browser", icon: Globe, label: "Browser" },
];
```

### Step 8: Update keyboard shortcuts
Add Ctrl+4 in `use-keyboard-shortcuts.ts`:
```typescript
if (isCtrl && e.key === "4") {
  e.preventDefault();
  setView("browser");
  return;
}
```

### Step 9: Register Rust commands in lib.rs
```rust
mod browser_ops;

// In invoke_handler:
browser_ops::create_browser_webview,
browser_ops::navigate_browser,
browser_ops::browser_go_back,
browser_ops::browser_go_forward,
browser_ops::browser_reload,
browser_ops::resize_browser_webview,
browser_ops::show_browser_webview,
browser_ops::hide_browser_webview,
browser_ops::destroy_browser_webview,
```

## Todo List
- [x] Extend `AppView` type with `"browser"`
- [x] Create `browser-store.ts`
- [x] Create `browser_ops.rs` with webview lifecycle commands
- [x] Create `browser-url-bar.tsx`
- [x] Create `browser-view.tsx` with ResizeObserver positioning
- [x] Add browser view layer in `app.tsx`
- [x] Add Globe icon to `sidebar.tsx`
- [x] Add Ctrl+4 shortcut
- [x] Register Rust commands in `lib.rs`
- [x] Test: navigate to URL, back/forward, view switching, resize

## Success Criteria
- Browser view accessible via Ctrl+4 and sidebar icon
- Can navigate to any URL and see rendered page
- Back/forward/refresh work correctly
- View switching hides/shows webview without destroying it
- Each project tab has independent browser state
- Webview resizes correctly when window resizes

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Tauri WebviewBuilder positioning API may differ from expected | Read Tauri v2 source/docs for exact API; fallback to separate window |
| Webview overlaps React UI elements (z-index) | Set webview z-order below modals/overlays; hide on non-browser views |
| ResizeObserver → IPC latency causes visual lag | Debounce resize to 50ms; use CSS to mask edges during resize |

## Security Considerations
- No CSP restriction currently (already null in tauri.conf.json)
- Webview runs in separate process — XSS in loaded page cannot access main app
- URL validation: basic sanitization (ensure valid URL format before navigation)

## Next Steps
- Phase 2: Inject JS bridge into the created webview for console capture
