import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { usePaneStore, autoDirection } from "@/stores/pane-store";
import { getPaneRect } from "@/utils/pane-container-registry";
import { useGitStore } from "@/stores/git-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { useSshStore } from "@/stores/ssh-store";
import { useClaudeStore } from "@/stores/claude-store";
import { useBrowserStore } from "@/stores/browser-store";
import { usePluginStore } from "@/stores/plugin-store";
import { getPlugins } from "@/plugins/plugin-registry";

/**
 * Global keyboard shortcut handler.
 * Only active when terminal is NOT focused (terminal captures its own input).
 */
export function useKeyboardShortcuts() {
  const setView = useAppStore((s) => s.setView);
  const view = useAppStore((s) => s.view);

  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const openTabs = useProjectStore((s) => s.openTabs);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const getActiveId = usePaneStore((s) => s.getActiveId);
  const split = usePaneStore((s) => s.split);
  const closePane = usePaneStore((s) => s.closePane);
  const toggleDirection = usePaneStore((s) => s.toggleDirection);

  const gitCommit = useGitStore((s) => s.commit);
  const gitGetState = useGitStore((s) => s.getState);
  const gitStageFile = useGitStore((s) => s.stageFile);
  const gitUnstageFile = useGitStore((s) => s.unstageFile);

  const editorGetState = useEditorStore((s) => s.getState);
  const editorCloseFile = useEditorStore((s) => s.closeFile);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isCtrl = e.ctrlKey || e.metaKey;
      const project = activeTabPath;
      if (!project) return;

      // Settings shortcut (Ctrl+,)
      if (isCtrl && e.key === ",") {
        e.preventDefault();
        setView("settings");
        return;
      }

      // View switching
      if (isCtrl && e.key === "1") {
        e.preventDefault();
        setView("terminal");
        return;
      }
      if (isCtrl && e.key === "2") {
        e.preventDefault();
        setView("git");
        return;
      }
      if (isCtrl && e.key === "3") {
        e.preventDefault();
        setView("editor");
        return;
      }
      // Plugin view-switch shortcuts (e.g. Ctrl+4 for SSH when enabled)
      for (const plugin of getPlugins()) {
        if (!usePluginStore.getState().isEnabled(plugin.id)) continue;
        for (const sc of plugin.shortcuts ?? []) {
          if (isCtrl === !!sc.ctrl && e.shiftKey === !!sc.shift && e.key === sc.key) {
            e.preventDefault();
            sc.action();
            return;
          }
        }
      }

      // F5: refresh browser pane (not the app). Ctrl+F5: refresh the app.
      if (e.key === "F5") {
        e.preventDefault();
        if (isCtrl) {
          window.location.reload();
          return;
        }
        if (view === "terminal") {
          const activeId = getActiveId(project);
          const paneType = usePaneStore.getState().getPaneType(project, activeId);
          if (paneType === "browser") {
            import("@tauri-apps/api/core").then(({ invoke }) => {
              invoke("browser_reload", { paneId: activeId });
            });
          }
        }
        return;
      }

      // Browser DevTools toggle (F12 when browser pane is focused)
      if (view === "terminal" && e.key === "F12") {
        const activeId = getActiveId(project);
        const paneType = usePaneStore.getState().getPaneType(project, activeId);
        if (paneType === "browser") {
          e.preventDefault();
          import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke("open_browser_devtools", { paneId: activeId });
          });
          return;
        }
      }

      // Tab switching: Ctrl+Tab / Ctrl+Shift+Tab
      if (isCtrl && e.key === "Tab") {
        e.preventDefault();
        if (openTabs.length <= 1) return;
        const idx = openTabs.findIndex((t) => t.path === project);
        const next = e.shiftKey
          ? (idx - 1 + openTabs.length) % openTabs.length
          : (idx + 1) % openTabs.length;
        setActiveTab(openTabs[next].path);
        return;
      }

      // Terminal shortcuts (only in terminal view)
      if (view === "terminal") {
        const activeId = getActiveId(project);

        if (isCtrl && e.shiftKey && e.key === "H") {
          e.preventDefault();
          split(project, activeId, "horizontal");
          return;
        }
        if (isCtrl && e.shiftKey && e.key === "V") {
          e.preventDefault();
          split(project, activeId, "vertical");
          return;
        }
        // Ctrl+Shift+C: Split with Claude chat pane (auto direction)
        if (isCtrl && e.shiftKey && e.key === "C") {
          e.preventDefault();
          const rect = getPaneRect(activeId);
          const dir = rect ? autoDirection(rect.width, rect.height) : "horizontal";
          split(project, activeId, dir, "claude");
          return;
        }
        // Ctrl+Shift+B: Split with browser pane (auto direction)
        if (isCtrl && e.shiftKey && e.key === "B") {
          e.preventDefault();
          const rect = getPaneRect(activeId);
          const dir = rect ? autoDirection(rect.width, rect.height) : "horizontal";
          split(project, activeId, dir, "browser");
          return;
        }
        // Ctrl+Shift+T: Toggle split direction (H↔V)
        if (isCtrl && e.shiftKey && e.key === "T") {
          e.preventDefault();
          toggleDirection(project, activeId);
          return;
        }
        if (isCtrl && e.key === "w") {
          e.preventDefault();
          const paneType = usePaneStore.getState().getPaneType(project, activeId);
          if (paneType === "claude") {
            useClaudeStore.getState().removePaneState(activeId);
          }
          if (paneType === "browser") {
            // Only remove store state — webview destroy handled by BrowserPane unmount
            const { [activeId]: _, ...rest } = useBrowserStore.getState().states;
            useBrowserStore.setState({ states: rest });
          }
          closePane(project, activeId);
          return;
        }
      }

      // SSH terminal shortcuts (only in ssh view, when plugin enabled)
      if (view === "ssh" && usePluginStore.getState().isEnabled("ssh")) {
        const sshStore = useSshStore.getState();
        const sshSessionId = sshStore.activeSessionId;
        if (sshSessionId) {
          const activeId = getActiveId(sshSessionId);

          if (isCtrl && e.shiftKey && e.key === "H") {
            e.preventDefault();
            split(sshSessionId, activeId, "horizontal");
            // After split, activeId is updated to the new pane
            const newPaneId = usePaneStore.getState().getActiveId(sshSessionId);
            void sshStore.openChannel(sshSessionId, newPaneId);
            return;
          }
          if (isCtrl && e.shiftKey && e.key === "V") {
            e.preventDefault();
            split(sshSessionId, activeId, "vertical");
            const newPaneId = usePaneStore.getState().getActiveId(sshSessionId);
            void sshStore.openChannel(sshSessionId, newPaneId);
            return;
          }
          if (isCtrl && e.key === "w") {
            e.preventDefault();
            void sshStore.closeChannel(sshSessionId, activeId);
            closePane(sshSessionId, activeId);
            return;
          }
        }
      }

      // Editor shortcuts (only in editor view)
      if (view === "editor") {
        if (isCtrl && e.key === "s") {
          e.preventDefault();
          const editorState = editorGetState(project);
          if (editorState.activeFilePath) {
            // Get content from Monaco model via DOM (editor instance manages the content)
            const activeFile = editorState.openFiles.find(
              (f) => f.filePath === editorState.activeFilePath,
            );
            if (activeFile) {
              // Dispatch a custom event that editor-pane listens for
              window.dispatchEvent(new CustomEvent("devtools:save-active-file"));
            }
          }
          return;
        }
        if (isCtrl && e.key === "w") {
          e.preventDefault();
          const editorState = editorGetState(project);
          if (editorState.activeFilePath) {
            editorCloseFile(project, editorState.activeFilePath);
          }
          return;
        }
      }

      // Git shortcuts (only in git view)
      if (view === "git") {
        if (isCtrl && e.key === "Enter") {
          e.preventDefault();
          gitCommit(project);
          return;
        }
        const target = e.target as HTMLElement;
        const isInput = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
        const state = gitGetState(project);
        if (!isInput && state.selectedFile) {
          const file = state.files.find((f) => f.path === state.selectedFile);
          if (e.key === "s" && file && !file.staged) {
            e.preventDefault();
            gitStageFile(project, state.selectedFile);
            return;
          }
          if (e.key === "u" && file && file.staged) {
            e.preventDefault();
            gitUnstageFile(project, state.selectedFile);
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, activeTabPath, openTabs, setView, setActiveTab, split, closePane, getActiveId, toggleDirection, gitCommit, gitGetState, gitStageFile, gitUnstageFile, editorGetState, editorCloseFile]);
  // Note: useSshStore.getState() is called imperatively inside handler — no dep needed
}
