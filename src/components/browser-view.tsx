import { useEffect, useRef, useCallback, useState, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app-store";
import { useProjectStore } from "@/stores/project-store";
import { useBrowserStore, type ConsoleLog } from "@/stores/browser-store";
import { usePaneStore } from "@/stores/pane-store";
import { BrowserUrlBar } from "@/components/browser-url-bar";
import { BrowserConsolePanel } from "@/components/browser-console-panel";
import { AnnotationOverlay } from "@/components/annotation-overlay";
import { FeedbackComposer } from "@/components/feedback-composer";
import { useServerDetect } from "@/hooks/use-server-detect";

interface BrowserViewProps {
  projectPath: string;
}

export const BrowserView = memo(function BrowserView({
  projectPath,
}: BrowserViewProps) {
  // Auto-detect dev server URLs from terminal output
  useServerDetect(projectPath);

  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Guard against double webview creation from rapid view toggles
  const creatingRef = useRef(false);

  const view = useAppStore((s) => s.view);
  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const browserState = useBrowserStore((s) => s.getState(projectPath));
  const markWebviewCreated = useBrowserStore((s) => s.markWebviewCreated);
  const setUrl = useBrowserStore((s) => s.setUrl);
  const setLoading = useBrowserStore((s) => s.setLoading);
  const setTitle = useBrowserStore((s) => s.setTitle);
  const addLog = useBrowserStore((s) => s.addLog);
  const openAnnotation = useBrowserStore((s) => s.openAnnotation);
  const getActivePtySessionId = usePaneStore((s) => s.getActivePtySessionId);

  // Keep refs for resize observer callback (avoids stale closures)
  const viewRef = useRef(view);
  viewRef.current = view;
  const activeTabRef = useRef(activeTabPath);
  activeTabRef.current = activeTabPath;

  // Send current container bounds to Rust for webview positioning
  const syncBounds = useCallback(async () => {
    if (!containerRef.current || !browserState.webviewCreated) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    try {
      await invoke("resize_browser_webview", {
        projectId: projectPath,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } catch {
      // Webview may not exist yet
    }
  }, [projectPath, browserState.webviewCreated]);

  // Create webview on first browser view activation (lazy)
  useEffect(() => {
    const isVisible = view === "browser" && activeTabPath === projectPath;
    if (!isVisible || browserState.webviewCreated || creatingRef.current || !containerRef.current) return;

    creatingRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const url = browserState.url || "about:blank";

    invoke("create_browser_webview", {
      projectId: projectPath,
      url,
      x: rect.left,
      y: rect.top,
      width: Math.max(rect.width, 100),
      height: Math.max(rect.height, 100),
    })
      .then(() => markWebviewCreated(projectPath))
      .catch((err) => console.error("Failed to create browser webview:", err))
      .finally(() => { creatingRef.current = false; });
  }, [view, activeTabPath, projectPath, browserState.webviewCreated, browserState.url, markWebviewCreated]);

  // Show/hide webview based on view and active tab
  useEffect(() => {
    if (!browserState.webviewCreated) return;
    const isVisible = view === "browser" && activeTabPath === projectPath;

    if (isVisible) {
      invoke("show_browser_webview", { projectId: projectPath })
        .then(() => syncBounds())
        .catch(() => {});
    } else {
      invoke("hide_browser_webview", { projectId: projectPath }).catch(() => {});
    }
  }, [view, activeTabPath, projectPath, browserState.webviewCreated, syncBounds]);

  // ResizeObserver to track container bounds and sync to native webview
  useEffect(() => {
    if (!containerRef.current || !browserState.webviewCreated) return;

    const observer = new ResizeObserver(() => {
      if (viewRef.current !== "browser") return;
      if (activeTabRef.current !== projectPath) return;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => syncBounds(), 50);
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [projectPath, browserState.webviewCreated, syncBounds]);

  // Poll console logs from child webview every 500ms
  // Must be called from main thread (Tauri command) — WebView2 eval() crashes from bg threads
  useEffect(() => {
    if (!browserState.webviewCreated) return;
    let counter = 0;
    const interval = setInterval(() => {
      counter++;
      invoke("flush_browser_logs", {
        projectId: projectPath,
        counter,
      }).catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [projectPath, browserState.webviewCreated]);

  // Listen for browser events from Rust — filter by webview label
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    // We need to match events by label. Since we can't replicate the hash in JS,
    // we listen to all events but only this component's instance processes them
    // when it's the active project. Events include the label for disambiguation.
    // TODO: In future, pass projectId directly in event payload for cleaner filtering.

    unlisteners.push(
      listen<{ label: string; url: string }>("browser-navigated", (event) => {
        // Only process if this is the active project to avoid cross-project updates
        if (activeTabRef.current !== projectPath) return;
        setUrl(projectPath, event.payload.url);
      }),
    );

    unlisteners.push(
      listen<{ label: string; event: string; url: string }>(
        "browser-page-load",
        (event) => {
          if (activeTabRef.current !== projectPath) return;
          if (event.payload.event === "started") {
            setLoading(projectPath, true);
          } else if (event.payload.event === "finished") {
            setLoading(projectPath, false);
            setUrl(projectPath, event.payload.url);
          }
        },
      ),
    );

    unlisteners.push(
      listen<{ label: string; title: string }>(
        "browser-title-changed",
        (event) => {
          if (activeTabRef.current !== projectPath) return;
          setTitle(projectPath, event.payload.title);
        },
      ),
    );

    // Console log capture — relayed from child webview via Rust forward_console_log
    unlisteners.push(
      listen<{ label: string; level: string; message: string; timestamp: number; url: string }>(
        "browser-console",
        (event) => {
          // Only process logs from this project's webview (label-based filtering)
          if (activeTabRef.current !== projectPath) return;
          addLog(projectPath, {
            level: event.payload.level as ConsoleLog["level"],
            message: event.payload.message,
            timestamp: event.payload.timestamp,
            url: event.payload.url,
          });
        },
      ),
    );

    // Text selection capture — Ctrl+Shift+S in browser sends text to terminal
    unlisteners.push(
      listen<{ label: string; text: string; url: string }>(
        "browser-selection",
        async (event) => {
          if (activeTabRef.current !== projectPath) return;
          const sessionId = getActivePtySessionId(projectPath);
          if (!sessionId) return;
          try {
            await invoke("write_pty", {
              id: sessionId,
              data: event.payload.text,
            });
          } catch {
            // PTY may not exist
          }
        },
      ),
    );

    // Screenshot capture result — open annotation even if screenshot is blank
    unlisteners.push(
      listen<{ dataUrl: string }>("browser-screenshot-captured", (event) => {
        if (activeTabRef.current !== projectPath) return;
        // Open annotation with screenshot data, or blank canvas if capture failed
        openAnnotation(projectPath, event.payload.dataUrl || "");
      }),
    );

    return () => {
      unlisteners.forEach((u) => u.then((fn) => fn()));
    };
  }, [projectPath, setUrl, setLoading, setTitle, addLog, getActivePtySessionId, openAnnotation]);

  return (
    <div className="flex flex-col h-full w-full relative">
      <BrowserUrlBar projectPath={projectPath} />
      {/* Container div — native webview is overlaid on top of this area */}
      <div
        ref={containerRef}
        className="flex-1 bg-ctp-crust relative"
      >
        {!browserState.webviewCreated && (
          <div className="absolute inset-0 flex items-center justify-center text-ctp-overlay0 text-sm">
            Browser will load when activated
          </div>
        )}
      </div>
      {/* Console panel — shows captured console logs from embedded browser */}
      {browserState.webviewCreated && (
        <BrowserConsolePanel projectPath={projectPath} onOpenFeedback={() => setFeedbackOpen(true)} />
      )}
      {/* Annotation overlay — full-screen canvas over the browser view */}
      {browserState.annotationOpen && (
        <AnnotationOverlay projectPath={projectPath} />
      )}
      {/* Feedback composer modal */}
      {feedbackOpen && (
        <FeedbackComposer projectPath={projectPath} onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  );
});
