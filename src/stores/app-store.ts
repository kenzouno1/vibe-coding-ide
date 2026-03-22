import { create } from "zustand";

export type CoreView = "terminal" | "git" | "editor" | "settings";
export type AppView = CoreView | (string & {});

interface AppStore {
  view: AppView;
  setView: (view: AppView) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  view: "terminal",
  setView: (view) => set({ view }),
}));
