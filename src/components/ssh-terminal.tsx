import { useEffect, useRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useSsh } from "@/hooks/use-ssh";
import { useAppStore } from "@/stores/app-store";
import { useSettingsStore } from "@/stores/settings-store";
import { getXtermOptions } from "@/utils/xterm-config";

interface SshTerminalProps {
  sessionId: string;
  channelId: string;
}

export const SshTerminal = memo(function SshTerminal({
  sessionId,
  channelId,
}: SshTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useAppStore((s) => s.view);
  const viewRef = useRef(view);
  viewRef.current = view;

  console.log("[ssh-terminal] Rendering with sessionId:", sessionId, "channelId:", channelId);
  const { write, resize } = useSsh(sessionId, channelId, (data) => {
    console.log("[ssh-terminal] Got data, len:", data.length, "termRef:", !!termRef.current);
    termRef.current?.write(data);
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal(getXtermOptions());
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Multiple fit attempts — container may have 0 size initially
    // due to visibility toggling and flex layout settling
    requestAnimationFrame(() => fitAddon.fit());
    setTimeout(() => fitAddon.fit(), 100);
    setTimeout(() => fitAddon.fit(), 500);
    setTimeout(() => {
      fitAddon.fit();
      resize(term.rows, term.cols);
    }, 1000);

    term.onData((data) => {
      write(data);
    });

    // Handle copy (Ctrl+C) and paste (Ctrl+V)
    term.attachCustomKeyEventHandler((e) => {
      if (
        e.type === "keydown" &&
        e.ctrlKey &&
        e.key === "c" &&
        term.hasSelection()
      ) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      // Paste via Ctrl+V
      if (e.type === "keydown" && e.ctrlKey && e.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text) write(text);
        });
        return false;
      }
      return true;
    });

    // Delayed initial resize — use rAF to ensure layout is resolved
    setTimeout(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        resize(term.rows, term.cols);
      });
    }, 300);

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

  // Apply terminal settings changes in real-time
  const termSettings = useSettingsStore((s) => s.terminal);
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = termSettings.fontFamily;
    term.options.fontSize = termSettings.fontSize;
    term.options.cursorBlink = termSettings.cursorBlink;
    term.options.cursorStyle = termSettings.cursorStyle;
    term.options.scrollback = termSettings.scrollback;
    fitAddonRef.current?.fit();
  }, [termSettings]);

  // Re-fit when SSH view becomes visible
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

  return <div ref={containerRef} className="h-full w-full" />;
});
