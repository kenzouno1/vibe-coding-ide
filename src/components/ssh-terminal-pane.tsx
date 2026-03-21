import { useSshStore } from "@/stores/ssh-store";
import { SshTerminal } from "@/components/ssh-terminal";

interface SshTerminalPaneProps {
  sessionId: string;
  paneId: string;
  isActive: boolean;
  onFocus: () => void;
}

export function SshTerminalPane({
  sessionId,
  paneId,
  isActive,
  onFocus,
}: SshTerminalPaneProps) {
  const channelId = useSshStore(
    (s) => s.connections[sessionId]?.channelMap[paneId] ?? null,
  );

  if (!channelId) {
    return (
      <div className="h-full w-full flex items-center justify-center text-ctp-overlay0 text-xs">
        Opening channel...
      </div>
    );
  }

  return (
    <div
      className={`h-full w-full ${isActive ? "ring-1 ring-inset ring-ctp-mauve" : ""}`}
      onMouseDown={onFocus}
    >
      <SshTerminal sessionId={sessionId} channelId={channelId} />
    </div>
  );
}
