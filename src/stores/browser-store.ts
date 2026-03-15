import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface BrowserState {
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  title: string;
  webviewCreated: boolean;
}

const DEFAULT_STATE: BrowserState = {
  url: "about:blank",
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  title: "",
  webviewCreated: false,
};

interface BrowserStore {
  states: Record<string, BrowserState>;
  getState: (projectPath: string) => BrowserState;
  setUrl: (projectPath: string, url: string) => void;
  setLoading: (projectPath: string, isLoading: boolean) => void;
  setNavState: (projectPath: string, canGoBack: boolean, canGoForward: boolean) => void;
  setTitle: (projectPath: string, title: string) => void;
  markWebviewCreated: (projectPath: string) => void;
  removeProject: (projectPath: string) => void;
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  states: {},

  getState: (projectPath) => {
    return get().states[projectPath] ?? DEFAULT_STATE;
  },

  setUrl: (projectPath, url) =>
    set((s) => ({
      states: {
        ...s.states,
        [projectPath]: { ...(s.states[projectPath] ?? DEFAULT_STATE), url },
      },
    })),

  setLoading: (projectPath, isLoading) =>
    set((s) => ({
      states: {
        ...s.states,
        [projectPath]: { ...(s.states[projectPath] ?? DEFAULT_STATE), isLoading },
      },
    })),

  setNavState: (projectPath, canGoBack, canGoForward) =>
    set((s) => ({
      states: {
        ...s.states,
        [projectPath]: {
          ...(s.states[projectPath] ?? DEFAULT_STATE),
          canGoBack,
          canGoForward,
        },
      },
    })),

  setTitle: (projectPath, title) =>
    set((s) => ({
      states: {
        ...s.states,
        [projectPath]: { ...(s.states[projectPath] ?? DEFAULT_STATE), title },
      },
    })),

  markWebviewCreated: (projectPath) =>
    set((s) => ({
      states: {
        ...s.states,
        [projectPath]: {
          ...(s.states[projectPath] ?? DEFAULT_STATE),
          webviewCreated: true,
        },
      },
    })),

  removeProject: (projectPath) => {
    // Destroy native webview
    invoke("destroy_browser_webview", { projectId: projectPath }).catch(() => {});
    set((s) => {
      const { [projectPath]: _, ...rest } = s.states;
      return { states: rest };
    });
  },
}));
