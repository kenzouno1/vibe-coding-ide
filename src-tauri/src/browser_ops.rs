use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
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
/// Uses Tauri IPC invoke (forward_console_log command) to relay logs to main app.
const CONSOLE_BRIDGE_SCRIPT: &str = r#"
(function() {
  if (window.__DEVTOOLS_BRIDGE__) return;
  window.__DEVTOOLS_BRIDGE__ = true;

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
    try {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        window.__TAURI__.core.invoke('forward_console_log', {
          level: level,
          message: ser(args),
          timestamp: Date.now(),
          pageUrl: location.href
        });
      }
    } catch(e) {}
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
