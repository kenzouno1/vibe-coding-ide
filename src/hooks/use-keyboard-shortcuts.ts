import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { usePaneStore } from "@/stores/pane-store";
import { useGitStore } from "@/stores/git-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";

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
      if (isCtrl && e.key === "4") {
        e.preventDefault();
        setView("browser");
        return;
      }
      if (isCtrl && e.key === "5") {
        e.preventDefault();
        setView("ssh");
        return;
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
        if (isCtrl && e.key === "w") {
          e.preventDefault();
          closePane(project, activeId);
          return;
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
  }, [view, activeTabPath, openTabs, setView, setActiveTab, split, closePane, getActiveId, gitCommit, gitGetState, gitStageFile, gitUnstageFile, editorGetState, editorCloseFile]);
}
