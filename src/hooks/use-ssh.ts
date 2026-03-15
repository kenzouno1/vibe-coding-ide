import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

interface SshOutput {
  id: string;
  channel_id: string;
  data: string;
}

/**
 * Hook to connect xterm.js to an existing SSH session via Tauri IPC.
 * Unlike usePty, this does NOT spawn on mount — session lifecycle
 * is managed by ssh-store.
 */
export function useSsh(
  sessionId: string | null,
  channelId: string,
  onData: (data: string) => void,
) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let destroyed = false;

    async function setup() {
      const unlisten = await listen<SshOutput>("ssh-output", (event) => {
        if (
          !destroyed &&
          event.payload.id === sessionId &&
          event.payload.channel_id === channelId
        ) {
          onDataRef.current(event.payload.data);
        }
      });
      if (destroyed) {
        unlisten();
        return;
      }
      unlistenRef.current = unlisten;
    }

    setup();

    return () => {
      destroyed = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [sessionId, channelId]);

  const write = useCallback(
    (data: string) => {
      if (sessionId) {
        invoke("ssh_write", { id: sessionId, channelId, data });
      }
    },
    [sessionId, channelId],
  );

  const resize = useCallback(
    (rows: number, cols: number) => {
      if (sessionId) {
        invoke("ssh_resize", { id: sessionId, channelId, rows, cols });
      }
    },
    [sessionId, channelId],
  );

  return { write, resize };
}
