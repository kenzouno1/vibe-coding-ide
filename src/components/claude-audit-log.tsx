import { useState, useEffect, memo } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ScrollText, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";

interface AuditEntry {
  timestamp_ms: number;
  session_id: string;
  command: string;
  status: string;
  duration_ms: number;
  output_preview: string;
}

const STATUS_COLORS: Record<string, string> = {
  ok: "text-ctp-green",
  timeout: "text-ctp-yellow",
  error: "text-ctp-red",
  denied: "text-ctp-maroon",
};

const MAX_DISPLAY = 20;

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hover:bg-ctp-surface0 rounded">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-0.5 text-[10px] text-left"
      >
        {open ? <ChevronDown size={8} className="shrink-0 text-ctp-overlay0" /> : <ChevronRight size={8} className="shrink-0 text-ctp-overlay0" />}
        <span className="text-ctp-overlay0 w-12 shrink-0">
          {new Date(entry.timestamp_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <span className={`w-12 shrink-0 font-medium ${STATUS_COLORS[entry.status] || "text-ctp-text"}`}>
          {entry.status}
        </span>
        <span className="text-ctp-overlay0 w-10 shrink-0 text-right">
          {entry.duration_ms}ms
        </span>
        <span className="text-ctp-subtext0 truncate">
          {entry.command.length > 60 ? entry.command.slice(0, 60) + "..." : entry.command}
        </span>
      </button>
      {open && (
        <div className="ml-5 mr-2 mb-1 space-y-1">
          <pre className="text-[9px] text-ctp-blue bg-ctp-crust rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
            $ {entry.command}
          </pre>
          {entry.output_preview && (
            <pre className="text-[9px] text-ctp-subtext0 bg-ctp-crust rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
              {entry.output_preview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export const ClaudeAuditLog = memo(function ClaudeAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    invoke<AuditEntry[]>("agent_get_audit_log", { count: MAX_DISPLAY })
      .then((data) => setEntries(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<AuditEntry>("agent-audit-entry", (e) => {
      setEntries((prev) => [e.payload, ...prev].slice(0, 50));
    }).then((u) => { unlisten = u; });
    return () => { unlisten?.(); };
  }, []);

  if (entries.length === 0) {
    return (
      <div className="px-3 py-1 text-[10px] text-ctp-overlay0 bg-ctp-mantle border-t border-ctp-surface0 flex items-center gap-1">
        <ScrollText size={10} /> No agent activity yet
      </div>
    );
  }

  return (
    <div className="bg-ctp-mantle border-t border-ctp-surface0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-1 flex items-center justify-between text-[10px] text-ctp-overlay0 hover:text-ctp-text transition-colors"
      >
        <span className="flex items-center gap-1">
          <ScrollText size={10} />
          Audit Log ({entries.length})
        </span>
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {expanded && (
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {entries.slice(0, MAX_DISPLAY).map((e, i) => (
            <AuditRow key={`${e.timestamp_ms}-${i}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
});
