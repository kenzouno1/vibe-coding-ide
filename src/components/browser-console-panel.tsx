import { useEffect, useRef, useCallback, memo } from "react";
import { Trash2, ChevronDown, ChevronUp, ArrowRight, Send } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  useBrowserStore,
  DEFAULT_BROWSER_STATE,
  type ConsoleLog,
  type ConsoleFilter,
} from "@/stores/browser-store";
import { usePaneStore } from "@/stores/pane-store";

const LEVEL_COLORS: Record<ConsoleLog["level"], string> = {
  error: "text-ctp-red",
  warn: "text-ctp-yellow",
  info: "text-ctp-blue",
  log: "text-ctp-overlay1",
};

const LEVEL_BG: Record<ConsoleLog["level"], string> = {
  error: "bg-ctp-red/10",
  warn: "bg-ctp-yellow/10",
  info: "",
  log: "",
};

const FILTER_OPTIONS: { value: ConsoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warn", label: "Warnings" },
  { value: "info", label: "Info" },
  { value: "log", label: "Log" },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

interface ConsoleLogEntryProps {
  log: ConsoleLog;
  onSend?: (text: string) => void;
}

const ConsoleLogEntry = memo(function ConsoleLogEntry({ log, onSend }: ConsoleLogEntryProps) {
  return (
    <div
      className={`flex gap-2 px-2 py-0.5 text-xs font-mono border-b border-ctp-surface0/50 group ${LEVEL_BG[log.level]}`}
    >
      <span className="text-ctp-overlay0 shrink-0 w-[85px]">
        {formatTime(log.timestamp)}
      </span>
      <span className={`shrink-0 w-[42px] uppercase font-semibold ${LEVEL_COLORS[log.level]}`}>
        {log.level}
      </span>
      <span className="text-ctp-text whitespace-pre-wrap break-all flex-1">
        {log.message}
      </span>
      {onSend && (
        <button
          onClick={() => onSend(`# [Browser ${log.level.toUpperCase()}] ${log.message}`)}
          className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-ctp-surface0 text-ctp-overlay0 hover:text-ctp-mauve transition-all"
          title="Send to terminal"
        >
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
});

interface BrowserConsolePanelProps {
  paneId: string;
  projectPath: string;
  onOpenFeedback?: () => void;
}

export const BrowserConsolePanel = memo(function BrowserConsolePanel({
  paneId,
  projectPath,
  onOpenFeedback,
}: BrowserConsolePanelProps) {
  const browserState = useBrowserStore((s) => s.states[paneId] ?? DEFAULT_BROWSER_STATE);
  const clearLogs = useBrowserStore((s) => s.clearLogs);
  const setConsoleFilter = useBrowserStore((s) => s.setConsoleFilter);
  const toggleConsolePanel = useBrowserStore((s) => s.toggleConsolePanel);
  const getActivePtySessionId = usePaneStore((s) => s.getActivePtySessionId);
  const getAiPtySessionId = usePaneStore((s) => s.getAiPtySessionId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const { consoleLogs, consoleFilter, consolePanelOpen } = browserState;

  // Send text to AI terminal (claude/codex), fallback to active terminal
  const sendToTerminal = useCallback(
    async (text: string) => {
      const sessionId = getAiPtySessionId(projectPath) || getActivePtySessionId(projectPath);
      if (!sessionId) return;
      try {
        await invoke("write_pty", { id: sessionId, data: text + "\n" });
      } catch (err) {
        console.error("Failed to send to terminal:", err);
      }
    },
    [projectPath, getActivePtySessionId],
  );

  // Send all error logs to terminal
  const sendAllErrors = useCallback(() => {
    const errors = consoleLogs.filter((l) => l.level === "error");
    if (errors.length === 0) return;
    const text = errors
      .map((e) => `# [Browser ERROR] ${e.message}`)
      .join("\n");
    sendToTerminal(text);
  }, [consoleLogs, sendToTerminal]);

  // Filter logs based on selected filter
  const filteredLogs =
    consoleFilter === "all"
      ? consoleLogs
      : consoleLogs.filter((l) => l.level === consoleFilter);

  // Count errors/warnings for badge
  const errorCount = consoleLogs.filter((l) => l.level === "error").length;
  const warnCount = consoleLogs.filter((l) => l.level === "warn").length;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 20;
  }, []);

  return (
    <div className="flex flex-col border-t border-ctp-surface0 bg-ctp-mantle">
      {/* Console toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-ctp-surface0">
        <button
          onClick={() => toggleConsolePanel(paneId)}
          className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
          title={consolePanelOpen ? "Collapse console" : "Expand console"}
        >
          {consolePanelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        <span className="text-xs text-ctp-overlay1 font-medium">Console</span>

        {/* Error/warn badges */}
        {errorCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ctp-red/20 text-ctp-red font-semibold">
            {errorCount}
          </span>
        )}
        {warnCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ctp-yellow/20 text-ctp-yellow font-semibold">
            {warnCount}
          </span>
        )}

        <div className="flex-1" />

        {/* Filter buttons */}
        {consolePanelOpen && (
          <div className="flex gap-0.5">
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setConsoleFilter(paneId, value)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  consoleFilter === value
                    ? "bg-ctp-surface1 text-ctp-text"
                    : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Send all errors to terminal */}
        {consolePanelOpen && errorCount > 0 && (
          <button
            onClick={sendAllErrors}
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-mauve transition-colors"
            title="Send all errors to terminal"
          >
            <Send size={10} />
            <span>Send Errors</span>
          </button>
        )}

        {/* Quick feedback button */}
        {consolePanelOpen && onOpenFeedback && (
          <button
            onClick={onOpenFeedback}
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-green transition-colors"
            title="Send feedback to terminal"
          >
            <Send size={10} />
            <span>Feedback</span>
          </button>
        )}

        {/* Clear button */}
        <button
          onClick={() => clearLogs(paneId)}
          className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
          title="Clear console"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Log entries */}
      {consolePanelOpen && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[150px] overflow-y-auto overflow-x-hidden"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-ctp-overlay0">
              No console output
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <ConsoleLogEntry key={`${log.timestamp}-${i}`} log={log} onSend={sendToTerminal} />
            ))
          )}
        </div>
      )}
    </div>
  );
});
