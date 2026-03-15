import { useState } from "react";
import { Bot } from "lucide-react";
import { useSshStore } from "@/stores/ssh-store";
import { SftpBrowser } from "@/components/sftp-browser";
import { SshSplitPaneContainer } from "@/components/ssh-split-pane-container";
import { SshPresetManager } from "@/components/ssh-preset-manager";
import { SshTabBar } from "@/components/ssh-tab-bar";
import { SshAgentTerminal } from "@/components/ssh-agent-terminal";
import { SplitHandle } from "@/components/split-handle";

export function SshPanel() {
  const tabOrder = useSshStore((s) => s.tabOrder);
  const activeSessionId = useSshStore((s) => s.activeSessionId);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [sftpRatio, setSftpRatio] = useState(0.2);
  const [agentRatio, setAgentRatio] = useState(0.7);
  const [showAgent, setShowAgent] = useState(false);

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

  // Layout: SFTP | SSH Terminal | (optional) Agent Terminal
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

              {/* SSH terminal */}
              <div
                style={{
                  flexBasis: showAgent
                    ? `${(agentRatio - sftpRatio) * 100}%`
                    : `${(1 - sftpRatio) * 100}%`,
                }}
                className="min-w-0 h-full overflow-hidden"
              >
                <SshSplitPaneContainer sessionId={sessionId} />
              </div>

              {/* Agent terminal (toggleable) */}
              {showAgent && (
                <>
                  <SplitHandle direction="horizontal" onResize={setAgentRatio} />
                  <div
                    style={{ flexBasis: `${(1 - agentRatio) * 100}%` }}
                    className="min-w-0 h-full overflow-hidden"
                  >
                    <SshAgentTerminal />
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
