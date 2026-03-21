import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type StreamStatus = "idle" | "streaming" | "error";

export type ToolStatus = "pending" | "running" | "complete" | "error";

export interface ToolUseBlock {
  id: string;
  name: string;
  input: string;
  result?: string;
  status: ToolStatus;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolUse?: ToolUseBlock[];
  costUsd?: number;
}

/** Attachment for images/files to send with next message */
export interface Attachment {
  /** Temp file path on disk */
  path: string;
  /** Original filename for display */
  name: string;
  /** MIME type (e.g. image/png) */
  mimeType: string;
}

export interface ClaudePaneState {
  messages: ChatMessage[];
  status: StreamStatus;
  claudeSessionId: string | null;
  error: string | null;
  /** Accumulated cost across all messages in this session */
  totalCostUsd: number;
  /** Model override set by /model command */
  modelOverride: string | null;
  /** Permission mode override (e.g. "plan" for read-only) */
  permissionMode: string | null;
  /** Pending file/image attachments for next message */
  attachments: Attachment[];
  /** Model name reported by CLI (from system.init event) */
  modelName: string | null;
  /** Token usage from last result */
  tokenUsage: { input: number; output: number } | null;
}

function defaultState(): ClaudePaneState {
  return {
    messages: [],
    status: "idle",
    claudeSessionId: null,
    error: null,
    totalCostUsd: 0,
    modelOverride: null,
    permissionMode: null,
    attachments: [],
    modelName: null,
    tokenUsage: null,
  };
}

interface ClaudeStore {
  states: Record<string, ClaudePaneState>;

  ensureState: (paneId: string) => void;
  /** Resume a previously saved session in the given pane */
  resumeSavedSession: (paneId: string, sessionId: string) => void;
  sendMessage: (paneId: string, projectPath: string, message: string) => Promise<void>;
  cancelMessage: (paneId: string) => Promise<void>;
  handleStreamLine: (paneId: string, jsonLine: string) => void;
  handleComplete: (paneId: string) => void;
  removePaneState: (paneId: string) => void;
  /** Clear messages but keep session config (model, permissions) */
  clearMessages: (paneId: string) => void;
  /** Reset everything — new session, clear messages, clear overrides */
  newSession: (paneId: string) => void;
  /** Set model override for /model command */
  setModelOverride: (paneId: string, model: string | null) => void;
  /** Set permission mode for /plan command */
  setPermissionMode: (paneId: string, mode: string | null) => void;
  /** Add a file/image attachment */
  addAttachment: (paneId: string, attachment: Attachment) => void;
  /** Remove an attachment by path */
  removeAttachment: (paneId: string, path: string) => void;
}

export const useClaudeStore = create<ClaudeStore>((set, get) => ({
  states: {},

  resumeSavedSession: (paneId, sessionId) => {
    invoke("claude_cancel", { sessionId: paneId }).catch(() => {});
    set((s) => {
      const state = s.states[paneId] ?? defaultState();
      return {
        states: {
          ...s.states,
          [paneId]: { ...state, messages: [], claudeSessionId: sessionId, error: null, status: "idle" },
        },
      };
    });
    try { localStorage.setItem(`claude-session-${paneId}`, sessionId); } catch { /* ignore */ }
  },

  /** Lazily initialize state for a pane, restoring session ID from localStorage */
  ensureState: (paneId) => {
    if (!get().states[paneId]) {
      const state = defaultState();
      // Restore session ID from localStorage if available
      try {
        const saved = localStorage.getItem(`claude-session-${paneId}`);
        if (saved) state.claudeSessionId = saved;
      } catch { /* ignore storage errors */ }
      set((s) => ({
        states: { ...s.states, [paneId]: state },
      }));
    }
  },

  sendMessage: async (paneId, projectPath, message) => {
    // Build message with attachment paths prepended
    const paneState = get().states[paneId];
    const attachments = paneState?.attachments ?? [];
    let fullMessage = message;
    if (attachments.length > 0) {
      const filePaths = attachments.map((a) => a.path).join(", ");
      fullMessage = `Please analyze the following file(s): ${filePaths}\n\n${message}`;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: Date.now(),
    };

    // Add user message + create placeholder assistant message
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    set((s) => {
      const state = s.states[paneId] ?? defaultState();
      return {
        states: {
          ...s.states,
          [paneId]: {
            ...state,
            messages: [...state.messages, userMsg, assistantMsg],
            status: "streaming",
            error: null,
          },
        },
      };
    });

    const currentState = get().states[paneId];
    try {
      await invoke("claude_send_message", {
        sessionId: paneId,
        message: fullMessage,
        cwd: projectPath,
        resumeSession: currentState?.claudeSessionId ?? null,
        modelOverride: currentState?.modelOverride ?? null,
        permissionModeOverride: currentState?.permissionMode ?? null,
      });

      // Clean up temp files and clear attachments after send
      if (attachments.length > 0) {
        const paths = attachments.map((a) => a.path);
        invoke("claude_cleanup_temp_files", { paths }).catch(() => {});
        set((s) => {
          const st = s.states[paneId];
          if (!st) return s;
          return { states: { ...s.states, [paneId]: { ...st, attachments: [] } } };
        });
      }
    } catch (e) {
      set((s) => ({
        states: {
          ...s.states,
          [paneId]: {
            ...s.states[paneId],
            status: "error",
            error: String(e),
          },
        },
      }));
    }
  },

  cancelMessage: async (paneId) => {
    try {
      await invoke("claude_cancel", { sessionId: paneId });
    } catch {
      // ignore — process may already be dead
    }
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      return {
        states: {
          ...s.states,
          [paneId]: { ...state, status: "idle" },
        },
      };
    });
  },

  handleStreamLine: (paneId, jsonLine) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(jsonLine);
    } catch {
      return; // skip malformed lines
    }

    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;

      // Handle system init event — extract model name and session ID
      if (event.type === "system") {
        const subtype = event.subtype as string | undefined;
        if (subtype === "init") {
          const model = event.model as string | undefined;
          const sessionId = event.session_id as string | undefined;
          return {
            states: {
              ...s.states,
              [paneId]: {
                ...state,
                modelName: model ?? state.modelName,
                claudeSessionId: sessionId ?? state.claudeSessionId,
              },
            },
          };
        }
        return s;
      }

      // Handle stream_event wrapper — unwrap the inner event
      let innerEvent = event;
      if (event.type === "stream_event") {
        innerEvent = event.event as Record<string, unknown>;
        if (!innerEvent) return s;
      }

      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== "assistant") return s;

      const updated = { ...lastMsg };
      const innerType = innerEvent.type as string;

      if (innerType === "content_block_delta") {
        const delta = innerEvent.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          updated.content += delta.text;
        } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          // Accumulate tool input JSON incrementally
          const tools = updated.toolUse ? [...updated.toolUse] : [];
          const lastTool = tools[tools.length - 1];
          if (lastTool) {
            tools[tools.length - 1] = {
              ...lastTool,
              input: lastTool.input + (delta.partial_json as string),
            };
            updated.toolUse = tools;
          }
        }
      } else if (innerType === "content_block_start") {
        // New content block starting — track tool_use blocks
        const block = innerEvent.content_block as Record<string, unknown> | undefined;
        if (block?.type === "tool_use") {
          const newTool: ToolUseBlock = {
            id: (block.id as string) ?? "",
            name: (block.name as string) ?? "",
            input: "",
            status: "running",
          };
          updated.toolUse = [...(updated.toolUse ?? []), newTool];
        }
      } else if (innerType === "content_block_stop") {
        // Mark last tool as complete when its content block stops
        const tools = updated.toolUse ? [...updated.toolUse] : [];
        const lastTool = tools[tools.length - 1];
        if (lastTool && lastTool.status === "running") {
          tools[tools.length - 1] = { ...lastTool, status: "complete" };
          updated.toolUse = tools;
        }
      } else if (event.type === "assistant") {
        // NOTE: "assistant" and "result" arrive as bare top-level events (not wrapped in stream_event).
        // Block-level events (content_block_*) arrive inside stream_event wrapper and use innerEvent.
        // Full assistant message — reconcile content blocks
        const msg = event.message as Record<string, unknown> | undefined;
        const content = msg?.content as Array<Record<string, unknown>> | undefined;
        if (content) {
          const text = content
            .filter((b) => b.type === "text")
            .map((b) => b.text as string)
            .join("");
          if (text) updated.content = text;

          const tools = content
            .filter((b) => b.type === "tool_use")
            .map((b) => ({
              id: (b.id as string) ?? "",
              name: (b.name as string) ?? "",
              input: JSON.stringify(b.input ?? {}),
              status: "complete" as const,
            }));
          if (tools.length > 0) updated.toolUse = tools;
        }
      } else if (event.type === "result") {
        // Final result — capture session ID, cost, usage, and accumulate total
        const newState = { ...state };
        if (typeof event.session_id === "string") {
          newState.claudeSessionId = event.session_id;
          // Persist session ID so it survives app restart
          try { localStorage.setItem(`claude-session-${paneId}`, event.session_id); } catch { /* ignore */ }
        }
        if (typeof event.total_cost_usd === "number") {
          const turnCost = event.total_cost_usd as number;
          updated.costUsd = turnCost;
          newState.totalCostUsd = (state.totalCostUsd ?? 0) + turnCost;
        }
        // Extract token usage
        const usage = event.usage as Record<string, unknown> | undefined;
        if (usage) {
          newState.tokenUsage = {
            input: (usage.input_tokens as number) ?? 0,
            output: (usage.output_tokens as number) ?? 0,
          };
        }
        messages[messages.length - 1] = updated;
        return { states: { ...s.states, [paneId]: { ...newState, messages } } };
      } else {
        return s; // ignore unknown event types
      }

      messages[messages.length - 1] = updated;
      return { states: { ...s.states, [paneId]: { ...state, messages } } };
    });
  },

  handleComplete: (paneId) => {
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      // Remove empty assistant messages (e.g. cancelled before any output)
      const messages = state.messages.filter(
        (m) => m.role !== "assistant" || m.content.length > 0 || (m.toolUse && m.toolUse.length > 0),
      );
      return {
        states: {
          ...s.states,
          [paneId]: { ...state, messages, status: "idle" },
        },
      };
    });
  },

  removePaneState: (paneId) => {
    // Cancel any running process and clean up persisted session
    invoke("claude_cancel", { sessionId: paneId }).catch(() => {});
    try { localStorage.removeItem(`claude-session-${paneId}`); } catch { /* ignore */ }
    set((s) => {
      const { [paneId]: _, ...rest } = s.states;
      return { states: rest };
    });
  },

  clearMessages: (paneId) => {
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      return {
        states: {
          ...s.states,
          [paneId]: { ...state, messages: [], error: null },
        },
      };
    });
  },

  newSession: (paneId) => {
    invoke("claude_cancel", { sessionId: paneId }).catch(() => {});
    // Clear persisted session ID
    try { localStorage.removeItem(`claude-session-${paneId}`); } catch { /* ignore */ }
    set((s) => ({
      states: {
        ...s.states,
        [paneId]: defaultState(),
      },
    }));
  },

  setModelOverride: (paneId, model) => {
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      return {
        states: { ...s.states, [paneId]: { ...state, modelOverride: model } },
      };
    });
  },

  setPermissionMode: (paneId, mode) => {
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      return {
        states: { ...s.states, [paneId]: { ...state, permissionMode: mode } },
      };
    });
  },

  addAttachment: (paneId, attachment) => {
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      return {
        states: {
          ...s.states,
          [paneId]: { ...state, attachments: [...state.attachments, attachment] },
        },
      };
    });
  },

  removeAttachment: (paneId, path) => {
    // Clean up the temp file
    invoke("claude_cleanup_temp_files", { paths: [path] }).catch(() => {});
    set((s) => {
      const state = s.states[paneId];
      if (!state) return s;
      return {
        states: {
          ...s.states,
          [paneId]: {
            ...state,
            attachments: state.attachments.filter((a) => a.path !== path),
          },
        },
      };
    });
  },
}));
