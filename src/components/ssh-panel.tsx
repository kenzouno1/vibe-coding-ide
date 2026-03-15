import { useState } from "react";
import { useSshStore } from "@/stores/ssh-store";
import { SftpBrowser } from "@/components/sftp-browser";
import { SshSplitPaneContainer } from "@/components/ssh-split-pane-container";
import { SshPresetManager } from "@/components/ssh-preset-manager";
import { SshTabBar } from "@/components/ssh-tab-bar";
import { SplitHandle } from "@/components/split-handle";

export function SshPanel() {
  const tabOrder = useSshStore((s) => s.tabOrder);
  const activeSessionId = useSshStore((s) => s.activeSessionId);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.3);

  // No sessions or explicitly showing preset manager
  if (tabOrder.length === 0 || showPresetManager) {
    return (
      <div className="h-full flex flex-col">
        {tabOrder.length > 0 && (
          <SshTabBar onNewTab={() => setShowPresetManager(true)} />
        )}
        <div className="flex-1 min-h-0">
          <SshPresetManager onConnected={() => setShowPresetManager(false)} />
        </div>
      </div>
    );
  }

  // Has sessions → tab bar + split layout, all sessions rendered (visibility toggled)
  return (
    <div className="h-full flex flex-col">
      <SshTabBar onNewTab={() => setShowPresetManager(true)} />
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
              <div
                style={{ flexBasis: `${splitRatio * 100}%` }}
                className="min-w-0 h-full overflow-hidden"
              >
                <SftpBrowser sessionId={sessionId} />
              </div>
              <SplitHandle direction="horizontal" onResize={setSplitRatio} />
              <div
                style={{ flexBasis: `${(1 - splitRatio) * 100}%` }}
                className="min-w-0 h-full overflow-hidden"
              >
                <SshSplitPaneContainer sessionId={sessionId} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
