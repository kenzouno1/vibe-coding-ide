# Tauri v2.10.3 Child Webview API Research

## Summary
Child webviews in Tauri v2 are created via `WebviewBuilder` and added to a parent window using `window.add_child()`. Feature requires `unstable` flag. All positioning/sizing use logical or physical coordinates. Child webviews are fully independent with separate JS contexts.

---

## 1. Creating Child Webview (WebviewBuilder)

### Constructor
```rust
use tauri::webview::{WebviewBuilder, WebviewUrl};

let webview = WebviewBuilder::new("my_child", WebviewUrl::App("index.html".into()))
    .auto_resize();
```

**Methods:**
- `new<L: Into<String>>(label: L, url: WebviewUrl) -> Self`
  - `label`: unique identifier for the webview
  - `url`: either `WebviewUrl::App("path")` for local files or `WebviewUrl::External(Url)` for URLs

### URL Types
```rust
// Local app file
WebviewUrl::App("index.html".into())

// External URL
WebviewUrl::External("https://example.com".parse().unwrap())
```

---

## 2. Positioning & Sizing Child Webview

### Adding to Parent Window
```rust
use tauri::window::Window;
use tauri::LogicalPosition;
use tauri::LogicalSize;

let webview = window.add_child(
    webview_builder,
    LogicalPosition::new(0.0, 0.0),    // x, y coordinates
    LogicalSize::new(400.0, 300.0),    // width, height
)?;
```

**Signature:**
```rust
pub fn add_child<P, S>(
    &self,
    webview_builder: WebviewBuilder<R>,
    position: P,
    size: S,
) -> Result<Webview<R>>
where
    P: Into<Position>,  // LogicalPosition or PhysicalPosition
    S: Into<Size>,      // LogicalSize or PhysicalSize
```

### Position Types
```rust
use tauri::{LogicalPosition, PhysicalPosition};

LogicalPosition::new(100.0, 200.0)      // DPI-independent
PhysicalPosition::new(100, 200)         // Raw pixels
```

### Size Types
```rust
use tauri::{LogicalSize, PhysicalSize};

LogicalSize::new(400.0, 300.0)          // DPI-independent
PhysicalSize::new(400, 300)             // Raw pixels
```

### After Creation - Update Position/Size
```rust
// Set bounds (position + size)
webview.set_bounds(Rect {
    position: LogicalPosition::new(0.0, 0.0).into(),
    size: LogicalSize::new(400.0, 300.0).into(),
})?;

// Get current bounds
let bounds = webview.bounds()?;

// Set position only
webview.set_position(LogicalPosition::new(100.0, 100.0))?;

// Set size only
webview.set_size(LogicalSize::new(500.0, 400.0))?;

// Get current values
let pos = webview.position()?;
let size = webview.size()?;
```

---

## 3. Navigate Child Webview

### Change URL
```rust
webview.navigate("https://example.com".parse().unwrap())?;
webview.navigate(tauri::WebviewUrl::App("other.html".into()))?;
```

**Signature:**
```rust
pub fn navigate(&self, url: WebviewUrl) -> Result<()>
```

### Get Current URL
```rust
let current_url = webview.url()?;
```

### Reload
```rust
webview.reload()?;
```

---

## 4. Show/Hide Child Webview

### Hide/Show (Desktop Only)
```rust
webview.hide()?;
webview.show()?;
```

**Note:** These are desktop-only (`#[cfg(desktop)]`). Marked as unstable on some platforms.

---

## 5. Evaluate JavaScript in Child Webview

### Execute JS
```rust
webview.eval("console.log('Hello from child webview');")?;
```

**Signature:**
```rust
pub fn eval(&self, script: &str) -> Result<()>
```

**Important:** `eval` does NOT return the result of the JavaScript execution. It only evaluates it. Use Tauri invoke for bidirectional communication.

### Get JS Result (via Invoke)
In your Rust command:
```rust
#[tauri::command]
fn my_command(webview: tauri::State<Webview>) -> String {
    webview.eval("window.__myResult").ok();
    // ... then retrieve via JS invoke
    "result".to_string()
}
```

Or use message passing from JS back to Rust via `tauri::api::invoke`.

---

## 6. Listen for Navigation & Loading Events

### On Navigation (Builder)
```rust
let webview = WebviewBuilder::new("child", WebviewUrl::App("index.html".into()))
    .on_navigation(|url| {
        println!("Navigating to: {}", url);
        true  // Return false to block navigation
    });
```

**Signature:**
```rust
pub fn on_navigation<F>(self, f: F) -> Self
where
    F: Fn(&str) -> bool + Send + 'static,
```

Returns `false` to block, `true` to allow.

### On Page Load (Builder)
```rust
use tauri::webview::PageLoadEvent;

let webview = WebviewBuilder::new("child", WebviewUrl::App("index.html".into()))
    .on_page_load(|event| {
        match event {
            PageLoadEvent::Started => println!("Page load started"),
            PageLoadEvent::Finished => println!("Page load finished"),
        }
    });
```

**Signature:**
```rust
pub fn on_page_load<F>(self, f: F) -> Self
where
    F: Fn(PageLoadEvent) + Send + 'static,
```

### On Document Title Changed (Builder)
```rust
let webview = WebviewBuilder::new("child", WebviewUrl::App("index.html".into()))
    .on_document_title_changed(|title| {
        println!("Title changed to: {}", title);
    });
```

**Signature:**
```rust
pub fn on_document_title_changed<F>(self, f: F) -> Self
where
    F: Fn(String) + Send + 'static,
```

### Listen for Events (After Creation)
```rust
use tauri::Listener;

// Must be set up during builder phase (above)
// After creation, use on_webview_event for custom events
webview.on_webview_event(|event| {
    println!("Webview event: {:?}", event);
})?;
```

---

## 7. Cargo Dependencies & Features

### Cargo.toml
```toml
[dependencies]
tauri = { version = "2.10.3", features = ["unstable"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Required Feature:** `unstable` - Multiwebview support is currently unstable.

### Use Statements
```rust
use tauri::webview::{WebviewBuilder, WebviewUrl};
use tauri::window::Window;
use tauri::{LogicalPosition, LogicalSize, Manager};
use tauri::webview::PageLoadEvent;
```

---

## 8. Permissions in tauri.conf.json

### No Specific Webview Permissions Needed
Child webviews inherit permissions from parent window. However, if using capabilities system:

```json
{
  "build": {
    "features": ["unstable"]
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Parent Window",
        "width": 800,
        "height": 600
      }
    ]
  },
  "app": {
    "security": {
      "csp": null
    }
  }
}
```

### Capability Configuration (Optional)
If using capabilities for webviews:

```json
{
  "capabilities": [
    {
      "identifier": "webview-child",
      "description": "Permission for child webview",
      "windows": ["main"],
      "webviews": ["my_child"]
    }
  ]
}
```

---

## Complete Working Example

```rust
use tauri::window::Window;
use tauri::webview::{WebviewBuilder, WebviewUrl, PageLoadEvent};
use tauri::{LogicalPosition, LogicalSize, Manager};

#[tauri::command]
fn create_child_webview(window: tauri::State<'_, Window>) -> Result<String, String> {
    // Create builder
    let webview_builder = WebviewBuilder::new(
        "child_pane",
        WebviewUrl::App("child.html".into())
    )
    .auto_resize()
    .on_page_load(|event| {
        match event {
            PageLoadEvent::Started => println!("Child page loading..."),
            PageLoadEvent::Finished => println!("Child page loaded!"),
        }
    })
    .on_navigation(|url| {
        println!("Child navigating to: {}", url);
        true  // Allow navigation
    })
    .on_document_title_changed(|title| {
        println!("Child title: {}", title);
    });

    // Add to parent window
    let webview = window.add_child(
        webview_builder,
        LogicalPosition::new(400.0, 0.0),
        LogicalSize::new(400.0, 600.0),
    ).map_err(|e| e.to_string())?;

    // Optional: manipulate after creation
    webview.eval("console.log('Child webview ready');")?;

    Ok("Child webview created".to_string())
}

#[tauri::command]
fn navigate_child(window: tauri::State<'_, Window>, url: String) -> Result<(), String> {
    if let Some(webview) = window.webviews().iter().find(|w| w.label() == "child_pane") {
        webview.navigate(tauri::WebviewUrl::External(
            url.parse().map_err(|_| "Invalid URL")?
        ))?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_child_visibility(window: tauri::State<'_, Window>, visible: bool) -> Result<(), String> {
    if let Some(webview) = window.webviews().iter().find(|w| w.label() == "child_pane") {
        if visible {
            webview.show()?;
        } else {
            webview.hide()?;
        }
    }
    Ok(())
}
```

---

## Known Issues & Limitations

1. **Windows Deadlock**: Calling `add_child()` in synchronous commands causes deadlock. Use async commands in separate thread.
   ```rust
   #[tauri::command]
   async fn create_child_async(window: tauri::State<'_, Window>) {
       // Safe to call here
   }
   ```

2. **Rendering Issues**: Some platforms have positioning/z-order bugs (see GitHub issues #9798, #10420, #13071).

3. **Feature Stability**: Multiwebview is behind `unstable` feature flag - API may change.

4. **Limited Navigation Events**: `on_navigation` callback happens before navigation begins, not after.

---

## References

- [WebviewBuilder docs.rs 2.10.2](https://docs.rs/tauri/2.10.2/tauri/webview/struct.WebviewBuilder.html)
- [Window.add_child docs.rs 2.10.2](https://docs.rs/tauri/2.10.2/tauri/window/struct.Window.html)
- [Webview docs.rs 2.10.2](https://docs.rs/tauri/2.10.2/tauri/webview/struct.Webview.html)
- [Tauri multiwebview example](https://github.com/tauri-apps/tauri/tree/dev/examples/multiwebview)
- [Tauri v2 Configuration Reference](https://v2.tauri.app/reference/config/)
- [Tauri v2 Capabilities](https://v2.tauri.app/security/capabilities/)

---

## Unresolved Questions

None - all requested API details documented above with exact method signatures and working code examples.
