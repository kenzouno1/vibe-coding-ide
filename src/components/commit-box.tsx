import { useGitStore } from "@/stores/git-store";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

interface CommitBoxProps {
  projectPath: string;
}

export function CommitBox({ projectPath }: CommitBoxProps) {
  const commit = useGitStore((s) => s.commit);
  const push = useGitStore((s) => s.push);
  const pull = useGitStore((s) => s.pull);
  const setCommitMessage = useGitStore((s) => s.setCommitMessage);
  const gitState = useGitStore((s) => s.getState(projectPath));

  const { commitMessage, files, ahead, behind, pushing, pulling } = gitState;
  const hasStagedFiles = files.some((f) => f.staged);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit(projectPath);
    }
  };

  return (
    <div className="border-t border-ctp-surface0 p-3">
      <textarea
        value={commitMessage}
        onChange={(e) => setCommitMessage(projectPath, e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Commit message..."
        className="w-full bg-ctp-surface0 text-ctp-text rounded px-3 py-2 text-sm resize-none
                   placeholder:text-ctp-overlay0 focus:outline-none focus:ring-1 focus:ring-ctp-mauve"
        rows={3}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-ctp-overlay0">Ctrl+Enter to commit</span>
        <div className="flex items-center gap-2">
          {/* Pull */}
          <button
            onClick={() => pull(projectPath)}
            disabled={pulling}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-ctp-surface1 text-ctp-text
                       hover:bg-ctp-surface2 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Pull from remote"
          >
            {pulling ? <Loader2 size={12} className="animate-spin" /> : <ArrowDown size={12} />}
            Pull
            {behind > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-ctp-yellow/20 text-ctp-yellow font-medium">
                {behind}
              </span>
            )}
          </button>

          {/* Push */}
          <button
            onClick={() => push(projectPath)}
            disabled={pushing}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-ctp-surface1 text-ctp-text
                       hover:bg-ctp-surface2 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Push to remote"
          >
            {pushing ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} />}
            Push
            {ahead > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-ctp-green/20 text-ctp-green font-medium">
                {ahead}
              </span>
            )}
          </button>

          {/* Commit */}
          <button
            onClick={() => commit(projectPath)}
            disabled={!hasStagedFiles || !commitMessage.trim()}
            className="px-4 py-1.5 text-sm rounded bg-ctp-mauve text-ctp-base font-medium
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
