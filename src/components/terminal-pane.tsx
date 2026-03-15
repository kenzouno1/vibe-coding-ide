import { useEffect, useRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { usePty } from "@/hooks/use-pty";
import { setupImeHandler } from "@/hooks/use-ime-handler";
import { useAppStore } from "@/stores/app-store";
import { useProjectStore } from "@/stores/project-store";
import { usePaneStore } from "@/stores/pane-store";

import { XTERM_OPTIONS } from "@/utils/xterm-config";

/** Handle paste: uses Rust to read clipboard (supports both text and file paths) */
async function handlePaste(write: (data: string) => void) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const content = await invoke<string | null>("read_clipboard_files");
    if (content) write(content);
  } catch {
    // Fallback to browser API
    try {
      const text = await navigator.clipboard.readText();
      if (text) write(text);
    } catch {
      // ignore
    }
  }
}

interface TerminalPaneProps {
  projectPath: string;
  paneId: string;
  isActive?: boolean;
  onFocus?: () => void;
}

export const TerminalPane = memo(function TerminalPane({
  projectPath,
  paneId,
  isActive,
  onFocus,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useAppStore((s) => s.view);
  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const viewRef = useRef(view);
  viewRef.current = view;
  const activeTabRef = useRef(activeTabPath);
  activeTabRef.current = activeTabPath;

  const setPtySessionId = usePaneStore((s) => s.setPtySessionId);
  const markAiSession = usePaneStore((s) => s.markAiSession);
  const cwd = projectPath !== "." ? projectPath : undefined;

  // Patterns that indicate an AI CLI is running in this terminal
  const aiDetectedRef = useRef(false);
  const AI_PATTERNS = /claude[> ❯]|codex[> ❯]|╭─|claude-code|anthropic|openai codex/i;

  const { write, resize, sessionIdRef } = usePty((data) => {
    termRef.current?.write(data);
    // Detect AI CLI from terminal output (check first few outputs, then stop scanning)
    if (!aiDetectedRef.current && sessionIdRef.current && AI_PATTERNS.test(data)) {
      aiDetectedRef.current = true;
      markAiSession(sessionIdRef.current);
    }
  }, cwd);

  // Register PTY session ID in store when it becomes available
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionIdRef.current) {
        setPtySessionId(paneId, sessionIdRef.current);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [paneId, sessionIdRef, setPtySessionId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal(XTERM_OPTIONS);

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Defer initial fit — portal container may not have final layout
    // dimensions immediately after DOM insertion (especially with
    // the createElement + useLayoutEffect reparenting pattern).
    requestAnimationFrame(() => fitAddon.fit());

    // Setup IME composition handler — intercepts Vietnamese IME input
    // (backspace-replace method) and sends composed text to PTY correctly.
    const { state: imeState, cleanup: imeCleanup } = setupImeHandler(
      containerRef.current,
      write
    );

    // Send terminal data to PTY, but skip during IME composition
    // (composed text is sent via compositionend handler instead)
    term.onData((data) => {
      if (!imeState.composing) write(data);
    });

    // Handle copy (Ctrl+C) and block keys during IME
    term.attachCustomKeyEventHandler((e) => {
      // Block xterm key processing during IME composition
      if (imeState.composing) return false;
      if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      return true;
    });

    // Intercept paste event to use our custom clipboard handler (supports file paths).
    // This replaces xterm's built-in paste and prevents double-paste.
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      handlePaste(write);
    };
    containerRef.current.addEventListener("paste", onPaste, { capture: true });

    // Delayed initial resize — PTY might not be ready immediately.
    // Use rAF inside timeout to ensure layout is fully resolved.
    setTimeout(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        resize(term.rows, term.cols);
      });
    }, 300);

    // Re-render terminal when window regains focus (canvas content lost while hidden)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestAnimationFrame(() => {
          fitAddon.fit();
          resize(term.rows, term.cols);
          term.refresh(0, term.rows - 1);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const resizeObserver = new ResizeObserver(() => {
      // Skip resize when terminal is hidden
      if (viewRef.current !== "terminal") return;
      if (activeTabRef.current !== projectPath) return;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        fitAddon.fit();
        resize(term.rows, term.cols);
      }, 150);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      containerRef.current?.removeEventListener("paste", onPaste, { capture: true } as EventListenerOptions);
      imeCleanup();
      resizeObserver.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when this tab becomes visible or switching to terminal view
  useEffect(() => {
    const isVisible = view === "terminal" && activeTabPath === projectPath;
    if (isVisible && fitAddonRef.current && termRef.current) {
      // Use rAF to ensure container has correct dimensions after visibility change
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) {
          resize(termRef.current.rows, termRef.current.cols);
        }
      });
    }
  }, [view, activeTabPath, projectPath, resize]);

  useEffect(() => {
    if (isActive && activeTabPath === projectPath) termRef.current?.focus();
  }, [isActive, activeTabPath, projectPath]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${isActive ? "ring-1 ring-ctp-mauve" : ""}`}
      onClick={onFocus}
    />
  );
});
