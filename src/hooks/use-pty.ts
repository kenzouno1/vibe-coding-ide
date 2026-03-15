import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

interface PtyOutput {
  id: string;
  data: string;
}

/**
 * Hook to manage a PTY session via Tauri IPC.
 * Spawns a PTY on mount, cleans up on unmount.
 * Guards against double-init from StrictMode or fast remounts.
 */
export function usePty(onData: (data: string) => void, cwd?: string) {
  const sessionIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const initRef = useRef(false);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    // Guard: don't double-init
    if (initRef.current) return;
    initRef.current = true;

    let destroyed = false;

    async function init() {
      // Listen for PTY output events
      const unlisten = await listen<PtyOutput>("pty-output", (event) => {
        if (!destroyed && event.payload.id === sessionIdRef.current) {
          onDataRef.current(event.payload.data);
        }
      });
      if (destroyed) {
        unlisten();
        return;
      }
      unlistenRef.current = unlisten;

      // Spawn PTY
      try {
        const id = await invoke<string>("spawn_pty", { cwd: cwd || null });
        if (destroyed) {
          invoke("kill_pty", { id }).catch(() => {});
          return;
        }
        sessionIdRef.current = id;
      } catch (e) {
        console.error("Failed to spawn PTY:", e);
      }
    }

    init();

    return () => {
      destroyed = true;
      unlistenRef.current?.();
      if (sessionIdRef.current) {
        invoke("kill_pty", { id: sessionIdRef.current }).catch(() => {});
        sessionIdRef.current = null;
      }
      initRef.current = false;
    };
  }, []);

  const write = useCallback((data: string) => {
    if (sessionIdRef.current) {
      invoke("write_pty", { id: sessionIdRef.current, data });
    }
  }, []);

  const resize = useCallback((rows: number, cols: number) => {
    if (sessionIdRef.current) {
      invoke("resize_pty", { id: sessionIdRef.current, rows, cols });
    }
  }, []);

  return { write, resize, sessionIdRef };
}
