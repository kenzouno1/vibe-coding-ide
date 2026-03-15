import { useState, useRef, useEffect } from "react";
import { useGitStore } from "@/stores/git-store";
import { Tag, X, Check } from "lucide-react";

interface GitTagPopoverProps {
  projectPath: string;
}

export function GitTagPopover({ projectPath }: GitTagPopoverProps) {
  const gitState = useGitStore((s) => s.getState(projectPath));
  const fetchTags = useGitStore((s) => s.fetchTags);
  const createTag = useGitStore((s) => s.createTag);
  const deleteTag = useGitStore((s) => s.deleteTag);

  const { tags } = gitState;
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [annotated, setAnnotated] = useState(false);
  const [message, setMessage] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch tags when popover opens
  useEffect(() => {
    if (open) fetchTags(projectPath);
    else {
      setNewName("");
      setAnnotated(false);
      setMessage("");
    }
  }, [open, projectPath, fetchTags]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await createTag(projectPath, trimmed, annotated ? message : undefined);
    setNewName("");
    setMessage("");
    setAnnotated(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1"
        title="Tags"
      >
        <Tag size={14} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-ctp-surface0 border border-ctp-surface1 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-1.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide border-b border-ctp-surface1">
            Tags ({tags.length})
          </div>

          {/* Tag list */}
          <div className="max-h-40 overflow-y-auto">
            {tags.length === 0 && (
              <div className="px-3 py-2 text-xs text-ctp-overlay0">No tags</div>
            )}
            {tags.map((tag) => (
              <div key={tag} className="flex items-center justify-between px-3 py-1.5 text-xs text-ctp-text hover:bg-ctp-surface1 group">
                <span className="truncate">{tag}</span>
                <button
                  onClick={() => deleteTag(projectPath, tag)}
                  className="p-0.5 rounded hover:bg-ctp-surface2 text-ctp-red opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete tag"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Create tag */}
          <div className="border-t border-ctp-surface1 p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !annotated && handleCreate()}
                placeholder="New tag name..."
                className="flex-1 bg-ctp-base text-ctp-text rounded px-2 py-1 text-xs placeholder:text-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-mauve"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="p-1 rounded hover:bg-ctp-surface1 text-ctp-green disabled:opacity-40"
              >
                <Check size={14} />
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-ctp-subtext0 cursor-pointer">
              <input
                type="checkbox"
                checked={annotated}
                onChange={(e) => setAnnotated(e.target.checked)}
                className="rounded border-ctp-surface2 accent-ctp-mauve"
              />
              Annotated
            </label>
            {annotated && (
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Tag message..."
                className="w-full bg-ctp-base text-ctp-text rounded px-2 py-1 text-xs placeholder:text-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-mauve"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
