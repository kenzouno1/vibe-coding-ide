import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/app-store";
import { useBrowserStore } from "@/stores/browser-store";

interface PtyOutput {
  id: string;
  data: string;
}

const URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)\S*/g;

/**
 * Listens to terminal output and auto-detects dev server URLs.
 * When a localhost URL is found, navigates the browser if it's on about:blank.
 */
export function useServerDetect(projectPath: string) {
  const view = useAppStore((s) => s.view);
  const browserState = useBrowserStore((s) => s.getState(projectPath));
  const setUrl = useBrowserStore((s) => s.setUrl);
  // Track already-detected URLs to avoid duplicate notifications
  const detectedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = listen<PtyOutput>("pty-output", (event) => {
      const text = event.payload.data;
      const matches = text.matchAll(URL_REGEX);
      for (const match of matches) {
        let url = match[0].replace("0.0.0.0", "localhost");
        // Clean trailing ANSI codes or punctuation
        url = url.replace(/[\x1b\u001b]\[[0-9;]*m/g, "").replace(/[,.)}\]]+$/, "");
        if (detectedRef.current.has(url)) continue;
        detectedRef.current.add(url);

        // Auto-navigate if browser is on about:blank
        const currentState = useBrowserStore.getState().getState(projectPath);
        if (
          currentState.webviewCreated &&
          (currentState.url === "about:blank" || currentState.url === "")
        ) {
          setUrl(projectPath, url);
          invoke("navigate_browser", { projectId: projectPath, url }).catch(() => {});
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [projectPath, setUrl]);
}
