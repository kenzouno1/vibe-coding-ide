import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CursorStyle = "block" | "underline" | "bar";
export type PaneLayout = "terminal-only" | "terminal-claude" | "terminal-browser";
export type SplitDir = "horizontal" | "vertical";

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  cursorStyle: CursorStyle;
  scrollback: number;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
}

export interface LayoutSettings {
  defaultPaneLayout: PaneLayout;
  defaultSplitDirection: SplitDir;
}

export interface BrowserSettings {
  autoDetectServerUrls: boolean;
  consolePanelOpen: boolean;
}

export const DEFAULT_TERMINAL: TerminalSettings = {
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
  fontSize: 14,
  cursorBlink: true,
  cursorStyle: "block",
  scrollback: 1000,
};

export const DEFAULT_EDITOR: EditorSettings = {
  fontSize: 14,
  fontFamily: "",
  tabSize: 2,
  wordWrap: false,
  minimap: false,
};

export const DEFAULT_LAYOUT: LayoutSettings = {
  defaultPaneLayout: "terminal-claude",
  defaultSplitDirection: "horizontal",
};

export const DEFAULT_BROWSER: BrowserSettings = {
  autoDetectServerUrls: true,
  consolePanelOpen: true,
};

interface SettingsState {
  terminal: TerminalSettings;
  editor: EditorSettings;
  layout: LayoutSettings;
  browser: BrowserSettings;
  setTerminal: (patch: Partial<TerminalSettings>) => void;
  setEditor: (patch: Partial<EditorSettings>) => void;
  setLayout: (patch: Partial<LayoutSettings>) => void;
  setBrowser: (patch: Partial<BrowserSettings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      terminal: DEFAULT_TERMINAL,
      editor: DEFAULT_EDITOR,
      layout: DEFAULT_LAYOUT,
      browser: DEFAULT_BROWSER,

      setTerminal: (patch) =>
        set((s) => ({ terminal: { ...s.terminal, ...patch } })),
      setEditor: (patch) =>
        set((s) => ({ editor: { ...s.editor, ...patch } })),
      setLayout: (patch) =>
        set((s) => ({ layout: { ...s.layout, ...patch } })),
      setBrowser: (patch) =>
        set((s) => ({ browser: { ...s.browser, ...patch } })),
      reset: () =>
        set({
          terminal: DEFAULT_TERMINAL,
          editor: DEFAULT_EDITOR,
          layout: DEFAULT_LAYOUT,
          browser: DEFAULT_BROWSER,
        }),
    }),
    {
      name: "devtools-settings",
      version: 1,
    },
  ),
);
