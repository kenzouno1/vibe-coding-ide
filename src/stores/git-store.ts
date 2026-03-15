import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface ProjectGitState {
  branch: string;
  files: GitFileStatus[];
  selectedFile: string | null;
  diff: string;
  commitMessage: string;
  loading: boolean;
}

const DEFAULT_STATE: ProjectGitState = {
  branch: "",
  files: [],
  selectedFile: null,
  diff: "",
  commitMessage: "",
  loading: false,
};

interface GitStore {
  /** Per-project git state */
  states: Record<string, ProjectGitState>;

  getState: (projectPath: string) => ProjectGitState;
  setCommitMessage: (projectPath: string, msg: string) => void;
  selectFile: (projectPath: string, path: string, staged: boolean) => void;
  refresh: (projectPath: string) => Promise<void>;
  stageFile: (projectPath: string, path: string) => Promise<void>;
  unstageFile: (projectPath: string, path: string) => Promise<void>;
  commit: (projectPath: string) => Promise<void>;
  removeProject: (projectPath: string) => void;
}

/** Helper to update a single project's git state */
function updateProjectState(
  states: Record<string, ProjectGitState>,
  projectPath: string,
  patch: Partial<ProjectGitState>,
): Record<string, ProjectGitState> {
  return {
    ...states,
    [projectPath]: { ...(states[projectPath] || DEFAULT_STATE), ...patch },
  };
}

export const useGitStore = create<GitStore>((set, get) => ({
  states: {},

  getState: (projectPath) => {
    return get().states[projectPath] || DEFAULT_STATE;
  },

  setCommitMessage: (projectPath, msg) =>
    set((s) => ({
      states: updateProjectState(s.states, projectPath, { commitMessage: msg }),
    })),

  selectFile: async (projectPath, path, staged) => {
    try {
      const diff = await invoke<string>("git_diff", { cwd: projectPath, path, staged });
      set((s) => ({
        states: updateProjectState(s.states, projectPath, { selectedFile: path, diff }),
      }));
    } catch {
      set((s) => ({
        states: updateProjectState(s.states, projectPath, { selectedFile: path, diff: "" }),
      }));
    }
  },

  refresh: async (projectPath) => {
    set((s) => ({
      states: updateProjectState(s.states, projectPath, { loading: true }),
    }));
    try {
      const result = await invoke<{ branch: string; files: GitFileStatus[] }>(
        "git_status",
        { cwd: projectPath },
      );
      set((s) => ({
        states: updateProjectState(s.states, projectPath, {
          branch: result.branch,
          files: result.files,
          loading: false,
        }),
      }));
    } catch {
      set((s) => ({
        states: updateProjectState(s.states, projectPath, { loading: false }),
      }));
    }
  },

  stageFile: async (projectPath, path) => {
    await invoke("git_add", { cwd: projectPath, path });
    await get().refresh(projectPath);
  },

  unstageFile: async (projectPath, path) => {
    await invoke("git_reset", { cwd: projectPath, path });
    await get().refresh(projectPath);
  },

  commit: async (projectPath) => {
    const state = get().getState(projectPath);
    if (!state.commitMessage.trim()) return;
    await invoke("git_commit", { cwd: projectPath, message: state.commitMessage });
    set((s) => ({
      states: updateProjectState(s.states, projectPath, {
        commitMessage: "",
        diff: "",
        selectedFile: null,
      }),
    }));
    await get().refresh(projectPath);
  },

  removeProject: (projectPath) =>
    set((s) => {
      const { [projectPath]: _, ...rest } = s.states;
      return { states: rest };
    }),
}));
