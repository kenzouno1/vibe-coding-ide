import { memo, useCallback, useEffect, useRef } from "react";
import { Command, Zap, Settings, Globe, FolderOpen } from "lucide-react";
import type { SlashCommand, CommandCategory } from "@/data/slash-commands";
import { CATEGORY_LABELS } from "@/data/slash-commands";

const CATEGORY_ICONS: Record<CommandCategory, typeof Command> = {
  local: Command,
  mapped: Settings,
  skill: Zap,
  global: Globe,
  project: FolderOpen,
};

const CATEGORY_COLORS: Record<CommandCategory, string> = {
  local: "text-ctp-blue",
  mapped: "text-ctp-yellow",
  skill: "text-ctp-green",
  global: "text-ctp-peach",
  project: "text-ctp-teal",
};

interface SlashCommandDropdownProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export const SlashCommandDropdown = memo(function SlashCommandDropdown({
  commands,
  selectedIndex,
  onSelect,
}: SlashCommandDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleClick = useCallback(
    (cmd: SlashCommand) => (e: React.MouseEvent) => {
      e.preventDefault();
      onSelect(cmd);
    },
    [onSelect],
  );

  if (commands.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto
                 bg-ctp-surface0 border border-ctp-surface1 rounded-lg shadow-lg z-50"
    >
      {commands.map((cmd, i) => {
        const Icon = CATEGORY_ICONS[cmd.category];
        const isSelected = i === selectedIndex;
        return (
          <button
            key={cmd.name}
            onMouseDown={handleClick(cmd)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left
              ${isSelected ? "bg-ctp-surface1 text-ctp-text" : "text-ctp-subtext0 hover:bg-ctp-surface1"}`}
          >
            <Icon size={12} className={CATEGORY_COLORS[cmd.category]} />
            <span className="font-medium text-ctp-text">/{cmd.name}</span>
            <span className="flex-1 truncate text-xs text-ctp-overlay0">{cmd.description}</span>
            <span className="text-[10px] text-ctp-overlay0">{CATEGORY_LABELS[cmd.category]}</span>
          </button>
        );
      })}
    </div>
  );
});
