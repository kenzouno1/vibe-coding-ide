import { memo, useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Shield, Cpu } from "lucide-react";

/** Available Claude models */
const MODELS = [
  { id: "", label: "Default", desc: "CLI default" },
  { id: "claude-opus-4-6", label: "Opus 4.6", desc: "Most capable" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", desc: "Fast + smart" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", desc: "Fastest" },
];

/** Available permission modes */
const MODES = [
  { id: "", label: "Default", desc: "Auto-accept edits" },
  { id: "plan", label: "Plan", desc: "Read-only analysis" },
  { id: "acceptEdits", label: "Accept Edits", desc: "Auto-accept file changes" },
  { id: "bypassPermissions", label: "Bypass", desc: "Skip all prompts" },
  { id: "default", label: "Ask", desc: "Prompt for permissions" },
];

interface DropdownProps {
  items: { id: string; label: string; desc: string }[];
  value: string;
  onChange: (id: string) => void;
  icon: React.ReactNode;
  title: string;
  /** Open upward instead of downward */
  dropUp?: boolean;
}

/** Compact dropdown selector */
function MiniDropdown({ items, value, onChange, icon, title, dropUp }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = items.find((i) => i.id === value) ?? items[0];

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id || "");
      setOpen(false);
    },
    [onChange],
  );

  const Chevron = dropUp ? ChevronUp : ChevronDown;
  const positionClass = dropUp
    ? "bottom-full left-0 mb-1"
    : "top-full left-0 mt-1";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={title}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]
                   bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-subtext0
                   hover:text-ctp-text transition-colors"
      >
        {icon}
        <span className="max-w-[60px] truncate">{current.label}</span>
        <Chevron size={8} />
      </button>
      {open && (
        <div className={`absolute ${positionClass} w-44 bg-ctp-surface0 border border-ctp-surface1
                        rounded-lg shadow-lg z-50 overflow-hidden`}>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`w-full text-left px-3 py-1.5 text-xs flex justify-between items-center
                ${item.id === value ? "bg-ctp-surface1 text-ctp-text" : "text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"}`}
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-[10px] text-ctp-overlay0">{item.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ClaudeHeaderControlsProps {
  modelOverride: string | null;
  permissionMode: string | null;
  onModelChange: (model: string | null) => void;
  onModeChange: (mode: string | null) => void;
  /** Open dropdowns upward (for bottom placement) */
  dropUp?: boolean;
}

export const ClaudeHeaderControls = memo(function ClaudeHeaderControls({
  modelOverride,
  permissionMode,
  onModelChange,
  onModeChange,
  dropUp,
}: ClaudeHeaderControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <MiniDropdown
        items={MODELS}
        value={modelOverride ?? ""}
        onChange={(id) => onModelChange(id || null)}
        icon={<Cpu size={10} className="text-ctp-mauve" />}
        title="Select model"
        dropUp={dropUp}
      />
      <MiniDropdown
        items={MODES}
        value={permissionMode ?? ""}
        onChange={(id) => onModeChange(id || null)}
        icon={<Shield size={10} className="text-ctp-yellow" />}
        title="Permission mode"
        dropUp={dropUp}
      />
    </div>
  );
});
