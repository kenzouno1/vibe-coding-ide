import { useEffect } from "react";
import { SplitPaneContainer } from "@/components/split-pane-container";
import { GitPanel } from "@/components/git-panel";
import { EditorView } from "@/components/editor-view";
import { Sidebar } from "@/components/sidebar";
import { StatusBar } from "@/components/status-bar";
import { TabBar } from "@/components/tab-bar";
import { TitleBar } from "@/components/title-bar";
import { useAppStore } from "@/stores/app-store";
import { useGitStore } from "@/stores/git-store";
import { useProjectStore } from "@/stores/project-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSessionPersistence } from "@/hooks/use-session-persistence";

export function App() {
  useKeyboardShortcuts();
  useSessionPersistence();

  const view = useAppStore((s) => s.view);
  const openTabs = useProjectStore((s) => s.openTabs);
  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const gitRefresh = useGitStore((s) => s.refresh);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Refresh git when switching to git view or changing active tab
  useEffect(() => {
    if (view === "git" && activeTabPath) gitRefresh(activeTabPath);
  }, [view, activeTabPath, gitRefresh]);

  return (
    <div className="h-screen w-screen bg-ctp-base text-ctp-text flex flex-col overflow-hidden">
      <TitleBar />
      <TabBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden relative">
          {openTabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                className="absolute inset-0"
                style={{
                  visibility: isActive ? "visible" : "hidden",
                  zIndex: isActive ? 1 : 0,
                }}
              >
                {/* Terminal view */}
                <div
                  className="absolute inset-0"
                  style={{
                    visibility: view === "terminal" ? "visible" : "hidden",
                    zIndex: view === "terminal" ? 1 : 0,
                  }}
                >
                  <SplitPaneContainer projectPath={tab.path} />
                </div>
                {/* Git view */}
                <div
                  className="absolute inset-0"
                  style={{
                    visibility: view === "git" ? "visible" : "hidden",
                    zIndex: view === "git" ? 1 : 0,
                  }}
                >
                  <GitPanel projectPath={tab.path} />
                </div>
                {/* Editor view */}
                <div
                  className="absolute inset-0"
                  style={{
                    visibility: view === "editor" ? "visible" : "hidden",
                    zIndex: view === "editor" ? 1 : 0,
                  }}
                >
                  <EditorView projectPath={tab.path} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
