import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface ConsoleLog {
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
  url: string;
}

export type ConsoleFilter = "all" | "error" | "warn" | "info" | "log";
export type AnnotationTool = "pen" | "highlighter" | "rect" | "circle" | "arrow" | "text" | "select";

const MAX_CONSOLE_LOGS = 500;

export interface BrowserState {
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  title: string;
  webviewCreated: boolean;
  consoleLogs: ConsoleLog[];
  consoleFilter: ConsoleFilter;
  consolePanelOpen: boolean;
  // Annotation state
  annotationOpen: boolean;
  screenshotData: string | null;
  annotationTool: AnnotationTool;
  annotationColor: string;
  annotationStrokeWidth: number;
  // Float layout
  layoutMode: "docked" | "float";
  floatX: number;
  floatY: number;
  floatWidth: number;
  floatHeight: number;
}

const DEFAULT_STATE: BrowserState = {
  url: "about:blank",
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  title: "",
  webviewCreated: false,
  consoleLogs: [],
  consoleFilter: "all",
  consolePanelOpen: true,
  annotationOpen: false,
  screenshotData: null,
  annotationTool: "pen",
  annotationColor: "#f38ba8",
  annotationStrokeWidth: 3,
  layoutMode: "docked",
  floatX: 100,
  floatY: 100,
  floatWidth: 480,
  floatHeight: 360,
};

interface BrowserStore {
  states: Record<string, BrowserState>;
  getState: (projectPath: string) => BrowserState;
  setUrl: (projectPath: string, url: string) => void;
  setLoading: (projectPath: string, isLoading: boolean) => void;
  setNavState: (projectPath: string, canGoBack: boolean, canGoForward: boolean) => void;
  setTitle: (projectPath: string, title: string) => void;
  markWebviewCreated: (projectPath: string) => void;
  addLog: (projectPath: string, log: ConsoleLog) => void;
  clearLogs: (projectPath: string) => void;
  setConsoleFilter: (projectPath: string, filter: ConsoleFilter) => void;
  toggleConsolePanel: (projectPath: string) => void;
  openAnnotation: (projectPath: string, screenshotData: string) => void;
  closeAnnotation: (projectPath: string) => void;
  setAnnotationTool: (projectPath: string, tool: AnnotationTool) => void;
  setAnnotationColor: (projectPath: string, color: string) => void;
  setAnnotationStrokeWidth: (projectPath: string, width: number) => void;
  toggleLayoutMode: (projectPath: string) => void;
  setFloatPosition: (projectPath: string, x: number, y: number) => void;
  setFloatSize: (projectPath: string, width: number, height: number) => void;
  removeProject: (projectPath: string) => void;
}

/** Helper to update a single project's state */
function updateState(
  states: Record<string, BrowserState>,
  projectPath: string,
  patch: Partial<BrowserState>,
): Record<string, BrowserState> {
  return {
    ...states,
    [projectPath]: { ...(states[projectPath] ?? DEFAULT_STATE), ...patch },
  };
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  states: {},

  getState: (projectPath) => get().states[projectPath] ?? DEFAULT_STATE,

  setUrl: (projectPath, url) =>
    set((s) => ({ states: updateState(s.states, projectPath, { url }) })),

  setLoading: (projectPath, isLoading) =>
    set((s) => ({ states: updateState(s.states, projectPath, { isLoading }) })),

  setNavState: (projectPath, canGoBack, canGoForward) =>
    set((s) => ({ states: updateState(s.states, projectPath, { canGoBack, canGoForward }) })),

  setTitle: (projectPath, title) =>
    set((s) => ({ states: updateState(s.states, projectPath, { title }) })),

  markWebviewCreated: (projectPath) =>
    set((s) => ({ states: updateState(s.states, projectPath, { webviewCreated: true }) })),

  addLog: (projectPath, log) =>
    set((s) => {
      const current = s.states[projectPath] ?? DEFAULT_STATE;
      // FIFO eviction at MAX_CONSOLE_LOGS
      const logs = current.consoleLogs.length >= MAX_CONSOLE_LOGS
        ? [...current.consoleLogs.slice(1), log]
        : [...current.consoleLogs, log];
      return { states: updateState(s.states, projectPath, { consoleLogs: logs }) };
    }),

  clearLogs: (projectPath) =>
    set((s) => ({ states: updateState(s.states, projectPath, { consoleLogs: [] }) })),

  setConsoleFilter: (projectPath, filter) =>
    set((s) => ({ states: updateState(s.states, projectPath, { consoleFilter: filter }) })),

  toggleConsolePanel: (projectPath) =>
    set((s) => {
      const current = s.states[projectPath] ?? DEFAULT_STATE;
      return { states: updateState(s.states, projectPath, { consolePanelOpen: !current.consolePanelOpen }) };
    }),

  openAnnotation: (projectPath, screenshotData) =>
    set((s) => ({ states: updateState(s.states, projectPath, { annotationOpen: true, screenshotData }) })),

  closeAnnotation: (projectPath) =>
    set((s) => ({ states: updateState(s.states, projectPath, { annotationOpen: false, screenshotData: null }) })),

  setAnnotationTool: (projectPath, tool) =>
    set((s) => ({ states: updateState(s.states, projectPath, { annotationTool: tool }) })),

  setAnnotationColor: (projectPath, color) =>
    set((s) => ({ states: updateState(s.states, projectPath, { annotationColor: color }) })),

  setAnnotationStrokeWidth: (projectPath, width) =>
    set((s) => ({ states: updateState(s.states, projectPath, { annotationStrokeWidth: width }) })),

  toggleLayoutMode: (projectPath) =>
    set((s) => {
      const current = s.states[projectPath] ?? DEFAULT_STATE;
      return { states: updateState(s.states, projectPath, {
        layoutMode: current.layoutMode === "docked" ? "float" : "docked",
      }) };
    }),

  setFloatPosition: (projectPath, x, y) =>
    set((s) => ({ states: updateState(s.states, projectPath, { floatX: x, floatY: y }) })),

  setFloatSize: (projectPath, width, height) =>
    set((s) => ({ states: updateState(s.states, projectPath, { floatWidth: width, floatHeight: height }) })),

  removeProject: (projectPath) => {
    invoke("destroy_browser_webview", { projectId: projectPath }).catch(() => {});
    set((s) => {
      const { [projectPath]: _, ...rest } = s.states;
      return { states: rest };
    });
  },
}));
