import { Terminal, GitBranch, Code, Settings } from "lucide-react";
import { useAppStore, type AppView } from "@/stores/app-store";
import { getPlugins } from "@/plugins/plugin-registry";
import { usePluginStore } from "@/stores/plugin-store";

const CORE_NAV: { view: AppView; icon: typeof Terminal; label: string }[] = [
  { view: "terminal", icon: Terminal, label: "Terminal" },
  { view: "git", icon: GitBranch, label: "Git" },
  { view: "editor", icon: Code, label: "Editor" },
];

export function Sidebar() {
  const { view, setView } = useAppStore();
  const enabledIds = usePluginStore((s) => s.enabledIds);

  const pluginItems = getPlugins()
    .filter((p) => enabledIds.includes(p.id))
    .sort((a, b) => (a.sidebarOrder ?? 99) - (b.sidebarOrder ?? 99));

  return (
    <div className="w-12 flex-shrink-0 bg-ctp-mantle flex flex-col items-center py-2 gap-1 border-r border-ctp-surface0">
      {CORE_NAV.map(({ view: v, icon: Icon, label }) => (
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
      {pluginItems.map((plugin) => {
        const Icon = plugin.icon;
        return (
          <button
            key={plugin.id}
            onClick={() => setView(plugin.viewId)}
            title={plugin.name}
            className={`p-2.5 rounded-lg transition-colors ${
              view === plugin.viewId
                ? "bg-ctp-surface0 text-ctp-mauve"
                : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
      <div className="mt-auto">
        <button
          onClick={() => setView("settings")}
          title="Settings (Ctrl+,)"
          className={`p-2.5 rounded-lg transition-colors ${
            view === "settings"
              ? "bg-ctp-surface0 text-ctp-mauve"
              : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
          }`}
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
