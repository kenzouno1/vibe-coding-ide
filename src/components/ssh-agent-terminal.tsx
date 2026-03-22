import { useEffect, useRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { usePty } from "@/hooks/use-pty";
import { useAppStore } from "@/stores/app-store";
import { getXtermOptions } from "@/utils/xterm-config";

/**
 * Local terminal panel embedded in SSH view.
 * Runs in ~/.devtools/agent-workspace which contains CLAUDE.md
 * with instructions for AI agents to connect to SSH WS server.
 */
export const SshAgentTerminal = memo(function SshAgentTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useAppStore((s) => s.view);
  const viewRef = useRef(view);
  viewRef.current = view;

  const { write, resize } = usePty((data) => {
    termRef.current?.write(data);
  }, undefined); // Uses default CWD; auto-cd handled below

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal(getXtermOptions());
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Defer initial fit — container may not have final layout dimensions
    // immediately after mount (flex layout still settling).
    requestAnimationFrame(() => fitAddon.fit());

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      write(data);
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (e.type === "keydown" && e.ctrlKey && e.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text) write(text);
        });
        return false;
      }
      return true;
    });

    setTimeout(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        resize(term.rows, term.cols);
        // Auto-cd to agent workspace where CLAUDE.md lives
        const isWindows = navigator.platform.startsWith("Win");
        if (isWindows) {
          write("cd /d %USERPROFILE%\\.devtools\\agent-workspace && cls\r");
        } else {
          write("cd ~/.devtools/agent-workspace && clear\r");
        }
      });
    }, 800);

    // Re-render terminal when window regains focus (canvas content lost while hidden).
    // visibilitychange covers minimize/restore; window focus covers alt-tab
    // (Tauri desktop windows don't change visibilityState on alt-tab).
    const refreshTerminal = () => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        resize(term.rows, term.cols);
        term.refresh(0, term.rows - 1);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshTerminal();
    };
    const onWindowFocus = () => refreshTerminal();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    const resizeObserver = new ResizeObserver(() => {
      if (viewRef.current !== "ssh") return;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        fitAddon.fit();
        resize(term.rows, term.cols);
      }, 150);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      resizeObserver.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === "ssh" && fitAddonRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) {
          resize(termRef.current.rows, termRef.current.cols);
          termRef.current.refresh(0, termRef.current.rows - 1);
        }
      });
    }
  }, [view, resize]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-3 py-1 border-b border-ctp-surface0 bg-ctp-mantle">
        <span className="text-xs font-semibold text-ctp-overlay1 uppercase tracking-wider">
          AI Agent Terminal
        </span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
});
