import { Terminal, GitBranch, Code, Monitor, Globe } from "lucide-react";
import { useAppStore, type AppView } from "@/stores/app-store";
import { usePaneStore, autoDirection } from "@/stores/pane-store";
import { useProjectStore } from "@/stores/project-store";
import { getPaneRect } from "@/utils/pane-container-registry";

const NAV_ITEMS: { view: AppView; icon: typeof Terminal; label: string }[] = [
  { view: "terminal", icon: Terminal, label: "Terminal" },
  { view: "git", icon: GitBranch, label: "Git" },
  { view: "editor", icon: Code, label: "Editor" },
  { view: "ssh", icon: Monitor, label: "SSH" },
];

export function Sidebar() {
  const { view, setView } = useAppStore();

  const openBrowserPane = () => {
    const project = useProjectStore.getState().activeTabPath;
    if (!project) return;
    // Switch to terminal view if not already there
    if (view !== "terminal") setView("terminal");
    const paneStore = usePaneStore.getState();
    const activeId = paneStore.getActiveId(project);
    const rect = getPaneRect(activeId);
    const dir = rect ? autoDirection(rect.width, rect.height) : "horizontal";
    paneStore.split(project, activeId, dir, "browser");
  };

  return (
    <div className="w-12 flex-shrink-0 bg-ctp-mantle flex flex-col items-center py-2 gap-1 border-r border-ctp-surface0">
      {NAV_ITEMS.map(({ view: v, icon: Icon, label }) => (
        <button
          key={v}
          onClick={() => setView(v)}
          title={label}
          className={`p-2.5 rounded-lg transition-colors ${
            view === v
              ? "bg-ctp-surface0 text-ctp-mauve"
              : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
          }`}
        >
          <Icon size={18} />
        </button>
      ))}
      {/* Browser pane — opens in terminal split */}
      <button
        onClick={openBrowserPane}
        title="Open Browser (Ctrl+Shift+B)"
        className="p-2.5 rounded-lg transition-colors text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
      >
        <Globe size={18} />
      </button>
    </div>
  );
}
