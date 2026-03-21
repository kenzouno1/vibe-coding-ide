import { useEffect, useCallback, useState, memo } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Bot, AlertTriangle, X, DollarSign } from "lucide-react";
import { useClaudeStore, type ClaudePaneState, type ChatMessage } from "@/stores/claude-store";
import { usePaneStore } from "@/stores/pane-store";
import { useProjectStore } from "@/stores/project-store";
import { ClaudeMessageList } from "@/components/claude-message-list";
import { ClaudeInput } from "@/components/claude-input";
import type { SlashCommand } from "@/data/slash-commands";
import { discoverCommands } from "@/data/slash-commands";
import { ClaudeHeaderControls } from "@/components/claude-header-controls";
import { ClaudeSessionManager } from "@/components/claude-session-manager";
import { ClaudeAuditLog } from "@/components/claude-audit-log";

/** Stable default for selector — avoids infinite re-render from new object each time */
const EMPTY_STATE: ClaudePaneState = {
  messages: [], status: "idle", claudeSessionId: null, error: null,
  totalCostUsd: 0, modelOverride: null, permissionMode: null, attachments: [],
  modelName: null, tokenUsage: null,
};

interface ClaudeStreamPayload { session_id: string; line: string }
interface ClaudeCompletePayload { session_id: string; exit_code: number | null }

interface ClaudeChatPaneProps {
  projectPath: string;
  paneId: string;
  isActive?: boolean;
  onFocus?: () => void;
  /** Override default close behavior (default: remove pane from terminal tree) */
  onClose?: () => void;
}

export const ClaudeChatPane = memo(function ClaudeChatPane({
  projectPath,
  paneId,
  isActive,
  onFocus,
  onClose: onCloseOverride,
}: ClaudeChatPaneProps) {
  const state = useClaudeStore((s) => s.states[paneId] ?? EMPTY_STATE);
  const ensureState = useClaudeStore((s) => s.ensureState);
  const sendMessage = useClaudeStore((s) => s.sendMessage);
  const cancelMessage = useClaudeStore((s) => s.cancelMessage);
  const handleStreamLine = useClaudeStore((s) => s.handleStreamLine);
  const handleComplete = useClaudeStore((s) => s.handleComplete);
  const clearMessages = useClaudeStore((s) => s.clearMessages);
  const newSession = useClaudeStore((s) => s.newSession);
  const setModelOverride = useClaudeStore((s) => s.setModelOverride);
  const setPermissionMode = useClaudeStore((s) => s.setPermissionMode);
  const closePane = usePaneStore((s) => s.closePane);
  const activeTabPath = useProjectStore((s) => s.activeTabPath);

  const [installed, setInstalled] = useState<boolean | null>(null);
  const [showCostToast, setShowCostToast] = useState(false);

  // Initialize store state + auto-resume most recent session
  useEffect(() => {
    ensureState(paneId);
    // If no session ID yet, load the most recent one from Claude Code's storage
    const st = useClaudeStore.getState().states[paneId];
    if (!st?.claudeSessionId && projectPath) {
      invoke<{ id: string; title: string; timestamp: number }[]>("claude_list_sessions", { projectPath })
        .then((sessions) => {
          if (sessions.length > 0) {
            useClaudeStore.getState().resumeSavedSession(paneId, sessions[0].id);
          }
        })
        .catch(() => {});
    }
  }, [paneId, ensureState, projectPath]);

  // Check if claude CLI is installed + discover slash commands
  useEffect(() => {
    invoke<boolean>("claude_check_installed")
      .then(setInstalled)
      .catch(() => setInstalled(false));
    // Discover commands from ~/.claude/commands/ and .claude/commands/
    discoverCommands(projectPath);
  }, [projectPath]);

  // Tauri event listeners
  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    listen<ClaudeStreamPayload>("claude-stream", (e) => {
      if (e.payload.session_id === paneId) handleStreamLine(paneId, e.payload.line);
    }).then((u) => unlisteners.push(u));
    listen<ClaudeCompletePayload>("claude-complete", (e) => {
      if (e.payload.session_id === paneId) handleComplete(paneId);
    }).then((u) => unlisteners.push(u));
    return () => unlisteners.forEach((u) => u());
  }, [paneId, handleStreamLine, handleComplete]);

  const handleSend = useCallback(
    (text: string) => sendMessage(paneId, projectPath, text),
    [paneId, projectPath, sendMessage],
  );

  const handleCancel = useCallback(
    () => cancelMessage(paneId),
    [paneId, cancelMessage],
  );

  /** Handle local and mapped slash commands */
  const handleSlashCommand = useCallback(
    (cmd: SlashCommand, args: string) => {
      switch (cmd.name) {
        case "clear":
          clearMessages(paneId);
          break;
        case "new":
          newSession(paneId);
          break;
        case "cost":
          setShowCostToast(true);
          setTimeout(() => setShowCostToast(false), 3000);
          break;
        case "help": {
          // Inject a help message into the chat
          const helpText = [
            "**Available Commands**",
            "",
            "**Built-in:** `/clear` `/new` `/cost` `/help`",
            "**Config:** `/model <name>` `/compact` `/plan` `/resume`",
            "**Skills:** `/fix` `/test` `/commit` `/review` `/refactor` `/debug` `/docs` `/explain` `/architect` `/pr` `/security-review` and more",
            "",
            "**Shortcuts:** `Ctrl+L` clear | `Ctrl+Enter` send | `Up/Down` history",
            "**Attachments:** Paste image, drag-drop file, or click paperclip",
          ].join("\n");
          const helpMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: helpText,
            timestamp: Date.now(),
          };
          const store = useClaudeStore.getState();
          const st = store.states[paneId];
          if (st) {
            useClaudeStore.setState({
              states: { ...store.states, [paneId]: { ...st, messages: [...st.messages, helpMsg] } },
            });
          }
          break;
        }
        case "model":
          if (args) {
            setModelOverride(paneId, args);
          }
          break;
        case "compact":
          // Send a summarization prompt via the CLI with --resume
          sendMessage(paneId, projectPath, "Summarize our conversation so far briefly, then continue.");
          break;
        case "plan":
          setPermissionMode(paneId, "plan");
          break;
        case "resume":
          // Resume is handled automatically via claudeSessionId
          break;
      }
    },
    [paneId, projectPath, clearMessages, newSession, setModelOverride, setPermissionMode, sendMessage],
  );

  const handleClose = useCallback(() => {
    if (onCloseOverride) {
      onCloseOverride();
      return;
    }
    useClaudeStore.getState().removePaneState(paneId);
    if (activeTabPath) closePane(activeTabPath, paneId);
  }, [paneId, activeTabPath, closePane, onCloseOverride]);

  const ringClass = isActive ? "ring-1 ring-ctp-mauve" : "";

  // Not installed
  if (installed === false) {
    return (
      <div className={`h-full w-full flex items-center justify-center bg-ctp-base ${ringClass}`} onClick={onFocus}>
        <div className="text-center max-w-xs">
          <AlertTriangle size={32} className="mx-auto mb-3 text-ctp-yellow" />
          <p className="font-medium text-ctp-text">Claude CLI not found</p>
          <p className="text-sm mt-1 text-ctp-subtext0">Install Claude Code CLI to use this panel.</p>
          <code className="text-xs mt-3 block bg-ctp-surface0 rounded px-2 py-1 text-ctp-text">
            npm install -g @anthropic-ai/claude-code
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full flex flex-col bg-ctp-base ${ringClass}`} onClick={onFocus}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-ctp-mantle border-b border-ctp-surface0">
        <span className="text-xs font-medium text-ctp-subtext0 flex items-center gap-1.5">
          <Bot size={12} className="text-ctp-mauve" /> Claude
        </span>
        <div className="flex items-center gap-1">
          {state.totalCostUsd > 0 && (
            <span className="text-[10px] text-ctp-overlay0 mr-1">
              ${state.totalCostUsd.toFixed(4)}
            </span>
          )}
          <ClaudeSessionManager paneId={paneId} projectPath={projectPath} currentSessionId={state.claudeSessionId} />
          <button
            onClick={handleClose}
            title="Close panel"
            className="p-0.5 rounded text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <ClaudeMessageList
        messages={state.messages}
        onOptionSelect={state.status === "idle" ? handleSend : undefined}
      />

      {/* Cost toast */}
      {showCostToast && (
        <div className="px-3 py-1.5 text-xs text-ctp-green bg-ctp-surface0 border-t border-ctp-surface1 flex items-center gap-1.5">
          <DollarSign size={12} />
          Session cost: ${state.totalCostUsd.toFixed(4)}
        </div>
      )}

      {/* Error display */}
      {state.error && (
        <div className="px-3 py-1.5 text-xs text-ctp-red bg-ctp-surface0 border-t border-ctp-surface1">
          {state.error}
        </div>
      )}

      {/* Input with slash commands and file attachments */}
      <ClaudeInput
        status={installed === null ? "streaming" : state.status}
        onSend={handleSend}
        onCancel={handleCancel}
        onSlashCommand={handleSlashCommand}
        attachments={state.attachments}
        onAddAttachment={(att) => useClaudeStore.getState().addAttachment(paneId, att)}
        onRemoveAttachment={(path) => useClaudeStore.getState().removeAttachment(paneId, path)}
      />

      {/* Audit log — SSH mode only */}
      {paneId.startsWith("ssh-claude-") && <ClaudeAuditLog />}

      {/* Model & permission mode selectors — below input */}
      <div className="px-3 py-1 bg-ctp-mantle border-t border-ctp-surface0">
        <ClaudeHeaderControls
          modelOverride={state.modelOverride}
          permissionMode={state.permissionMode}
          onModelChange={(m) => setModelOverride(paneId, m)}
          onModeChange={(m) => setPermissionMode(paneId, m)}
          dropUp
        />
      </div>
    </div>
  );
});
