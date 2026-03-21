import { useState, useCallback, memo } from "react";
import { X, Send } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useBrowserStore } from "@/stores/browser-store";
import { usePaneStore } from "@/stores/pane-store";

interface FeedbackComposerProps {
  paneId: string;
  projectPath: string;
  screenshotPath?: string | null;
  onClose: () => void;
}

export const FeedbackComposer = memo(function FeedbackComposer({
  paneId,
  projectPath,
  screenshotPath,
  onClose,
}: FeedbackComposerProps) {
  const browserState = useBrowserStore((s) => s.getState(paneId));
  const getActivePtySessionId = usePaneStore((s) => s.getActivePtySessionId);
  const getAiPtySessionId = usePaneStore((s) => s.getAiPtySessionId);
  const [notes, setNotes] = useState("");

  const errors = browserState.consoleLogs.filter((l) => l.level === "error");

  const sendFeedback = useCallback(async () => {
    const sessionId = getAiPtySessionId(projectPath) || getActivePtySessionId(projectPath);
    if (!sessionId) return;

    const lines: string[] = ["# Browser Feedback"];
    lines.push(`# URL: ${browserState.url}`);
    if (screenshotPath) {
      lines.push(`# Screenshot: ${screenshotPath}`);
    }
    if (errors.length > 0) {
      lines.push(`# Errors (${errors.length}):`);
      errors.slice(0, 10).forEach((e) => {
        lines.push(`#   - ${e.message.split("\n")[0]}`);
      });
    }
    if (notes.trim()) {
      lines.push(`# Notes: ${notes.trim()}`);
    }

    try {
      await invoke("write_pty", {
        id: sessionId,
        data: lines.join("\n") + "\n",
      });
      onClose();
    } catch (err) {
      console.error("Failed to send feedback:", err);
    }
  }, [projectPath, browserState.url, screenshotPath, errors, notes, getActivePtySessionId, onClose]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ctp-crust/80">
      <div className="bg-ctp-mantle border border-ctp-surface0 rounded-lg shadow-lg w-[480px] max-h-[400px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-ctp-surface0">
          <span className="text-sm font-medium text-ctp-text">Send Feedback to Terminal</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-xs">
          <div>
            <span className="text-ctp-overlay1">URL: </span>
            <span className="text-ctp-text">{browserState.url}</span>
          </div>
          {screenshotPath && (
            <div>
              <span className="text-ctp-overlay1">Screenshot: </span>
              <span className="text-ctp-green">{screenshotPath}</span>
            </div>
          )}
          {errors.length > 0 && (
            <div>
              <span className="text-ctp-overlay1">Errors ({errors.length}): </span>
              <ul className="mt-1 space-y-0.5">
                {errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="text-ctp-red truncate">- {e.message.split("\n")[0]}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <label className="text-ctp-overlay1 block mb-1">Notes:</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              className="w-full px-2 py-1.5 rounded bg-ctp-base border border-ctp-surface0 text-ctp-text text-xs
                         placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-mauve resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-2 border-t border-ctp-surface0">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-xs text-ctp-overlay1 hover:bg-ctp-surface0 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={sendFeedback}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-ctp-mauve text-ctp-base hover:opacity-90 transition-opacity"
          >
            <Send size={12} />
            Send to Terminal
          </button>
        </div>
      </div>
    </div>
  );
});
