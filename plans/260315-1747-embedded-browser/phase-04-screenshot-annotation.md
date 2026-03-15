# Phase 4: Screenshot & Annotation

## Context
- Plan: `plan.md`
- Depends on: Phase 1 (webview exists)
- Independent of: Phases 2-3

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Capture screenshots of embedded browser, overlay Konva.js annotation canvas with full drawing tools (pen, highlighter, shapes, text, colors, undo/redo)

## Key Insights
- WebView2 on Windows has `CapturePreview` API for native screenshot capture
- Tauri can access WebView2 raw handle via `with_webview()` to call native APIs
- Alternative: inject `html2canvas` via JS bridge (cross-platform but lower quality)
- Konva.js (55KB) provides all needed tools: freehand, shapes, text, transformers
- react-konva gives declarative React bindings

## Architecture

```
Screenshot Flow:
BrowserView → [Capture Button] → Rust browser_ops::capture_screenshot()
  → WebView2 CapturePreview (Windows)
  → Returns PNG base64
  → BrowserStore.screenshotData = base64
  → AnnotationOverlay renders with screenshot as background

Annotation Canvas (Konva.js):
┌────────────────────────────────────┐
│ Toolbar                            │
│ [✏️ Pen] [🖌 Highlight] [▭ Rect]   │
│ [○ Circle] [→ Arrow] [T Text]     │
│ [🎨 Color] [↩ Undo] [↪ Redo]     │
│ [💾 Save] [📋 Copy] [✕ Close]     │
├────────────────────────────────────┤
│                                    │
│  ┌──────────────────────────────┐  │
│  │ Screenshot (background img) │  │
│  │ + Drawing shapes on top     │  │
│  └──────────────────────────────┘  │
│                                    │
└────────────────────────────────────┘
```

## Requirements

### Functional
- [ ] "Screenshot" button in browser URL bar
- [ ] Capture current webview content as PNG
- [ ] Open annotation overlay with screenshot as background
- [ ] Drawing tools: freehand pen, highlighter (semi-transparent)
- [ ] Shape tools: rectangle, circle/ellipse, arrow, line
- [ ] Text tool: click to place, type text, font size
- [ ] Color picker: preset colors (red, blue, green, yellow, white, black) + custom
- [ ] Stroke width selector (thin, medium, thick)
- [ ] Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Export annotated image as PNG
- [ ] Copy to clipboard
- [ ] Save to project `.devtools/screenshots/` directory
- [ ] Close annotation overlay (Escape)

### Non-functional
- [ ] Screenshot capture <500ms
- [ ] Annotation canvas supports images up to 1920x1080
- [ ] Smooth drawing at 60fps
- [ ] Undo stack: max 50 entries

## Related Code Files

### Files to Modify
- `src-tauri/src/browser_ops.rs` — Add `capture_screenshot` command
- `src/stores/browser-store.ts` — Add screenshot state, annotation state
- `src/components/browser-view.tsx` — Add screenshot button, annotation overlay toggle
- `src/components/browser-url-bar.tsx` — Add camera icon button
- `package.json` — Add konva, react-konva dependencies

### Files to Create
- `src/components/annotation-overlay.tsx` — Full-screen annotation canvas
- `src/components/annotation-toolbar.tsx` — Drawing tools toolbar

## Implementation Steps

### Step 1: Install dependencies
```bash
npm install konva react-konva
```

### Step 2: Add capture_screenshot to browser_ops.rs
```rust
#[tauri::command]
async fn capture_screenshot(
    app: AppHandle,
    project_id: String,
) -> Result<String, String> {
    // Get the browser webview by label
    let label = format!("browser-{}", project_id_hash(&project_id));
    let webview = app.webview_windows().get(&label)
        .ok_or("Browser webview not found")?;

    // Platform-specific capture
    // Windows: use WebView2 CapturePreview via with_webview()
    // Fallback: inject html2canvas script and capture DOM
    // Return base64-encoded PNG
}
```

Cross-platform fallback: inject JS to capture via canvas:
```javascript
// Inject into webview
async function captureScreenshot() {
  const canvas = await html2canvas(document.body);
  return canvas.toDataURL('image/png');
}
```

### Step 3: Add annotation state to browser-store.ts
```typescript
type AnnotationTool = "pen" | "highlighter" | "rect" | "circle" | "arrow" | "line" | "text" | "select";

interface AnnotationState {
  isOpen: boolean;
  screenshotData: string | null; // base64 PNG
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  history: ShapeData[][]; // undo stack
  historyIndex: number;
}

// Actions:
openAnnotation: (projectPath: string, screenshotData: string) => void;
closeAnnotation: (projectPath: string) => void;
setTool: (projectPath: string, tool: AnnotationTool) => void;
setColor: (projectPath: string, color: string) => void;
setStrokeWidth: (projectPath: string, width: number) => void;
pushHistory: (projectPath: string, shapes: ShapeData[]) => void;
undo: (projectPath: string) => void;
redo: (projectPath: string) => void;
```

### Step 4: Create annotation-toolbar.tsx
```
Tools section:
- Select (pointer) — move/resize existing shapes
- Pen — freehand drawing (Konva.Line with tension)
- Highlighter — semi-transparent pen (opacity: 0.3, thick stroke)
- Rectangle — drag to draw
- Circle — drag to draw
- Arrow — click start → drag to end
- Line — straight line
- Text — click to place, input field

Options section:
- Color swatches: #f38ba8 (red), #89b4fa (blue), #a6e3a1 (green),
                   #f9e2af (yellow), #cdd6f4 (white), #1e1e2e (black)
- Stroke width: 2px, 4px, 8px
- Undo (Ctrl+Z) / Redo (Ctrl+Shift+Z)

Actions section:
- Save to file
- Copy to clipboard
- Close (Escape)
```

### Step 5: Create annotation-overlay.tsx
Core Konva canvas setup:
```tsx
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Image } from "react-konva";

// Background image (screenshot)
// Drawing layer (user shapes)
// Tool interaction handlers (mousedown, mousemove, mouseup)
// Transform controls for select mode
```

Key interactions:
- **Pen/Highlighter**: Track mouse points → create `Line` with points array
- **Rect**: Record start point on mousedown, update width/height on mousemove
- **Circle**: Similar to rect but use radiusX/radiusY
- **Arrow**: Two points (start, end)
- **Text**: Click to place, show input overlay, create Text node on confirm
- **Select**: Click shape to select, show Transformer for move/resize

### Step 6: Export functionality
```typescript
// Export from Konva stage
const exportAnnotatedImage = () => {
  const stage = stageRef.current;
  const dataUrl = stage.toDataURL({ pixelRatio: 2 }); // 2x for retina
  return dataUrl; // base64 PNG
};

// Save to file
const saveToFile = async (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1];
  const filename = `screenshot-${Date.now()}.png`;
  await invoke("write_screenshot", {
    projectPath,
    filename,
    data: base64,
  });
};

// Copy to clipboard
const copyToClipboard = async (dataUrl: string) => {
  const blob = await fetch(dataUrl).then(r => r.blob());
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
};
```

### Step 7: Add write_screenshot Rust command
```rust
#[tauri::command]
async fn write_screenshot(
    project_path: String,
    filename: String,
    data: String, // base64
) -> Result<String, String> {
    let dir = PathBuf::from(&project_path).join(".devtools/screenshots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    let bytes = base64_decode(&data)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

## Todo List
- [ ] Install `konva` + `react-konva`
- [ ] Add `capture_screenshot` command to `browser_ops.rs`
- [ ] Add annotation state to `browser-store.ts`
- [ ] Create `annotation-toolbar.tsx` with tool/color/action buttons
- [ ] Create `annotation-overlay.tsx` with Konva canvas
- [ ] Implement pen/highlighter drawing (freehand Line)
- [ ] Implement shapes (rect, circle, arrow, line)
- [ ] Implement text tool
- [ ] Implement select tool with Transformer
- [ ] Implement undo/redo stack
- [ ] Implement export (save to file, copy to clipboard)
- [ ] Add screenshot button to `browser-url-bar.tsx`
- [ ] Add `write_screenshot` Rust command
- [ ] Test: capture, draw, undo/redo, export

## Success Criteria
- Screenshot captures current webview accurately
- All drawing tools work (pen, highlighter, rect, circle, arrow, line, text)
- Color and stroke width selection works
- Undo/redo works (Ctrl+Z / Ctrl+Shift+Z)
- Export as PNG to file and clipboard works
- Overlay closes with Escape
- 60fps drawing performance

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| WebView2 CapturePreview access from Tauri | Use `with_webview()` for raw access; fallback to JS-based capture |
| Large screenshot images slow down Konva | Cap at 1920x1080; downsample if larger |
| react-konva SSR/bundling issues | Client-side only; lazy import |
| base64 encoding large images | Use binary transfer if base64 too slow; compress PNG |

## Next Steps
- Phase 5: Feedback workflow (send annotated image to terminal)
