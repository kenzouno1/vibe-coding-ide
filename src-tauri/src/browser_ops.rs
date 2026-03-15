use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Rect, WebviewUrl};

/// Generate a stable short label from project path (Tauri requires unique labels)
fn webview_label(project_id: &str) -> String {
    let mut hasher = DefaultHasher::new();
    project_id.hash(&mut hasher);
    format!("browser-{:x}", hasher.finish())
}

/// Helper: get a child webview by label from the main window
fn get_child_webview(
    app: &tauri::AppHandle,
    label: &str,
) -> Result<tauri::Webview, String> {
    app.get_webview(label)
        .ok_or_else(|| "Browser webview not found".to_string())
}

/// JS bridge injected into every page loaded in the browser webview.
/// Overrides console.log/warn/error/info and captures uncaught errors.
/// Stores logs in __DEVTOOLS_LOGS__ buffer. Rust polls via eval() to flush.
/// This approach works on ALL pages (external URLs, CORS, CSP) because
/// it doesn't require Tauri IPC from the child webview.
const CONSOLE_BRIDGE_SCRIPT: &str = r#"
(function() {
  if (window.__DEVTOOLS_BRIDGE__) return;
  window.__DEVTOOLS_BRIDGE__ = true;
  window.__DEVTOOLS_LOGS__ = [];
  window.__DEVTOOLS_SELECTION__ = null;

  var orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  function ser(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      try {
        if (args[i] === null) parts.push('null');
        else if (args[i] === undefined) parts.push('undefined');
        else if (typeof args[i] === 'object') parts.push(JSON.stringify(args[i], null, 2));
        else parts.push(String(args[i]));
      } catch(e) { parts.push('[Unserializable]'); }
    }
    return parts.join(' ');
  }

  function send(level, args) {
    orig[level].apply(console, args);
    if (window.__DEVTOOLS_LOGS__.length < 500) {
      window.__DEVTOOLS_LOGS__.push({
        level: level,
        message: ser(args),
        timestamp: Date.now(),
        url: location.href
      });
    }
  }

  console.log = function() { send('log', arguments); };
  console.warn = function() { send('warn', arguments); };
  console.error = function() { send('error', arguments); };
  console.info = function() { send('info', arguments); };

  window.addEventListener('error', function(ev) {
    var msg = (ev.message || 'Unknown error') + ' at ' + (ev.filename || '?') + ':' + (ev.lineno || 0) + ':' + (ev.colno || 0);
    send('error', [msg]);
  });

  window.addEventListener('unhandledrejection', function(ev) {
    var reason = ev.reason;
    try { reason = typeof reason === 'object' ? JSON.stringify(reason) : String(reason); } catch(e) { reason = '[Object]'; }
    send('error', ['Unhandled Promise: ' + reason]);
  });

  // Text selection bridge — Ctrl+Shift+S stores selection for Rust to poll
  document.addEventListener('keydown', function(ev) {
    if (ev.ctrlKey && ev.shiftKey && ev.key === 'S') {
      ev.preventDefault();
      var sel = window.getSelection();
      if (sel && sel.toString().trim()) {
        window.__DEVTOOLS_SELECTION__ = {
          text: sel.toString(),
          url: location.href
        };
      }
    }
  });
})();
"#;

/// Parse URL string into WebviewUrl
fn parse_url(url: &str) -> Result<WebviewUrl, String> {
    if url == "about:blank" || url.is_empty() {
        Ok(WebviewUrl::External(
            "about:blank".parse().unwrap(),
        ))
    } else {
        Ok(WebviewUrl::External(
            url.parse().map_err(|e| format!("Invalid URL: {e}"))?,
        ))
    }
}

/// Relay text selection from child webview to main app event bus.
#[tauri::command]
pub async fn forward_browser_selection(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    text: String,
    page_url: String,
) -> Result<(), String> {
    let label = webview.label().to_string();
    let _ = app.emit(
        "browser-selection",
        serde_json::json!({
            "label": label,
            "text": text,
            "url": page_url,
        }),
    );
    Ok(())
}

/// Create a child webview inside the main window at the given position/size.
/// Must be called from async context to avoid deadlocks on Windows.
#[tauri::command]
pub async fn create_browser_webview(
    app: tauri::AppHandle,
    project_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = webview_label(&project_id);

    // Check if already exists
    if app.get_webview(&label).is_some() {
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or("Main window not found")?;

    let parsed_url = parse_url(&url)?;

    let app_for_nav = app.clone();
    let app_for_load = app.clone();
    let app_for_title = app.clone();
    let label_for_nav = label.clone();
    let label_for_load = label.clone();
    let label_for_title = label.clone();

    let builder = WebviewBuilder::new(&label, parsed_url)
        .initialization_script(CONSOLE_BRIDGE_SCRIPT)
        .on_navigation(move |nav_url| {
            let url_str = nav_url.to_string();
            // Block dangerous URL schemes
            let scheme = nav_url.scheme();
            if scheme == "javascript" || scheme == "data" || scheme == "file" {
                return false;
            }
            let _ = app_for_nav.emit(
                "browser-navigated",
                serde_json::json!({
                    "label": label_for_nav,
                    "url": url_str,
                }),
            );
            true
        })
        .on_page_load(move |_webview, payload| {
            let (event_name, url) = match payload.event() {
                PageLoadEvent::Started => ("started", payload.url().to_string()),
                PageLoadEvent::Finished => ("finished", payload.url().to_string()),
            };
            // Emit to app (main webview) not child webview, so React can listen
            let _ = app_for_load.emit(
                "browser-page-load",
                serde_json::json!({
                    "label": label_for_load,
                    "event": event_name,
                    "url": url,
                }),
            );
        })
        .on_document_title_changed(move |_webview, title| {
            // Intercept console log flush signal from polling thread
            if title.starts_with("__DEVTOOLS_FLUSH__") {
                let json_data = &title["__DEVTOOLS_FLUSH__".len()..];
                if let Ok(logs) = serde_json::from_str::<Vec<serde_json::Value>>(json_data) {
                    for log in logs {
                        let _ = app_for_title.emit(
                            "browser-console",
                            serde_json::json!({
                                "label": label_for_title,
                                "level": log.get("level").and_then(|v| v.as_str()).unwrap_or("log"),
                                "message": log.get("message").and_then(|v| v.as_str()).unwrap_or(""),
                                "timestamp": log.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0),
                                "url": log.get("url").and_then(|v| v.as_str()).unwrap_or(""),
                            }),
                        );
                    }
                }
                return;
            }
            let _ = app_for_title.emit(
                "browser-title-changed",
                serde_json::json!({
                    "label": label_for_title,
                    "title": title,
                }),
            );
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| format!("Failed to create webview: {e}"))?;

    // Start a polling thread to flush console logs from the child webview.
    // This is necessary because external URLs can't use Tauri IPC (invoke) —
    // the JS bridge stores logs in window.__DEVTOOLS_LOGS__ and we eval() to retrieve them.
    let poll_app = app.clone();
    let poll_label = label.clone();
    std::thread::spawn(move || {
        let _flush_script = r#"
            (function() {
                var logs = window.__DEVTOOLS_LOGS__ || [];
                window.__DEVTOOLS_LOGS__ = [];
                var sel = window.__DEVTOOLS_SELECTION__;
                window.__DEVTOOLS_SELECTION__ = null;
                return JSON.stringify({ logs: logs, selection: sel });
            })()
        "#;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Check if webview still exists
            let webview = match poll_app.get_webview(&poll_label) {
                Some(w) => w,
                None => break,
            };

            // Eval returns void in Tauri — we can't get the return value directly.
            // Instead, inject a script that sets document.title to a special prefix
            // with the data, then read it via on_document_title_changed.
            // But that's hacky. Better approach: inject a script that writes to
            // a hidden element we can query.
            //
            // Simplest: use eval to call postMessage back to ourselves, but that
            // won't work cross-origin either.
            //
            // ACTUAL simplest: Use eval to set window.name (readable from Rust? No.)
            //
            // Let's use the title-based signaling approach:
            let signal_script = r#"
                (function() {
                    var logs = window.__DEVTOOLS_LOGS__ || [];
                    if (logs.length === 0) return;
                    window.__DEVTOOLS_LOGS__ = [];
                    var realTitle = document.title;
                    document.title = '__DEVTOOLS_FLUSH__' + JSON.stringify(logs);
                    setTimeout(function() { document.title = realTitle; }, 50);
                })()
            "#;

            if webview.eval(signal_script).is_err() {
                break;
            }
        }
    });

    Ok(())
}

/// Relay console log from child webview to main app event bus.
/// Called by JS bridge in child webview via Tauri IPC invoke.
/// The webview label is extracted from the calling webview to identify the project.
#[tauri::command]
pub async fn forward_console_log(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    level: String,
    message: String,
    timestamp: f64,
    page_url: String,
) -> Result<(), String> {
    let label = webview.label().to_string();
    let _ = app.emit(
        "browser-console",
        serde_json::json!({
            "label": label,
            "level": level,
            "message": message,
            "timestamp": timestamp,
            "url": page_url,
        }),
    );
    Ok(())
}

/// Navigate the browser webview to a new URL
#[tauri::command]
pub async fn navigate_browser(
    app: tauri::AppHandle,
    project_id: String,
    url: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("Invalid URL: {e}"))?;
    webview.navigate(parsed).map_err(|e| e.to_string())
}

/// Navigate back via JS history API
#[tauri::command]
pub async fn browser_go_back(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    webview
        .eval("window.history.back()")
        .map_err(|e| e.to_string())
}

/// Navigate forward via JS history API
#[tauri::command]
pub async fn browser_go_forward(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    webview
        .eval("window.history.forward()")
        .map_err(|e| e.to_string())
}

/// Reload the browser webview
#[tauri::command]
pub async fn browser_reload(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    webview
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())
}

/// Resize/reposition the browser webview to match the React container bounds
#[tauri::command]
pub async fn resize_browser_webview(
    app: tauri::AppHandle,
    project_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    webview
        .set_bounds(Rect {
            position: LogicalPosition::new(x, y).into(),
            size: LogicalSize::new(width, height).into(),
        })
        .map_err(|e| e.to_string())
}

/// Show the browser webview (when switching to browser view)
#[tauri::command]
pub async fn show_browser_webview(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    webview.show().map_err(|e| e.to_string())
}

/// Hide the browser webview (when switching away from browser view)
#[tauri::command]
pub async fn hide_browser_webview(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    if let Some(webview) = app.get_webview(&label) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Destroy the browser webview (when project tab is closed)
#[tauri::command]
pub async fn destroy_browser_webview(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Trigger screenshot capture in the browser webview.
/// Injects JS that captures the page as a canvas data URL and sends it back via IPC.
#[tauri::command]
pub async fn capture_browser_screenshot(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;

    // Inject a script that captures the visible viewport as a PNG data URL.
    //
    // The SVG foreignObject approach is broken for external pages:
    //   - CORS blocks external stylesheets/images → canvas is tainted
    //   - Security restrictions prevent serializing cross-origin frames
    //   - Result is almost always blank or throws a SecurityError
    //
    // Instead, we load html2canvas from CDN (a well-known, battle-tested library)
    // and fall back gracefully if it fails (e.g. offline or CSP blocks CDN).
    // html2canvas handles CORS, iframes, and complex layouts far better.
    //
    // Note: window.__TAURI_INTERNALS__.invoke is used (not window.__TAURI__) because
    // external pages don't have @tauri-apps/api loaded.
    let capture_script = r#"
    (function() {
      function sendResult(dataUrl) {
        try {
          if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
            window.__TAURI_INTERNALS__.invoke('receive_browser_screenshot', { dataUrl: dataUrl || '' });
          }
        } catch(e) {}
      }

      function captureWithHtml2canvas(h2c) {
        h2c(document.body, {
          useCORS: true,
          allowTaint: false,
          scale: window.devicePixelRatio || 1,
          width: window.innerWidth,
          height: window.innerHeight,
          x: window.scrollX,
          y: window.scrollY,
          logging: false
        }).then(function(canvas) {
          sendResult(canvas.toDataURL('image/png'));
        }).catch(function() {
          sendResult('');
        });
      }

      // If html2canvas is already on the page, use it directly
      if (typeof window.html2canvas === 'function') {
        captureWithHtml2canvas(window.html2canvas);
        return;
      }

      // Dynamically load html2canvas from CDN
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = function() {
        if (typeof window.html2canvas === 'function') {
          captureWithHtml2canvas(window.html2canvas);
        } else {
          sendResult('');
        }
      };
      script.onerror = function() {
        // CDN blocked or offline — send empty to signal failure
        sendResult('');
      };
      document.head.appendChild(script);
    })();
    "#;

    webview.eval(capture_script).map_err(|e| e.to_string())
}

/// Receive screenshot data URL from the browser webview and relay to frontend
#[tauri::command]
pub async fn receive_browser_screenshot(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<(), String> {
    let _ = app.emit("browser-screenshot-captured", serde_json::json!({ "dataUrl": data_url }));
    Ok(())
}

/// Save an annotated screenshot to the project's .devtools/screenshots/ directory
#[tauri::command]
pub async fn write_screenshot(
    project_path: String,
    filename: String,
    data: String,
) -> Result<String, String> {
    let dir = PathBuf::from(&project_path).join(".devtools/screenshots");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    let path = dir.join(&filename);

    // Decode base64 data
    use std::io::Write;
    let bytes = base64_decode(&data)?;
    let mut file = std::fs::File::create(&path).map_err(|e| format!("Failed to create file: {e}"))?;
    file.write_all(&bytes).map_err(|e| format!("Failed to write: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

/// Simple base64 decoder (no external dependency)
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &byte in input.as_bytes() {
        let val = if byte == b'=' {
            break;
        } else if let Some(pos) = TABLE.iter().position(|&c| c == byte) {
            pos as u32
        } else if byte == b'\n' || byte == b'\r' || byte == b' ' {
            continue;
        } else {
            return Err(format!("Invalid base64 character: {}", byte as char));
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(output)
}

/// Open DevTools for the browser webview (development only)
#[tauri::command]
pub async fn open_browser_devtools(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let label = webview_label(&project_id);
    let webview = get_child_webview(&app, &label)?;
    webview.open_devtools();
    Ok(())
}
