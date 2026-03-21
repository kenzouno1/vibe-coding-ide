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
  // Layout mode: docked in pane tree, pinned stays visible across view switches
  layoutMode: "docked" | "pinned";
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
};

interface BrowserStore {
  states: Record<string, BrowserState>;
  getState: (paneId: string) => BrowserState;
  setUrl: (paneId: string, url: string) => void;
  setLoading: (paneId: string, isLoading: boolean) => void;
  setNavState: (paneId: string, canGoBack: boolean, canGoForward: boolean) => void;
  setTitle: (paneId: string, title: string) => void;
  markWebviewCreated: (paneId: string) => void;
  addLog: (paneId: string, log: ConsoleLog) => void;
  clearLogs: (paneId: string) => void;
  setConsoleFilter: (paneId: string, filter: ConsoleFilter) => void;
  toggleConsolePanel: (paneId: string) => void;
  openAnnotation: (paneId: string, screenshotData: string) => void;
  closeAnnotation: (paneId: string) => void;
  setAnnotationTool: (paneId: string, tool: AnnotationTool) => void;
  setAnnotationColor: (paneId: string, color: string) => void;
  setAnnotationStrokeWidth: (paneId: string, width: number) => void;
  togglePinMode: (paneId: string) => void;
  /** Remove state for a single browser pane and destroy its webview */
  removePaneState: (paneId: string) => void;
  /** Remove all browser pane states for a project (on tab close) */
  removePanesForProject: (paneIds: string[]) => void;
}

/** Helper to update a single pane's state */
function updateState(
  states: Record<string, BrowserState>,
  paneId: string,
  patch: Partial<BrowserState>,
): Record<string, BrowserState> {
  return {
    ...states,
    [paneId]: { ...(states[paneId] ?? DEFAULT_STATE), ...patch },
  };
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  states: {},

  getState: (paneId) => get().states[paneId] ?? DEFAULT_STATE,

  setUrl: (paneId, url) =>
    set((s) => ({ states: updateState(s.states, paneId, { url }) })),

  setLoading: (paneId, isLoading) =>
    set((s) => ({ states: updateState(s.states, paneId, { isLoading }) })),

  setNavState: (paneId, canGoBack, canGoForward) =>
    set((s) => ({ states: updateState(s.states, paneId, { canGoBack, canGoForward }) })),

  setTitle: (paneId, title) =>
    set((s) => ({ states: updateState(s.states, paneId, { title }) })),

  markWebviewCreated: (paneId) =>
    set((s) => ({ states: updateState(s.states, paneId, { webviewCreated: true }) })),

  addLog: (paneId, log) =>
    set((s) => {
      const current = s.states[paneId] ?? DEFAULT_STATE;
      const logs = current.consoleLogs.length >= MAX_CONSOLE_LOGS
        ? [...current.consoleLogs.slice(1), log]
        : [...current.consoleLogs, log];
      return { states: updateState(s.states, paneId, { consoleLogs: logs }) };
    }),

  clearLogs: (paneId) =>
    set((s) => ({ states: updateState(s.states, paneId, { consoleLogs: [] }) })),

  setConsoleFilter: (paneId, filter) =>
    set((s) => ({ states: updateState(s.states, paneId, { consoleFilter: filter }) })),

  toggleConsolePanel: (paneId) =>
    set((s) => {
      const current = s.states[paneId] ?? DEFAULT_STATE;
      return { states: updateState(s.states, paneId, { consolePanelOpen: !current.consolePanelOpen }) };
    }),

  openAnnotation: (paneId, screenshotData) =>
    set((s) => ({ states: updateState(s.states, paneId, { annotationOpen: true, screenshotData }) })),

  closeAnnotation: (paneId) =>
    set((s) => ({ states: updateState(s.states, paneId, { annotationOpen: false, screenshotData: null }) })),

  setAnnotationTool: (paneId, tool) =>
    set((s) => ({ states: updateState(s.states, paneId, { annotationTool: tool }) })),

  setAnnotationColor: (paneId, color) =>
    set((s) => ({ states: updateState(s.states, paneId, { annotationColor: color }) })),

  setAnnotationStrokeWidth: (paneId, width) =>
    set((s) => ({ states: updateState(s.states, paneId, { annotationStrokeWidth: width }) })),

  togglePinMode: (paneId) =>
    set((s) => {
      const current = s.states[paneId] ?? DEFAULT_STATE;
      return { states: updateState(s.states, paneId, {
        layoutMode: current.layoutMode === "pinned" ? "docked" : "pinned",
      }) };
    }),

  removePaneState: (paneId) => {
    invoke("destroy_browser_webview", { paneId }).catch(() => {});
    set((s) => {
      const { [paneId]: _, ...rest } = s.states;
      return { states: rest };
    });
  },

  removePanesForProject: (paneIds) => {
    for (const paneId of paneIds) {
      invoke("destroy_browser_webview", { paneId }).catch(() => {});
    }
    set((s) => {
      const next = { ...s.states };
      for (const paneId of paneIds) {
        delete next[paneId];
      }
      return { states: next };
    });
  },
}));
