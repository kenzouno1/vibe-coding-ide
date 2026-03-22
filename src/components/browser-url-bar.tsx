import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Loader2, Camera, Pin, Maximize2, PanelTop, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useBrowserStore, DEFAULT_BROWSER_STATE } from "@/stores/browser-store";
import { usePaneStore, collectLeafIds } from "@/stores/pane-store";
import { useProjectStore } from "@/stores/project-store";

interface BrowserUrlBarProps {
  paneId: string;
}

export function BrowserUrlBar({ paneId }: BrowserUrlBarProps) {
  const browserState = useBrowserStore((s) => s.states[paneId] ?? DEFAULT_BROWSER_STATE);
  const setUrl = useBrowserStore((s) => s.setUrl);
  const toggleFloatMode = useBrowserStore((s) => s.toggleFloatMode);
  const togglePinMode = useBrowserStore((s) => s.togglePinMode);
  const [inputValue, setInputValue] = useState(browserState.url);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value when URL changes from navigation events (H3 fix)
  useEffect(() => {
    // Don't overwrite if user is actively editing
    if (document.activeElement !== inputRef.current) {
      setInputValue(browserState.url);
    }
  }, [browserState.url]);

  const navigate = useCallback(
    async (url: string) => {
      // Add protocol if missing
      let normalizedUrl = url.trim();
      if (
        normalizedUrl &&
        !normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://") &&
        !normalizedUrl.startsWith("about:")
      ) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      if (!normalizedUrl) return;

      try {
        setUrl(paneId, normalizedUrl);
        setInputValue(normalizedUrl);
        await invoke("navigate_browser", {
          paneId,
          url: normalizedUrl,
        });
      } catch (err) {
        console.error("Navigation failed:", err);
      }
    },
    [paneId, setUrl],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        navigate(inputValue);
      }
    },
    [inputValue, navigate],
  );

  const goBack = useCallback(async () => {
    try {
      await invoke("browser_go_back", { paneId });
    } catch (err) {
      console.error("Go back failed:", err);
    }
  }, [paneId]);

  const goForward = useCallback(async () => {
    try {
      await invoke("browser_go_forward", { paneId });
    } catch (err) {
      console.error("Go forward failed:", err);
    }
  }, [paneId]);

  const reload = useCallback(async () => {
    try {
      await invoke("browser_reload", { paneId });
    } catch (err) {
      console.error("Reload failed:", err);
    }
  }, [paneId]);

  const openAnnotation = useBrowserStore((s) => s.openAnnotation);

  const captureScreenshot = useCallback(() => {
    // Open annotation canvas immediately (blank or with screenshot if capture succeeds)
    openAnnotation(paneId, "");
    // Try async capture — if successful, browser-screenshot-captured event updates background
    invoke("capture_browser_screenshot", { paneId }).catch(() => {});
  }, [paneId, openAnnotation]);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-ctp-mantle border-b border-ctp-surface0">
      {/* Navigation buttons */}
      <button
        onClick={goBack}
        title="Back"
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text disabled:opacity-30 disabled:cursor-default transition-colors"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        onClick={goForward}
        title="Forward"
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text disabled:opacity-30 disabled:cursor-default transition-colors"
      >
        <ArrowRight size={16} />
      </button>
      <button
        onClick={reload}
        title="Reload"
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
      >
        {browserState.isLoading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <RotateCw size={16} />
        )}
      </button>

      {/* URL input */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => e.target.select()}
        placeholder="Enter URL..."
        className="flex-1 px-3 py-1 rounded bg-ctp-base border border-ctp-surface0 text-ctp-text text-sm
                   placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-mauve transition-colors"
      />

      {/* Screenshot button */}
      <button
        onClick={captureScreenshot}
        title="Take screenshot"
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-mauve transition-colors"
      >
        <Camera size={16} />
      </button>

      {/* Float/dock toggle */}
      <button
        onClick={() => toggleFloatMode(paneId)}
        title={browserState.layoutMode === "float" ? "Dock browser" : "Undock browser"}
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
      >
        {browserState.layoutMode === "float" ? <PanelTop size={16} /> : <Maximize2 size={16} />}
      </button>

      {/* Pin toggle — keep visible across views */}
      <button
        onClick={() => togglePinMode(paneId)}
        title={browserState.layoutMode === "pinned" ? "Unpin browser" : "Pin browser (stay visible)"}
        className={`p-1.5 rounded hover:bg-ctp-surface0 transition-colors ${
          browserState.layoutMode === "pinned" ? "text-ctp-mauve" : "text-ctp-overlay1 hover:text-ctp-text"
        }`}
      >
        <Pin size={16} />
      </button>

      {/* Page title (truncated) */}
      {browserState.title && (
        <span className="text-xs text-ctp-overlay1 max-w-[200px] truncate" title={browserState.title}>
          {browserState.title}
        </span>
      )}

      {/* Close browser pane */}
      <button
        onClick={() => {
          const activeTabPath = useProjectStore.getState().activeTabPath;
          if (!activeTabPath) return;
          const tree = usePaneStore.getState().getTree(activeTabPath);
          if (collectLeafIds(tree).length <= 1) return;
          const { [paneId]: _, ...rest } = useBrowserStore.getState().states;
          useBrowserStore.setState({ states: rest });
          usePaneStore.getState().closePane(activeTabPath, paneId);
        }}
        title="Close browser pane (Ctrl+W)"
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-red transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}
