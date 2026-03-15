import { useEffect, useRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { usePty } from "@/hooks/use-pty";
import { setupImeHandler } from "@/hooks/use-ime-handler";
import { useAppStore } from "@/stores/app-store";
import { XTERM_OPTIONS } from "@/utils/xterm-config";

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

    const term = new Terminal(XTERM_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const { state: imeState, cleanup: imeCleanup } = setupImeHandler(
      containerRef.current,
      write,
    );

    term.onData((data) => {
      if (!imeState.composing) write(data);
    });

    term.attachCustomKeyEventHandler((e) => {
      if (imeState.composing) return false;
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
      fitAddon.fit();
      resize(term.rows, term.cols);
      // Auto-cd to agent workspace where CLAUDE.md lives
      // Detect OS: cmd.exe uses %USERPROFILE%, bash/zsh uses ~
      const isWindows = navigator.platform.startsWith("Win");
      if (isWindows) {
        write("cd /d %USERPROFILE%\\.devtools\\agent-workspace && cls\r");
      } else {
        write("cd ~/.devtools/agent-workspace && clear\r");
      }
    }, 800);

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

  useEffect(() => {
    if (view === "ssh" && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) resize(termRef.current.rows, termRef.current.cols);
      }, 50);
    }
  }, [view, resize]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-3 py-1 border-b border-ctp-surface0 bg-ctp-mantle">
        <span className="text-xs font-semibold text-ctp-overlay1 uppercase tracking-wider">
          AI Agent Terminal
        </span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
});
