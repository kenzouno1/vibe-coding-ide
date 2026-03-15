import { useState, useRef, useEffect } from "react";
import { useGitStore } from "@/stores/git-store";
import { GitBranch, ChevronDown, ArrowUp, ArrowDown, Plus, Check } from "lucide-react";

interface GitBranchBarProps {
  projectPath: string;
}

export function GitBranchBar({ projectPath }: GitBranchBarProps) {
  const gitState = useGitStore((s) => s.getState(projectPath));
  const fetchBranches = useGitStore((s) => s.fetchBranches);
  const switchBranch = useGitStore((s) => s.switchBranch);
  const createBranch = useGitStore((s) => s.createBranch);

  const { branch, ahead, behind, branches } = gitState;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  // Fetch branches when dropdown opens
  useEffect(() => {
    if (open) {
      fetchBranches(projectPath);
      setTimeout(() => filterRef.current?.focus(), 50);
    } else {
      setFilter("");
      setCreating(false);
      setNewName("");
    }
  }, [open, projectPath, fetchBranches]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const localBranches = branches.filter((b) => !b.is_remote);
  const filtered = filter
    ? localBranches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : localBranches;

  const handleSwitch = async (name: string) => {
    setOpen(false);
    await switchBranch(projectPath, name);
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setOpen(false);
    await createBranch(projectPath, trimmed, true);
  };

  return (
    <div className="relative flex items-center gap-1.5" ref={dropdownRef}>
      {/* Branch name trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-ctp-surface0 text-sm font-medium text-ctp-subtext1"
      >
        <GitBranch size={14} className="text-ctp-mauve" />
        <span className="max-w-[140px] truncate">{branch || "No branch"}</span>
        <ChevronDown size={12} className="text-ctp-overlay1" />
      </button>

      {/* Ahead/behind badges */}
      {ahead > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-ctp-green" title={`${ahead} commit(s) to push`}>
          <ArrowUp size={11} />{ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-ctp-yellow" title={`${behind} commit(s) to pull`}>
          <ArrowDown size={11} />{behind}
        </span>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 bg-ctp-surface0 border border-ctp-surface1 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Search filter */}
          <div className="p-2 border-b border-ctp-surface1">
            <input
              ref={filterRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter branches..."
              className="w-full bg-ctp-base text-ctp-text rounded px-2 py-1 text-xs placeholder:text-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-mauve"
            />
          </div>

          {/* Branch list */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={b.name}
                onClick={() => !b.is_current && handleSwitch(b.name)}
                disabled={b.is_current}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-ctp-surface1 ${
                  b.is_current ? "text-ctp-mauve font-semibold" : "text-ctp-text"
                }`}
              >
                {b.is_current ? <Check size={12} className="text-ctp-mauve" /> : <span className="w-3" />}
                <span className="truncate">{b.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-ctp-overlay0">No branches found</div>
            )}
          </div>

          {/* Create branch */}
          <div className="border-t border-ctp-surface1 p-2">
            {creating ? (
              <div className="flex items-center gap-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="new-branch-name"
                  className="flex-1 bg-ctp-base text-ctp-text rounded px-2 py-1 text-xs placeholder:text-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-green"
                  autoFocus
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="p-1 rounded hover:bg-ctp-surface1 text-ctp-green disabled:opacity-40"
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 text-xs text-ctp-green hover:text-ctp-green/80"
              >
                <Plus size={12} /> Create branch
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
