import { useProjectStore } from "@/stores/project-store";
import { Plus, X } from "lucide-react";

export function TabBar() {
  const { openTabs, activeTabPath, setActiveTab, closeTab, addProject } =
    useProjectStore();

  return (
    <div className="h-9 flex items-center bg-ctp-crust border-b border-ctp-surface0 overflow-x-auto">
      {openTabs.map((tab) => {
        const isActive = tab.path === activeTabPath;
        return (
          <div
            key={tab.path}
            onClick={() => setActiveTab(tab.path)}
            title={tab.path}
            className={`group flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer
              border-r border-ctp-surface0 max-w-[160px] shrink-0 transition-colors
              ${isActive
                ? "bg-ctp-base text-ctp-text border-b-2 border-b-ctp-mauve"
                : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
              }`}
          >
            <span className="truncate flex-1">{tab.displayName}</span>
            {openTabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100
                           hover:bg-ctp-surface1 text-ctp-overlay0 transition-opacity"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={addProject}
        title="Open project"
        className="p-2 text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 shrink-0"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
