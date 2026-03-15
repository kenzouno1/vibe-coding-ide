import { useCallback } from "react";
import { X, Eye, Code } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { getLanguageColor } from "@/utils/language-detect";

interface EditorTabBarProps {
  projectPath: string;
}

export function EditorTabBar({ projectPath }: EditorTabBarProps) {
  const { openFiles, activeFilePath, previewModes } = useEditorStore((s) => s.getState(projectPath));
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const closeFile = useEditorStore((s) => s.closeFile);
  const togglePreview = useEditorStore((s) => s.togglePreview);

  const handleClose = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation();
      closeFile(projectPath, filePath);
    },
    [projectPath, closeFile],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault();
        closeFile(projectPath, filePath);
      }
    },
    [projectPath, closeFile],
  );

  if (openFiles.length === 0) return null;

  const activeFile = openFiles.find((f) => f.filePath === activeFilePath);
  const isMarkdownFile = activeFile?.language === "markdown";
  const isPreview = isMarkdownFile && (previewModes[activeFilePath!] ?? false);

  return (
    <div className="flex bg-ctp-mantle border-b border-ctp-surface0 overflow-x-auto overflow-y-hidden">
      {openFiles.map((file) => {
        const isActive = file.filePath === activeFilePath;
        const langColor = getLanguageColor(file.filePath);
        return (
          <div
            key={file.filePath}
            onClick={() => setActiveFile(projectPath, file.filePath)}
            onMouseDown={(e) => handleMouseDown(e, file.filePath)}
            title={file.filePath}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-ctp-surface0 flex-shrink-0 transition-colors ${
              isActive
                ? "bg-ctp-base text-ctp-text border-b-2 border-b-ctp-mauve"
                : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
            }`}
          >
            {/* Language color dot or dirty indicator */}
            {file.isDirty ? (
              <span className="text-ctp-peach text-[10px]">●</span>
            ) : langColor ? (
              <span className="text-[10px]" style={{ color: langColor }}>●</span>
            ) : null}

            <span className="truncate max-w-[120px]">{file.displayName}</span>

            <button
              onClick={(e) => handleClose(e, file.filePath)}
              className="p-0.5 rounded hover:bg-ctp-surface1 text-ctp-overlay0 hover:text-ctp-text transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {/* Spacer pushes toggle to the right */}
      <div className="flex-1" />

      {/* Preview toggle for markdown files */}
      {isMarkdownFile && activeFilePath && (
        <button
          onClick={() => togglePreview(projectPath, activeFilePath)}
          title={isPreview ? "Edit markdown" : "Preview markdown"}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors flex-shrink-0"
        >
          {isPreview ? <Code size={14} /> : <Eye size={14} />}
          <span>{isPreview ? "Edit" : "Preview"}</span>
        </button>
      )}
    </div>
  );
}
