import { useEditorStore } from "@/stores/editor-store";
import { EditorTabBar } from "@/components/editor-tab-bar";
import { EditorPane } from "@/components/editor-pane";
import { MarkdownPreview } from "@/components/markdown-preview";

interface SshEditorPaneProps {
  sessionId: string;
}

/** Lightweight Monaco editor embedded in SSH panel — no file explorer sidebar */
export function SshEditorPane({ sessionId }: SshEditorPaneProps) {
  const { activeFilePath, openFiles, previewModes } = useEditorStore((s) =>
    s.getState(sessionId),
  );
  const activeFile = openFiles.find((f) => f.filePath === activeFilePath);

  if (openFiles.length === 0) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <EditorTabBar projectPath={sessionId} />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div
          className={
            activeFile?.language === "markdown" &&
            previewModes[activeFilePath!]
              ? "hidden"
              : "flex-1 flex flex-col overflow-hidden"
          }
        >
          <EditorPane projectPath={sessionId} />
        </div>
        {activeFile?.language === "markdown" &&
          previewModes[activeFilePath!] && (
            <MarkdownPreview content={activeFile.content} />
          )}
      </div>
    </div>
  );
}
