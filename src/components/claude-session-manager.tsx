import { memo, useState, useRef, useEffect, useCallback } from "react";
import { History, Plus, Trash2, MessageSquare } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useClaudeStore } from "@/stores/claude-store";

interface CliSession {
  id: string;
  title: string;
  timestamp: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

interface Props {
  paneId: string;
  projectPath: string;
  currentSessionId: string | null;
}

export const ClaudeSessionManager = memo(function ClaudeSessionManager({
  paneId,
  projectPath,
  currentSessionId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<CliSession[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const newSession = useClaudeStore((s) => s.newSession);
  const resumeSavedSession = useClaudeStore((s) => s.resumeSavedSession);

  // Fetch sessions from Claude Code's storage when dropdown opens
  useEffect(() => {
    if (!open) return;
    invoke<CliSession[]>("claude_list_sessions", { projectPath })
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [open, projectPath]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleResume = useCallback(
    (sessionId: string) => {
      resumeSavedSession(paneId, sessionId);
      setOpen(false);
    },
    [paneId, resumeSavedSession],
  );

  const handleNew = useCallback(() => {
    newSession(paneId);
    setOpen(false);
  }, [paneId, newSession]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Session history"
        className="p-0.5 rounded text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
      >
        <History size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-72 bg-ctp-mantle border border-ctp-surface1
                     rounded-lg shadow-lg z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-ctp-surface0 flex items-center justify-between">
            <span className="text-xs font-medium text-ctp-subtext0">Sessions</span>
            <button
              onClick={handleNew}
              className="flex items-center gap-1 text-[10px] text-ctp-mauve hover:text-ctp-text
                         transition-colors cursor-pointer"
            >
              <Plus size={10} />
              New
            </button>
          </div>

          {/* Session list */}
          <div className="max-h-56 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-ctp-overlay0 text-center">No sessions found</p>
            ) : (
              sessions.map((s) => {
                const isCurrent = s.id === currentSessionId;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
                      ${isCurrent
                        ? "bg-ctp-surface0/50 text-ctp-text"
                        : "hover:bg-ctp-surface0/30 text-ctp-subtext1 cursor-pointer"
                      }`}
                    onClick={() => !isCurrent && handleResume(s.id)}
                  >
                    <MessageSquare
                      size={10}
                      className={`shrink-0 ${isCurrent ? "text-ctp-mauve" : "text-ctp-overlay0"}`}
                    />
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-[10px] text-ctp-overlay0 shrink-0">
                      {timeAgo(s.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});
