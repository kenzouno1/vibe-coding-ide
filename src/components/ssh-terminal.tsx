import { useEffect, useRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useSsh } from "@/hooks/use-ssh";
import { setupImeHandler } from "@/hooks/use-ime-handler";
import { useAppStore } from "@/stores/app-store";
import { XTERM_OPTIONS } from "@/utils/xterm-config";

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

    const term = new Terminal(XTERM_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // IME handler for Vietnamese input
    const { state: imeState, cleanup: imeCleanup } = setupImeHandler(
      containerRef.current,
      write,
    );

    // Forward keystrokes to SSH, skip during IME composition
    term.onData((data) => {
      if (!imeState.composing) write(data);
    });

    // Handle copy and block keys during IME
    term.attachCustomKeyEventHandler((e) => {
      if (imeState.composing) return false;
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

    // Delayed initial resize
    setTimeout(() => {
      fitAddon.fit();
      resize(term.rows, term.cols);
    }, 500);

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
      imeCleanup();
      resizeObserver.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when SSH view becomes visible
  useEffect(() => {
    if (view === "ssh" && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) {
          resize(termRef.current.rows, termRef.current.cols);
        }
      }, 50);
    }
  }, [view, resize]);

  return <div ref={containerRef} className="h-full w-full" />;
});
