import { GitBranch, Bot, TerminalSquare, ArrowLeftRight } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useGitStore } from "@/stores/git-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { usePaneStore, autoDirection } from "@/stores/pane-store";
import { getPaneRect } from "@/utils/pane-container-registry";
import { getLanguageColor } from "@/utils/language-detect";

export function StatusBar() {
  const view = useAppStore((s) => s.view);
  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const gitState = useGitStore((s) => s.getState(activeTabPath || ""));
  const editorState = useEditorStore((s) => s.getState(activeTabPath || ""));

  const { branch, files } = gitState;
  const fileCount = files.length;

  // Find active editor file for language display
  const activeEditorFile = editorState.openFiles.find(
    (f) => f.filePath === editorState.activeFilePath,
  );

  return (
    <div className="h-7 flex items-center px-2 bg-ctp-mantle border-t border-ctp-surface0 text-xs text-ctp-overlay1 gap-3">
      {/* Git info (always shown if available) */}
      {branch && (
        <div className="flex items-center gap-1">
          <GitBranch size={12} />
          <span>{branch}</span>
        </div>
      )}
      {fileCount > 0 && (
        <span>{fileCount} change{fileCount !== 1 ? "s" : ""}</span>
      )}

      {/* Editor info (when in editor view) */}
      {view === "editor" && activeEditorFile && (
        <div className="flex items-center gap-3">
          <span>Ln {editorState.cursorLine}, Col {editorState.cursorCol}</span>
          <span className="capitalize" style={getLanguageColor(activeEditorFile.filePath) ? { color: getLanguageColor(activeEditorFile.filePath) } : undefined}>{activeEditorFile.language}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span>Ctrl+1 Terminal</span>
        <span>Ctrl+2 Git</span>
        <span>Ctrl+3 Editor</span>
        <span>Ctrl+Tab Switch tab</span>

        {/* Add pane buttons */}
        <div className="flex items-center gap-1 ml-1 border-l border-ctp-surface0 pl-2">
          <button
            onClick={() => {
              if (!activeTabPath) return;
              const id = usePaneStore.getState().getActiveId(activeTabPath);
              const rect = getPaneRect(id);
              const dir = rect ? autoDirection(rect.width, rect.height) : "horizontal";
              usePaneStore.getState().split(activeTabPath, id, dir, "terminal");
            }}
            title="Add Terminal pane (auto direction)"
            className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
          >
            <TerminalSquare size={14} />
          </button>
          <button
            onClick={() => {
              if (!activeTabPath) return;
              const id = usePaneStore.getState().getActiveId(activeTabPath);
              const rect = getPaneRect(id);
              const dir = rect ? autoDirection(rect.width, rect.height) : "horizontal";
              usePaneStore.getState().split(activeTabPath, id, dir, "claude");
            }}
            title="Add Claude pane (auto direction)"
            className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-mauve transition-colors"
          >
            <Bot size={14} />
          </button>
          <button
            onClick={() => {
              if (!activeTabPath) return;
              const id = usePaneStore.getState().getActiveId(activeTabPath);
              usePaneStore.getState().toggleDirection(activeTabPath, id);
            }}
            title="Toggle split direction (Ctrl+Shift+T)"
            className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text transition-colors"
          >
            <ArrowLeftRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
