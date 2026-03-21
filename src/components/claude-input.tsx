import { memo, useCallback, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Send, Square, Paperclip } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { StreamStatus, Attachment } from "@/stores/claude-store";
import type { SlashCommand } from "@/data/slash-commands";
import { filterCommands } from "@/data/slash-commands";
import { SlashCommandDropdown } from "@/components/slash-command-dropdown";
import { ClaudeAttachmentChips } from "@/components/claude-attachment-chips";

/** MIME type from file extension */
function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
    txt: "text/plain", md: "text/markdown", ts: "text/typescript",
    js: "text/javascript", json: "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

interface ClaudeInputProps {
  status: StreamStatus;
  onSend: (message: string) => void;
  onCancel: () => void;
  /** Handle a local slash command (e.g. /clear, /model sonnet) */
  onSlashCommand: (command: SlashCommand, args: string) => void;
  /** Current attachments */
  attachments: Attachment[];
  /** Add an attachment */
  onAddAttachment: (attachment: Attachment) => void;
  /** Remove an attachment by path */
  onRemoveAttachment: (path: string) => void;
}

export const ClaudeInput = memo(function ClaudeInput({
  status,
  onSend,
  onCancel,
  onSlashCommand,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
}: ClaudeInputProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status === "streaming";

  // Input history (up/down arrow to recall previous messages)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  /** Save clipboard/dropped file to temp dir and add as attachment */
  const saveFileAttachment = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(buffer));
      const path = await invoke<string>("claude_save_temp_file", {
        filename: file.name,
        data,
      });
      onAddAttachment({ path, name: file.name, mimeType: file.type || mimeFromName(file.name) });
    },
    [onAddAttachment],
  );

  /** Handle Ctrl+V paste with images */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      // Only intercept if clipboard has files (images)
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/") || file.type === "application/pdf") {
          e.preventDefault();
          saveFileAttachment(file);
        }
      }
    },
    [saveFileAttachment],
  );

  /** Handle drag-and-drop files */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        saveFileAttachment(file);
      }
    },
    [saveFileAttachment],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  /** Open native file picker */
  const handleFilePick = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
        { name: "Documents", extensions: ["pdf", "txt", "md"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const filePath of paths) {
      const name = filePath.split(/[/\\]/).pop() ?? "file";
      onAddAttachment({ path: filePath, name, mimeType: mimeFromName(name) });
    }
  }, [onAddAttachment]);

  // Slash command dropdown state
  const [showDropdown, setShowDropdown] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const filteredCommands = showDropdown ? filterCommands(slashQuery) : [];

  const dismissDropdown = useCallback(() => {
    setShowDropdown(false);
    setSlashQuery("");
    setSelectedIndex(0);
  }, []);

  const handleCommandSelect = useCallback(
    (cmd: SlashCommand) => {
      const textarea = textRef.current;
      if (!textarea) return;

      if (cmd.category === "skill" || cmd.category === "global" || cmd.category === "project") {
        // Skills and discovered commands: fill name as prompt text, ready to edit/send
        textarea.value = `${cmd.name} `;
        textarea.focus();
      } else {
        // Local or mapped: extract args after command name and dispatch
        const fullText = textarea.value.trim();
        const args = fullText.replace(/^\/\S*\s*/, "");
        textarea.value = "";
        onSlashCommand(cmd, args);
      }
      dismissDropdown();
    },
    [onSlashCommand, dismissDropdown],
  );

  const handleSubmit = useCallback(() => {
    const text = textRef.current?.value.trim();
    if (!text || isStreaming) return;

    // Push to input history (max 50 entries)
    historyRef.current = [text, ...historyRef.current.slice(0, 49)];
    historyIndexRef.current = -1;

    // Check if submitting a slash command directly (typed full command + Enter)
    if (text.startsWith("/")) {
      const parts = text.slice(1).split(/\s+/);
      const cmdName = parts[0];
      const args = parts.slice(1).join(" ");
      const commands = filterCommands(cmdName);
      const exact = commands.find((c) => c.name === cmdName);
      if (exact) {
        if (exact.category === "skill" || exact.category === "global" || exact.category === "project") {
          // Skills and discovered commands: send as regular prompt without / prefix
          onSend(text.slice(1));
        } else {
          onSlashCommand(exact, args);
        }
        if (textRef.current) textRef.current.value = "";
        dismissDropdown();
        return;
      }
    }

    onSend(text);
    if (textRef.current) textRef.current.value = "";
    dismissDropdown();
  }, [isStreaming, onSend, onSlashCommand, dismissDropdown]);

  const handleInput = useCallback(() => {
    const value = textRef.current?.value ?? "";
    // Show dropdown when input starts with / and is on a single line
    if (value.startsWith("/") && !value.includes("\n")) {
      const query = value.slice(1).split(/\s/)[0]; // First word after /
      setSlashQuery(query);
      setShowDropdown(true);
      setSelectedIndex(0);
    } else {
      dismissDropdown();
    }
  }, [dismissDropdown]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+L → clear conversation
      if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        const clearCmd = { name: "clear", description: "", category: "local" as const };
        onSlashCommand(clearCmd, "");
        return;
      }

      // Dropdown navigation
      if (showDropdown && filteredCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          handleCommandSelect(filteredCommands[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          dismissDropdown();
          return;
        }
      }

      // Input history navigation (when not in dropdown)
      if (!showDropdown && textRef.current) {
        const textarea = textRef.current;
        const isEmpty = !textarea.value;
        if (e.key === "ArrowUp" && (isEmpty || historyIndexRef.current >= 0)) {
          const nextIdx = Math.min(historyIndexRef.current + 1, historyRef.current.length - 1);
          if (nextIdx >= 0 && nextIdx < historyRef.current.length) {
            e.preventDefault();
            historyIndexRef.current = nextIdx;
            textarea.value = historyRef.current[nextIdx];
          }
          return;
        }
        if (e.key === "ArrowDown" && historyIndexRef.current >= 0) {
          e.preventDefault();
          const nextIdx = historyIndexRef.current - 1;
          historyIndexRef.current = nextIdx;
          textarea.value = nextIdx >= 0 ? historyRef.current[nextIdx] : "";
          return;
        }
      }

      // Normal submit (Enter or Ctrl+Enter)
      if (e.key === "Enter" && (!e.shiftKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showDropdown, filteredCommands, selectedIndex, handleCommandSelect, dismissDropdown, handleSubmit, onSlashCommand],
  );

  return (
    <div
      className="border-t border-ctp-surface0 bg-ctp-mantle"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Attachment chips */}
      <ClaudeAttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />

      <div className="relative flex items-end gap-2 p-3 pt-1">
        {/* Slash command dropdown */}
        {showDropdown && (
          <SlashCommandDropdown
            commands={filteredCommands}
            selectedIndex={selectedIndex}
            onSelect={handleCommandSelect}
          />
        )}

        {/* File picker button */}
        <button
          onClick={handleFilePick}
          disabled={isStreaming}
          title="Attach file (image, PDF, text)"
          className="p-2 rounded-lg text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0
                     transition-colors disabled:opacity-50"
        >
          <Paperclip size={16} />
        </button>

        <TextareaAutosize
          ref={textRef}
          placeholder="Ask Claude... (/ for commands)"
          disabled={isStreaming}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          minRows={1}
          maxRows={8}
          className="flex-1 resize-none bg-ctp-surface0 text-ctp-text rounded-lg px-3 py-2
                     text-sm placeholder:text-ctp-overlay0 border border-ctp-surface1
                     focus:outline-none focus:border-ctp-mauve disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            title="Cancel"
            className="p-2 rounded-lg bg-ctp-red text-ctp-base hover:bg-ctp-red/80 transition-colors"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            title="Send (Enter)"
            className="p-2 rounded-lg bg-ctp-mauve text-ctp-base hover:bg-ctp-mauve/80 transition-colors"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
});
