import { useEffect, useRef, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { usePty } from "@/hooks/use-pty";
import { useAppStore } from "@/stores/app-store";
import { useProjectStore } from "@/stores/project-store";

const CATPPUCCIN_THEME = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  cursorAccent: "#1e1e2e",
  selectionBackground: "#585b70",
  selectionForeground: "#cdd6f4",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
};

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
  isActive?: boolean;
  onFocus?: () => void;
}

export const TerminalPane = memo(function TerminalPane({
  projectPath,
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

  const cwd = projectPath !== "." ? projectPath : undefined;

  const { write, resize } = usePty((data) => {
    termRef.current?.write(data);
  }, cwd);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: CATPPUCCIN_THEME,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 14,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => write(data));

    // Handle paste (Ctrl+V) and copy (Ctrl+C)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && e.key === "v") {
        handlePaste(write);
        return false;
      }
      if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      return true;
    });

    // Delayed initial resize — PTY might not be ready immediately
    setTimeout(() => {
      fitAddon.fit();
      resize(term.rows, term.cols);
    }, 500);

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
      resizeObserver.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when this tab becomes visible or switching to terminal view
  useEffect(() => {
    const isVisible = view === "terminal" && activeTabPath === projectPath;
    if (isVisible && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) {
          resize(termRef.current.rows, termRef.current.cols);
        }
      }, 50);
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
