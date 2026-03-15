import { useCallback, useRef } from "react";
import { FileExplorer } from "@/components/file-explorer";
import { EditorTabBar } from "@/components/editor-tab-bar";
import { EditorPane } from "@/components/editor-pane";
import { MarkdownPreview } from "@/components/markdown-preview";
import { useEditorStore } from "@/stores/editor-store";
import { File } from "lucide-react";

interface EditorViewProps {
  projectPath: string;
}

export function EditorView({ projectPath }: EditorViewProps) {
  const { explorerWidth, activeFilePath, openFiles, previewModes } = useEditorStore((s) => s.getState(projectPath));
  const setExplorerWidth = useEditorStore((s) => s.setExplorerWidth);
  const activeFile = openFiles.find((f) => f.filePath === activeFilePath);

  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(150, Math.min(500, moveEvent.clientX - rect.left));
      setExplorerWidth(projectPath, newWidth);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [projectPath, setExplorerWidth]);

  return (
    <div ref={containerRef} className="h-full flex overflow-hidden">
      {/* File explorer panel */}
      <div style={{ width: explorerWidth, minWidth: 150, maxWidth: 500 }} className="flex-shrink-0">
        <FileExplorer projectPath={projectPath} />
      </div>

      {/* Resize handle */}
      <div
        className="w-px bg-ctp-surface0 hover:bg-ctp-mauve cursor-col-resize flex-shrink-0 transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeFilePath ? (
          <>
            <EditorTabBar projectPath={projectPath} />
            {/* Keep EditorPane always mounted to preserve Monaco state & Ctrl+S */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <div className={activeFile?.language === "markdown" && previewModes[activeFilePath] ? "hidden" : "flex-1 flex flex-col overflow-hidden"}>
                <EditorPane projectPath={projectPath} />
              </div>
              {activeFile?.language === "markdown" && previewModes[activeFilePath] && (
                <MarkdownPreview content={activeFile.content} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-ctp-overlay0 gap-2">
            <File size={48} className="text-ctp-surface1" />
            <span className="text-sm">Open a file from the explorer</span>
          </div>
        )}
      </div>
    </div>
  );
}
