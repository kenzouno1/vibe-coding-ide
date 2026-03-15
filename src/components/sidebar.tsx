import { Terminal, GitBranch, Code } from "lucide-react";
import { useAppStore, type AppView } from "@/stores/app-store";

const NAV_ITEMS: { view: AppView; icon: typeof Terminal; label: string }[] = [
  { view: "terminal", icon: Terminal, label: "Terminal" },
  { view: "git", icon: GitBranch, label: "Git" },
  { view: "editor", icon: Code, label: "Editor" },
];

export function Sidebar() {
  const { view, setView } = useAppStore();

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
    </div>
  );
}
