import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { detectLanguage } from "../utils/language-detect";

export interface EditorFileTab {
  filePath: string;
  displayName: string;
  content: string;
  isDirty: boolean;
  language: string;
}

interface ProjectEditorState {
  openFiles: EditorFileTab[];
  activeFilePath: string | null;
  viewStates: Record<string, unknown>;
  previewModes: Record<string, boolean>;
  explorerWidth: number;
  cursorLine: number;
  cursorCol: number;
}

const DEFAULT_STATE: ProjectEditorState = {
  openFiles: [],
  activeFilePath: null,
  viewStates: {},
  previewModes: {},
  explorerWidth: 250,
  cursorLine: 1,
  cursorCol: 1,
};

interface EditorStore {
  states: Record<string, ProjectEditorState>;
  getState: (projectPath: string) => ProjectEditorState;
  openFile: (projectPath: string, filePath: string) => Promise<void>;
  closeFile: (projectPath: string, filePath: string) => void;
  setActiveFile: (projectPath: string, filePath: string) => void;
  setDirty: (projectPath: string, filePath: string, isDirty: boolean) => void;
  saveFile: (projectPath: string, filePath: string, content: string) => Promise<void>;
  saveViewState: (projectPath: string, filePath: string, viewState: unknown) => void;
  setExplorerWidth: (projectPath: string, width: number) => void;
  setCursorPosition: (projectPath: string, line: number, col: number) => void;
  updateContent: (projectPath: string, filePath: string, content: string) => void;
  togglePreview: (projectPath: string, filePath: string) => void;
  removeProject: (projectPath: string) => void;
}

/** Helper to update a single project's editor state */
function updateProjectState(
  states: Record<string, ProjectEditorState>,
  projectPath: string,
  patch: Partial<ProjectEditorState>,
): Record<string, ProjectEditorState> {
  return {
    ...states,
    [projectPath]: { ...(states[projectPath] || DEFAULT_STATE), ...patch },
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  states: {},

  getState: (projectPath) => {
    return get().states[projectPath] || DEFAULT_STATE;
  },

  openFile: async (projectPath, filePath) => {
    const state = get().getState(projectPath);

    // If already open, just activate it
    if (state.openFiles.some((f) => f.filePath === filePath)) {
      set((s) => ({
        states: updateProjectState(s.states, projectPath, { activeFilePath: filePath }),
      }));
      return;
    }

    try {
      const content = await invoke<string>("read_file", { path: filePath });
      const displayName = filePath.split(/[/\\]/).pop() ?? filePath;
      const language = detectLanguage(filePath);

      const newTab: EditorFileTab = { filePath, displayName, content, isDirty: false, language };
      const isMarkdown = language === "markdown";

      set((s) => {
        const current = s.states[projectPath] || DEFAULT_STATE;
        return {
          states: updateProjectState(s.states, projectPath, {
            openFiles: [...current.openFiles, newTab],
            activeFilePath: filePath,
            previewModes: isMarkdown
              ? { ...current.previewModes, [filePath]: true }
              : current.previewModes,
          }),
        };
      });
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  },

  closeFile: (projectPath, filePath) => {
    set((s) => {
      const current = s.states[projectPath] || DEFAULT_STATE;
      const newFiles = current.openFiles.filter((f) => f.filePath !== filePath);

      // If closing active file, select adjacent tab
      let newActive = current.activeFilePath;
      if (current.activeFilePath === filePath) {
        const idx = current.openFiles.findIndex((f) => f.filePath === filePath);
        newActive = newFiles[Math.min(idx, newFiles.length - 1)]?.filePath ?? null;
      }

      // Clean up view state and preview mode for closed file
      const { [filePath]: _, ...remainingViewStates } = current.viewStates;
      const { [filePath]: __, ...remainingPreviewModes } = current.previewModes;

      return {
        states: updateProjectState(s.states, projectPath, {
          openFiles: newFiles,
          activeFilePath: newActive,
          viewStates: remainingViewStates,
          previewModes: remainingPreviewModes,
        }),
      };
    });
  },

  setActiveFile: (projectPath, filePath) =>
    set((s) => ({
      states: updateProjectState(s.states, projectPath, { activeFilePath: filePath }),
    })),

  setDirty: (projectPath, filePath, isDirty) =>
    set((s) => {
      const current = s.states[projectPath] || DEFAULT_STATE;
      return {
        states: updateProjectState(s.states, projectPath, {
          openFiles: current.openFiles.map((f) =>
            f.filePath === filePath ? { ...f, isDirty } : f,
          ),
        }),
      };
    }),

  saveFile: async (projectPath, filePath, content) => {
    try {
      await invoke("write_file", { path: filePath, content });
      set((s) => {
        const current = s.states[projectPath] || DEFAULT_STATE;
        return {
          states: updateProjectState(s.states, projectPath, {
            openFiles: current.openFiles.map((f) =>
              f.filePath === filePath ? { ...f, content, isDirty: false } : f,
            ),
          }),
        };
      });
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  },

  saveViewState: (projectPath, filePath, viewState) =>
    set((s) => {
      const current = s.states[projectPath] || DEFAULT_STATE;
      return {
        states: updateProjectState(s.states, projectPath, {
          viewStates: { ...current.viewStates, [filePath]: viewState },
        }),
      };
    }),

  setExplorerWidth: (projectPath, width) =>
    set((s) => ({
      states: updateProjectState(s.states, projectPath, { explorerWidth: width }),
    })),

  setCursorPosition: (projectPath, line, col) =>
    set((s) => ({
      states: updateProjectState(s.states, projectPath, { cursorLine: line, cursorCol: col }),
    })),

  updateContent: (projectPath, filePath, content) =>
    set((s) => {
      const current = s.states[projectPath] || DEFAULT_STATE;
      return {
        states: updateProjectState(s.states, projectPath, {
          openFiles: current.openFiles.map((f) =>
            f.filePath === filePath ? { ...f, content } : f,
          ),
        }),
      };
    }),

  togglePreview: (projectPath, filePath) => {
    // Dispatch event so EditorPane can sync Monaco buffer to store before toggle
    window.dispatchEvent(new CustomEvent("devtools:sync-editor-content"));

    // Use setTimeout(0) to let the sync event handler run first
    setTimeout(() => {
      set((s) => {
        const current = s.states[projectPath] || DEFAULT_STATE;
        const currentMode = current.previewModes[filePath] ?? false;
        return {
          states: updateProjectState(s.states, projectPath, {
            previewModes: { ...current.previewModes, [filePath]: !currentMode },
          }),
        };
      });
    }, 0);
  },

  removeProject: (projectPath) =>
    set((s) => {
      const { [projectPath]: _, ...rest } = s.states;
      return { states: rest };
    }),
}));
