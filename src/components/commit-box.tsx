import { useGitStore } from "@/stores/git-store";

interface CommitBoxProps {
  projectPath: string;
}

export function CommitBox({ projectPath }: CommitBoxProps) {
  const commit = useGitStore((s) => s.commit);
  const setCommitMessage = useGitStore((s) => s.setCommitMessage);
  const gitState = useGitStore((s) => s.getState(projectPath));

  const { commitMessage, files } = gitState;
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
  );
}
