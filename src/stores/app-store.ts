import { create } from "zustand";

export type AppView = "terminal" | "git";

interface AppStore {
  view: AppView;
  setView: (view: AppView) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  view: "terminal",
  setView: (view) => set({ view }),
}));
