import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePaneStore } from "@/stores/pane-store";
import { useAppStore } from "@/stores/app-store";
import { useProjectStore } from "@/stores/project-store";

/** Save all open tabs' pane trees to backend */
function saveAllSessions(trees: Record<string, unknown>, view: string) {
  for (const [cwd, panes] of Object.entries(trees)) {
    if (panes) {
      invoke("save_session", { cwd, panes, view }).catch(() => {});
    }
  }
}

/** Save session state on changes (debounced) */
export function useSessionPersistence() {
  const trees = usePaneStore((s) => s.trees);
  const view = useAppStore((s) => s.view);
  const openTabs = useProjectStore((s) => s.openTabs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save on changes (debounced 2s)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveAllSessions(trees, view);
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [trees, view, openTabs]);

  // Save on window unload
  useEffect(() => {
    const handler = () => saveAllSessions(trees, view);
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [trees, view]);
}
