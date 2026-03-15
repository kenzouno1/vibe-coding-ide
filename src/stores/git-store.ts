import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

interface ProjectGitState {
  branch: string;
  files: GitFileStatus[];
  selectedFile: string | null;
  diff: string;
  commitMessage: string;
  loading: boolean;
  ahead: number;
  behind: number;
  branches: BranchInfo[];
  tags: string[];
  pushing: boolean;
  pulling: boolean;
}

const DEFAULT_STATE: ProjectGitState = {
  branch: "",
  files: [],
  selectedFile: null,
  diff: "",
  commitMessage: "",
  loading: false,
  ahead: 0,
  behind: 0,
  branches: [],
  tags: [],
  pushing: false,
  pulling: false,
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
  fetchBranches: (projectPath: string) => Promise<void>;
  switchBranch: (projectPath: string, name: string) => Promise<void>;
  createBranch: (projectPath: string, name: string, checkout: boolean) => Promise<void>;
  push: (projectPath: string) => Promise<void>;
  pull: (projectPath: string) => Promise<void>;
  fetchTags: (projectPath: string) => Promise<void>;
  createTag: (projectPath: string, name: string, message?: string) => Promise<void>;
  deleteTag: (projectPath: string, name: string) => Promise<void>;
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
      // Fetch status and ahead/behind in parallel
      const [result, ab] = await Promise.all([
        invoke<{ branch: string; files: GitFileStatus[] }>("git_status", { cwd: projectPath }),
        invoke<{ ahead: number; behind: number }>("git_ahead_behind", { cwd: projectPath }).catch(() => ({ ahead: 0, behind: 0 })),
      ]);
      set((s) => ({
        states: updateProjectState(s.states, projectPath, {
          branch: result.branch,
          files: result.files,
          ahead: ab.ahead,
          behind: ab.behind,
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

  fetchBranches: async (projectPath) => {
    try {
      const branches = await invoke<BranchInfo[]>("git_branches", { cwd: projectPath });
      set((s) => ({
        states: updateProjectState(s.states, projectPath, { branches }),
      }));
    } catch { /* ignore */ }
  },

  switchBranch: async (projectPath, name) => {
    await invoke("git_switch_branch", { cwd: projectPath, name });
    await get().refresh(projectPath);
  },

  createBranch: async (projectPath, name, checkout) => {
    await invoke("git_create_branch", { cwd: projectPath, name, checkout });
    await get().refresh(projectPath);
  },

  push: async (projectPath) => {
    set((s) => ({ states: updateProjectState(s.states, projectPath, { pushing: true }) }));
    try {
      await invoke("git_push", { cwd: projectPath });
    } finally {
      set((s) => ({ states: updateProjectState(s.states, projectPath, { pushing: false }) }));
      await get().refresh(projectPath);
    }
  },

  pull: async (projectPath) => {
    set((s) => ({ states: updateProjectState(s.states, projectPath, { pulling: true }) }));
    try {
      await invoke("git_pull", { cwd: projectPath });
    } finally {
      set((s) => ({ states: updateProjectState(s.states, projectPath, { pulling: false }) }));
      await get().refresh(projectPath);
    }
  },

  fetchTags: async (projectPath) => {
    try {
      const tags = await invoke<string[]>("git_tags", { cwd: projectPath });
      set((s) => ({
        states: updateProjectState(s.states, projectPath, { tags }),
      }));
    } catch { /* ignore */ }
  },

  createTag: async (projectPath, name, message?) => {
    await invoke("git_create_tag", { cwd: projectPath, name, message: message || null });
    await get().fetchTags(projectPath);
  },

  deleteTag: async (projectPath, name) => {
    await invoke("git_delete_tag", { cwd: projectPath, name });
    await get().fetchTags(projectPath);
  },
}));
