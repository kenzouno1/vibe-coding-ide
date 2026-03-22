import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAppStore } from "@/stores/app-store";
import { getPlugin } from "@/plugins/plugin-registry";

interface PluginStore {
  enabledIds: string[];
  isEnabled: (id: string) => boolean;
  toggle: (id: string) => void;
  enable: (id: string) => void;
  disable: (id: string) => void;
}

export const usePluginStore = create<PluginStore>()(
  persist(
    (set, get) => ({
      enabledIds: ["ssh"], // SSH enabled by default for backward compat
      isEnabled: (id) => get().enabledIds.includes(id),
      toggle: (id) => {
        if (get().enabledIds.includes(id)) {
          get().disable(id);
        } else {
          get().enable(id);
        }
      },
      enable: (id) =>
        set((s) => ({
          enabledIds: s.enabledIds.includes(id)
            ? s.enabledIds
            : [...s.enabledIds, id],
        })),
      disable: (id) => {
        // Fall back to terminal if currently viewing the disabled plugin
        const viewId = getPlugin(id)?.viewId ?? id;
        if (useAppStore.getState().view === viewId) {
          useAppStore.getState().setView("terminal");
        }
        set((s) => ({
          enabledIds: s.enabledIds.filter((x) => x !== id),
        }));
      },
    }),
    { name: "devtools-plugins", version: 1 },
  ),
);
