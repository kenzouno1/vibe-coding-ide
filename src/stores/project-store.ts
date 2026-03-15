import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { usePaneStore } from "@/stores/pane-store";
import { useGitStore } from "@/stores/git-store";

const STORAGE_KEY_TABS = "devtools-open-tabs";
const STORAGE_KEY_ACTIVE = "devtools-active-tab";

export interface ProjectTab {
  path: string;
  displayName: string;
}

/** Extract last folder segment as display name */
function toDisplayName(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

function loadSavedTabs(): ProjectTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TABS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadSavedActive(): string | null {
  return localStorage.getItem(STORAGE_KEY_ACTIVE);
}

function saveTabs(tabs: ProjectTab[]) {
  localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
}

function saveActive(path: string | null) {
  if (path) localStorage.setItem(STORAGE_KEY_ACTIVE, path);
  else localStorage.removeItem(STORAGE_KEY_ACTIVE);
}

interface ProjectStore {
  /** All known projects (persisted by backend) */
  projects: string[];
  /** Currently open tabs */
  openTabs: ProjectTab[];
  /** Active tab path */
  activeTabPath: string | null;

  loadProjects: () => Promise<void>;
  addProject: () => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
}

const savedTabs = loadSavedTabs();
const savedActive = loadSavedActive();

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  openTabs: savedTabs,
  activeTabPath: savedActive && savedTabs.some((t) => t.path === savedActive)
    ? savedActive
    : savedTabs[0]?.path ?? null,

  loadProjects: async () => {
    try {
      const projects = await invoke<string[]>("list_projects");
      set({ projects });

      // Auto-open first project as tab if no tabs exist
      const { openTabs } = get();
      if (openTabs.length === 0 && projects.length > 0) {
        const tab: ProjectTab = { path: projects[0], displayName: toDisplayName(projects[0]) };
        saveTabs([tab]);
        saveActive(tab.path);
        set({ openTabs: [tab], activeTabPath: tab.path });
        // Pre-init pane tree for first tab
        usePaneStore.getState().getTree(tab.path);
      }
    } catch {
      // ignore
    }
  },

  addProject: async () => {
    try {
      const folder = await open({ directory: true, title: "Select Project Folder" });
      if (folder) {
        const projects = await invoke<string[]>("add_project", { path: folder });
        const tab: ProjectTab = { path: folder, displayName: toDisplayName(folder) };
        const { openTabs } = get();
        const alreadyOpen = openTabs.some((t) => t.path === folder);
        const newTabs = alreadyOpen ? openTabs : [...openTabs, tab];
        saveTabs(newTabs);
        saveActive(folder);
        set({ projects, openTabs: newTabs, activeTabPath: folder });
      }
    } catch {
      // ignore
    }
  },

  removeProject: async (path) => {
    try {
      const projects = await invoke<string[]>("remove_project", { path });
      set({ projects });
    } catch {
      // ignore
    }
  },

  openTab: (path) => {
    const { openTabs } = get();
    const alreadyOpen = openTabs.some((t) => t.path === path);
    if (alreadyOpen) {
      saveActive(path);
      set({ activeTabPath: path });
      return;
    }
    const tab: ProjectTab = { path, displayName: toDisplayName(path) };
    const newTabs = [...openTabs, tab];
    saveTabs(newTabs);
    saveActive(path);
    set({ openTabs: newTabs, activeTabPath: path });
    // Pre-init pane tree
    usePaneStore.getState().getTree(path);
  },

  closeTab: (path) => {
    const { openTabs, activeTabPath } = get();
    // Don't close last tab
    if (openTabs.length <= 1) return;

    const idx = openTabs.findIndex((t) => t.path === path);
    const newTabs = openTabs.filter((t) => t.path !== path);

    let newActive = activeTabPath;
    if (activeTabPath === path) {
      // Activate adjacent tab
      newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.path ?? null;
    }

    // Clean up per-project state in other stores
    usePaneStore.getState().removeProject(path);
    useGitStore.getState().removeProject(path);

    saveTabs(newTabs);
    saveActive(newActive);
    set({ openTabs: newTabs, activeTabPath: newActive });
  },

  setActiveTab: (path) => {
    saveActive(path);
    set({ activeTabPath: path });
  },
}));
