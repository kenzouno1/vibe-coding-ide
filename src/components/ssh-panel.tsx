import { useState, useCallback, useEffect } from "react";
import { Bot } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSshStore } from "@/stores/ssh-store";
import { useEditorStore } from "@/stores/editor-store";
import { SftpBrowser } from "@/components/sftp-browser";
import { SshSplitPaneContainer } from "@/components/ssh-split-pane-container";
import { SshEditorPane } from "@/components/ssh-editor-pane";
import { SshPresetManager } from "@/components/ssh-preset-manager";
import { SshTabBar } from "@/components/ssh-tab-bar";
import { ClaudeChatPane } from "@/components/claude-chat-pane";
import { SplitHandle } from "@/components/split-handle";

/** Per-session Claude pane — creates workspace with CLAUDE.md containing session context */
function SshClaudePane({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [wsPath, setWsPath] = useState<string | null>(null);
  const host = useSshStore((s) => {
    const conn = s.connections[sessionId];
    if (!conn) return null;
    return s.savedSessions.find((ss) => ss.id === conn.sessionId)?.host ?? null;
  });
  const username = useSshStore((s) => {
    const conn = s.connections[sessionId];
    if (!conn) return null;
    return s.savedSessions.find((ss) => ss.id === conn.sessionId)?.username ?? null;
  });

  useEffect(() => {
    if (!host || !username) return;
    invoke<string>("claude_ssh_workspace", { connId: sessionId, host, username })
      .then(setWsPath)
      .catch(() => {});
  }, [sessionId, host, username]);

  if (!wsPath) return null;
  return <ClaudeChatPane projectPath={wsPath} paneId={`ssh-claude-${sessionId}`} onClose={onClose} />;
}

export function SshPanel() {
  const tabOrder = useSshStore((s) => s.tabOrder);
  const activeSessionId = useSshStore((s) => s.activeSessionId);
  const editorStates = useEditorStore((s) => s.states);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [sftpRatio, setSftpRatio] = useState(0.2);
  const [agentRatio, setAgentRatio] = useState(0.7);
  const [editorRatio, setEditorRatio] = useState(0.5);
  const [showAgent, setShowAgent] = useState(false);
  const hideAgent = useCallback(() => setShowAgent(false), []);

  // No sessions or explicitly showing preset manager
  if (tabOrder.length === 0 || showPresetManager) {
    return (
      <div className="h-full flex flex-col">
        {tabOrder.length > 0 && (
          <SshTabBar
            onNewTab={() => setShowPresetManager(true)}
            showAgentToggle
            agentActive={showAgent}
            onToggleAgent={() => setShowAgent((v) => !v)}
          />
        )}
        <div className="flex-1 min-h-0">
          <SshPresetManager onConnected={() => setShowPresetManager(false)} />
        </div>
      </div>
    );
  }

  // Layout: SFTP | SSH Terminal | (optional) Claude Panel
  return (
    <div className="h-full flex flex-col">
      <SshTabBar
        onNewTab={() => setShowPresetManager(true)}
        showAgentToggle
        agentActive={showAgent}
        onToggleAgent={() => setShowAgent((v) => !v)}
      />
      <div className="flex-1 min-h-0 relative">
        {tabOrder.map((sessionId) => (
          <div
            key={sessionId}
            className="absolute inset-0"
            style={{
              visibility: sessionId === activeSessionId ? "visible" : "hidden",
              zIndex: sessionId === activeSessionId ? 1 : 0,
            }}
          >
            <div className="h-full flex flex-row">
              {/* SFTP browser */}
              <div
                style={{ flexBasis: `${sftpRatio * 100}%` }}
                className="min-w-0 h-full overflow-hidden"
              >
                <SftpBrowser sessionId={sessionId} />
              </div>
              <SplitHandle direction="horizontal" onResize={setSftpRatio} />

              {/* Editor + SSH terminal (vertical split when editor has open files) */}
              <div
                style={{
                  flexBasis: showAgent
                    ? `${(agentRatio - sftpRatio) * 100}%`
                    : `${(1 - sftpRatio) * 100}%`,
                }}
                className="min-w-0 h-full overflow-hidden flex flex-col"
              >
                {(editorStates[sessionId]?.openFiles.length ?? 0) > 0 && (
                  <>
                    <div
                      style={{ flexBasis: `${editorRatio * 100}%` }}
                      className="min-h-0 overflow-hidden"
                    >
                      <SshEditorPane sessionId={sessionId} />
                    </div>
                    <SplitHandle
                      direction="vertical"
                      onResize={setEditorRatio}
                    />
                  </>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <SshSplitPaneContainer sessionId={sessionId} />
                </div>
              </div>

              {/* Claude chat panel (toggleable) */}
              {showAgent && (
                <>
                  <SplitHandle direction="horizontal" onResize={setAgentRatio} />
                  <div
                    style={{ flexBasis: `${(1 - agentRatio) * 100}%` }}
                    className="min-w-0 h-full overflow-hidden"
                  >
                    <SshClaudePane sessionId={sessionId} onClose={hideAgent} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
