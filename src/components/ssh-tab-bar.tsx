import { X, Plus, Bot } from "lucide-react";
import { useSshStore } from "@/stores/ssh-store";

interface SshTabBarProps {
  onNewTab: () => void;
  showAgentToggle?: boolean;
  agentActive?: boolean;
  onToggleAgent?: () => void;
}

export function SshTabBar({
  onNewTab,
  showAgentToggle,
  agentActive,
  onToggleAgent,
}: SshTabBarProps) {
  const tabOrder = useSshStore((s) => s.tabOrder);
  const activeSessionId = useSshStore((s) => s.activeSessionId);
  const connections = useSshStore((s) => s.connections);
  const savedSessions = useSshStore((s) => s.savedSessions);
  const setActiveSession = useSshStore((s) => s.setActiveSession);
  const disconnect = useSshStore((s) => s.disconnect);

  return (
    <div className="h-8 flex items-center bg-ctp-crust border-b border-ctp-surface0 overflow-x-auto shrink-0">
      {tabOrder.map((connId) => {
        const conn = connections[connId];
        const session = savedSessions.find((s) => s.id === conn?.sessionId);
        const isActive = connId === activeSessionId;
        const isConnected = conn?.status === "connected";
        const label =
          session?.name ??
          (session
            ? `${session.username}@${session.host}`
            : connId.slice(0, 8));

        return (
          <div
            key={connId}
            onClick={() => setActiveSession(connId)}
            className={`group flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer
              border-r border-ctp-surface0 shrink-0 transition-colors
              ${
                isActive
                  ? "bg-ctp-surface0 text-ctp-mauve border-b-2 border-b-ctp-mauve"
                  : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
              }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isConnected ? "bg-ctp-green" : "bg-ctp-overlay0"
              }`}
            />
            <span className="truncate max-w-[120px]">{label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                disconnect(connId);
              }}
              title="Close"
              className="p-0.5 rounded opacity-0 group-hover:opacity-100
                         hover:bg-ctp-surface1 text-ctp-overlay0 hover:text-ctp-red transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        onClick={onNewTab}
        title="New SSH connection"
        className="px-2 h-full text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 shrink-0 transition-colors"
      >
        <Plus size={14} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI Agent toggle */}
      {showAgentToggle && (
        <button
          onClick={onToggleAgent}
          title={agentActive ? "Hide AI Agent Terminal" : "Show AI Agent Terminal"}
          className={`px-2 h-full shrink-0 transition-colors flex items-center gap-1 text-xs ${
            agentActive
              ? "bg-ctp-surface0 text-ctp-mauve"
              : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
          }`}
        >
          <Bot size={14} />
          <span>AI</span>
        </button>
      )}
    </div>
  );
}
