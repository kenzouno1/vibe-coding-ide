# Phase 6: Float Layout & DevTools Toggle

## Context
- Plan: `plan.md`
- Independent of Phases 2-5 (layout refactor)
- Depends on: Phase 1 (browser webview exists)

## Overview
- **Priority**: P2
- **Status**: pending
- **Description**: Add floating panel mode for browser (drag/resize, toggle dock) and optional DevTools toggle (F12)

## Key Insights
- Floating panel = browser webview detached from view grid, positioned freely over other views
- User can work in terminal while seeing browser preview floating in corner
- DevTools: WebView2 supports `OpenDevToolsWindow()` — opens separate DevTools window
- On Linux (webkit2gtk): `get_inspector()` → `show()` for equivalent

## Architecture

```
Layout Modes:
┌─────────────────────────────────┐
│ Docked Mode (default)           │
│ ┌────────────────────────────┐  │
│ │ Browser fills view area    │  │
│ │ (same as other views)      │  │
│ └────────────────────────────┘  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Float Mode                      │
│ ┌─────────────┐                 │
│ │ Terminal     │  ┌───────────┐ │
│ │              │  │ Browser   │ │
│ │              │  │ (floating)│ │
│ │              │  │ draggable │ │
│ │              │  │ resizable │ │
│ │              │  └───────────┘ │
│ └─────────────┘                 │
└─────────────────────────────────┘

Toggle: button in browser URL bar or Ctrl+Shift+F
```

## Requirements

### Functional
- [ ] Toggle button: dock ↔ float mode
- [ ] Float mode: draggable by title bar
- [ ] Float mode: resizable by edges/corners
- [ ] Float mode: minimum size 320x240
- [ ] Float mode: stays within main window bounds
- [ ] Float mode: persists position/size per project
- [ ] Float mode: always-on-top within app (z-index above views)
- [ ] DevTools toggle: F12 when browser view is focused
- [ ] DevTools settings toggle in browser URL bar

### Non-functional
- [ ] Drag/resize at 60fps (no jank)
- [ ] Float position persisted in browser-store

## Related Code Files

### Files to Modify
- `src/stores/browser-store.ts` — Add layout mode, float position/size
- `src/components/browser-view.tsx` — Conditional render: docked vs float
- `src/components/browser-url-bar.tsx` — Add dock/float toggle, DevTools button
- `src-tauri/src/browser_ops.rs` — Add open_devtools command
- `src/components/app.tsx` — Render float panel outside view stack

### Files to Create
- `src/components/floating-panel.tsx` — Draggable/resizable wrapper

## Implementation Steps

### Step 1: Add layout state to browser-store.ts
```typescript
interface FloatLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Add to BrowserState:
layoutMode: "docked" | "float";
floatLayout: FloatLayout;

// Actions:
toggleLayoutMode: (projectPath: string) => void;
setFloatLayout: (projectPath: string, layout: FloatLayout) => void;
```

Default float: `{ x: 100, y: 100, width: 480, height: 360 }`

### Step 2: Create floating-panel.tsx
Pure CSS/DOM approach (no library needed):

```tsx
interface FloatingPanelProps {
  x: number; y: number; width: number; height: number;
  minWidth?: number; minHeight?: number;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}

// Implementation:
// - position: fixed with left/top
// - Title bar with drag handle (onMouseDown → track mousemove)
// - Resize handles on edges/corners (CSS cursor: nwse-resize etc.)
// - Clamp to window bounds
// - Mini title bar: URL display + close/dock buttons
```

### Step 3: Modify app.tsx for float rendering
Float mode browser renders **outside** the view stack, at the app root level:
```tsx
{/* Float browser panels (rendered above all views) */}
{openTabs.map((tab) => {
  const browserState = getBrowserState(tab.path);
  if (browserState.layoutMode !== "float" || !browserState.webviewCreated) return null;
  return (
    <FloatingPanel key={`float-${tab.path}`} {...browserState.floatLayout}>
      <BrowserView projectPath={tab.path} isFloat />
    </FloatingPanel>
  );
})}
```

### Step 4: Update browser-view.tsx
- When `isFloat=true`: skip the container sizing, use FloatingPanel's size
- Resize webview to match FloatingPanel's current bounds
- Show mini URL bar (compact mode)

### Step 5: Add DevTools toggle
```rust
// browser_ops.rs
#[tauri::command]
async fn open_browser_devtools(app: AppHandle, project_id: String) -> Result<(), String> {
    let label = format!("browser-{}", hash(&project_id));
    if let Some(webview) = app.webview_windows().get(&label) {
        webview.open_devtools();
        Ok(())
    } else {
        Err("Browser webview not found".into())
    }
}
```

Frontend: F12 shortcut in `use-keyboard-shortcuts.ts` when `view === "browser"`:
```typescript
if (view === "browser" && e.key === "F12") {
  e.preventDefault();
  invoke("open_browser_devtools", { projectId: project });
}
```

### Step 6: Persist float layout
Save float position/size to browser-store (Zustand persist or manual localStorage).

## Todo List
- [ ] Add layout mode + float layout to `browser-store.ts`
- [ ] Create `floating-panel.tsx` with drag + resize
- [ ] Render float panels in `app.tsx` above view stack
- [ ] Update `browser-view.tsx` for float mode
- [ ] Add dock/float toggle to `browser-url-bar.tsx`
- [ ] Add `open_browser_devtools` Rust command
- [ ] Add F12 shortcut for DevTools
- [ ] Add DevTools toggle button to URL bar
- [ ] Persist float position/size
- [ ] Test: toggle modes, drag, resize, DevTools, window bounds clamping

## Success Criteria
- Toggle between docked and float mode works
- Float panel draggable and resizable
- Float stays within window bounds
- Position/size persisted across view switches
- F12 opens DevTools window
- DevTools toggle in settings/URL bar

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Drag/resize interferes with webview mouse events | Title bar handles drag; resize handles on edges only |
| Float z-index conflicts with modals | Use z-index tier: views=1, float=10, modals=100 |
| DevTools API not available on all platforms | Conditional: WebView2 Windows, webkit inspector Linux; graceful no-op on unsupported |
| Webview positioning lag during drag | Throttle position updates to 60fps; use requestAnimationFrame |

## Security Considerations
- DevTools access should be development-only or require explicit user action
- Float panel cannot escape main window (clamped to bounds)

## Next Steps
- Feature complete. Update docs and system architecture.
