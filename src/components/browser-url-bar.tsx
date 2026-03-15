import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Loader2, Camera, PanelTop, Maximize2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useBrowserStore } from "@/stores/browser-store";

interface BrowserUrlBarProps {
  projectPath: string;
}

export function BrowserUrlBar({ projectPath }: BrowserUrlBarProps) {
  const browserState = useBrowserStore((s) => s.getState(projectPath));
  const setUrl = useBrowserStore((s) => s.setUrl);
  const toggleLayoutMode = useBrowserStore((s) => s.toggleLayoutMode);
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
        setUrl(projectPath, normalizedUrl);
        setInputValue(normalizedUrl);
        await invoke("navigate_browser", {
          projectId: projectPath,
          url: normalizedUrl,
        });
      } catch (err) {
        console.error("Navigation failed:", err);
      }
    },
    [projectPath, setUrl],
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
      await invoke("browser_go_back", { projectId: projectPath });
    } catch (err) {
      console.error("Go back failed:", err);
    }
  }, [projectPath]);

  const goForward = useCallback(async () => {
    try {
      await invoke("browser_go_forward", { projectId: projectPath });
    } catch (err) {
      console.error("Go forward failed:", err);
    }
  }, [projectPath]);

  const reload = useCallback(async () => {
    try {
      await invoke("browser_reload", { projectId: projectPath });
    } catch (err) {
      console.error("Reload failed:", err);
    }
  }, [projectPath]);

  const openAnnotation = useBrowserStore((s) => s.openAnnotation);

  const captureScreenshot = useCallback(() => {
    // Open annotation canvas immediately (blank or with screenshot if capture succeeds)
    openAnnotation(projectPath, "");
    // Try async capture — if successful, browser-screenshot-captured event updates background
    invoke("capture_browser_screenshot", { projectId: projectPath }).catch(() => {});
  }, [projectPath, openAnnotation]);

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
        onClick={() => toggleLayoutMode(projectPath)}
        title={browserState.layoutMode === "docked" ? "Float browser" : "Dock browser"}
        className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
      >
        {browserState.layoutMode === "docked" ? <Maximize2 size={16} /> : <PanelTop size={16} />}
      </button>

      {/* Page title (truncated) */}
      {browserState.title && (
        <span className="text-xs text-ctp-overlay1 max-w-[200px] truncate" title={browserState.title}>
          {browserState.title}
        </span>
      )}
    </div>
  );
}
