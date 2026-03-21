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

interface BrowserPaneProps {
  projectPath: string;
  paneId: string;
  isActive?: boolean;
  onFocus?: () => void;
}

export const BrowserPane = memo(function BrowserPane({
  projectPath,
  paneId,
  isActive,
  onFocus,
}: BrowserPaneProps) {
  useServerDetect(paneId);

  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const creatingRef = useRef(false);

  const view = useAppStore((s) => s.view);
  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const browserState = useBrowserStore((s) => s.getState(paneId));
  const markWebviewCreated = useBrowserStore((s) => s.markWebviewCreated);
  const setUrl = useBrowserStore((s) => s.setUrl);
  const setLoading = useBrowserStore((s) => s.setLoading);
  const setTitle = useBrowserStore((s) => s.setTitle);
  const addLog = useBrowserStore((s) => s.addLog);
  const openAnnotation = useBrowserStore((s) => s.openAnnotation);
  const getActivePtySessionId = usePaneStore((s) => s.getActivePtySessionId);
  const getAiPtySessionId = usePaneStore((s) => s.getAiPtySessionId);

  const viewRef = useRef(view);
  viewRef.current = view;
  const activeTabRef = useRef(activeTabPath);
  activeTabRef.current = activeTabPath;

  const isVisible = view === "terminal" && activeTabPath === projectPath;

  // Send current container bounds to Rust for webview positioning
  const syncBounds = useCallback(async () => {
    if (!containerRef.current || !browserState.webviewCreated) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    try {
      await invoke("resize_browser_webview", {
        paneId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } catch {
      // Webview may not exist yet
    }
  }, [paneId, browserState.webviewCreated]);

  // Create webview on first render when visible
  useEffect(() => {
    if (!isVisible || browserState.webviewCreated || creatingRef.current || !containerRef.current) return;
    creatingRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const url = browserState.url || "about:blank";

    invoke("create_browser_webview", {
      paneId,
      url,
      x: rect.left,
      y: rect.top,
      width: Math.max(rect.width, 100),
      height: Math.max(rect.height, 100),
    })
      .then(() => markWebviewCreated(paneId))
      .catch((err) => console.error("Failed to create browser webview:", err))
      .finally(() => { creatingRef.current = false; });
  }, [isVisible, paneId, browserState.webviewCreated, browserState.url, markWebviewCreated]);

  // Show/hide webview based on visibility (pinned panes skip hide)
  useEffect(() => {
    if (!browserState.webviewCreated) return;
    const isPinned = browserState.layoutMode === "pinned";
    if (isVisible || isPinned) {
      invoke("show_browser_webview", { paneId })
        .then(() => syncBounds())
        .catch(() => {});
    } else {
      invoke("hide_browser_webview", { paneId }).catch(() => {});
    }
  }, [isVisible, paneId, browserState.webviewCreated, browserState.layoutMode, syncBounds]);

  // ResizeObserver to track container bounds
  useEffect(() => {
    if (!containerRef.current || !browserState.webviewCreated) return;
    const observer = new ResizeObserver(() => {
      if (viewRef.current !== "terminal") return;
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

  // Poll console logs every 500ms
  useEffect(() => {
    if (!browserState.webviewCreated) return;
    let counter = 0;
    const interval = setInterval(() => {
      counter++;
      invoke("flush_browser_logs", { paneId, counter }).catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [paneId, browserState.webviewCreated]);

  // Listen for browser events — filter by paneId
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<{ paneId: string; url: string }>("browser-navigated", (event) => {
        if (event.payload.paneId !== paneId) return;
        setUrl(paneId, event.payload.url);
      }),
    );

    unlisteners.push(
      listen<{ paneId: string; event: string; url: string }>("browser-page-load", (event) => {
        if (event.payload.paneId !== paneId) return;
        if (event.payload.event === "started") {
          setLoading(paneId, true);
        } else if (event.payload.event === "finished") {
          setLoading(paneId, false);
          setUrl(paneId, event.payload.url);
        }
      }),
    );

    unlisteners.push(
      listen<{ paneId: string; title: string }>("browser-title-changed", (event) => {
        if (event.payload.paneId !== paneId) return;
        setTitle(paneId, event.payload.title);
      }),
    );

    unlisteners.push(
      listen<{ paneId: string; level: string; message: string; timestamp: number; url: string }>(
        "browser-console",
        (event) => {
          if (event.payload.paneId !== paneId) return;
          addLog(paneId, {
            level: event.payload.level as ConsoleLog["level"],
            message: event.payload.message,
            timestamp: event.payload.timestamp,
            url: event.payload.url,
          });
        },
      ),
    );

    unlisteners.push(
      listen<{ paneId: string; text: string }>("browser-selection", async (event) => {
        if (event.payload.paneId !== paneId) return;
        const sessionId = getAiPtySessionId(projectPath) || getActivePtySessionId(projectPath);
        if (!sessionId) return;
        try {
          await invoke("write_pty", { id: sessionId, data: event.payload.text });
        } catch { /* PTY may not exist */ }
      }),
    );

    unlisteners.push(
      listen<{ dataUrl: string }>("browser-screenshot-captured", (event) => {
        if (activeTabRef.current !== projectPath) return;
        openAnnotation(paneId, event.payload.dataUrl || "");
      }),
    );

    return () => { unlisteners.forEach((u) => u.then((fn) => fn())); };
  }, [paneId, projectPath, setUrl, setLoading, setTitle, addLog, getActivePtySessionId, getAiPtySessionId, openAnnotation]);

  // Destroy webview on unmount (pane closed)
  useEffect(() => {
    return () => {
      invoke("destroy_browser_webview", { paneId }).catch(() => {});
    };
  }, [paneId]);

  return (
    <div
      className="flex flex-col h-full w-full relative"
      onMouseDown={onFocus}
      data-pane-active={isActive}
    >
      <BrowserUrlBar paneId={paneId} />
      <div ref={containerRef} className="flex-1 bg-ctp-crust relative">
        {!browserState.webviewCreated && (
          <div className="absolute inset-0 flex items-center justify-center text-ctp-overlay0 text-sm">
            Browser will load when activated
          </div>
        )}
      </div>
      {browserState.webviewCreated && (
        <BrowserConsolePanel paneId={paneId} projectPath={projectPath} onOpenFeedback={() => setFeedbackOpen(true)} />
      )}
      {browserState.annotationOpen && (
        <AnnotationOverlay paneId={paneId} projectPath={projectPath} />
      )}
      {feedbackOpen && (
        <FeedbackComposer paneId={paneId} projectPath={projectPath} onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  );
});
