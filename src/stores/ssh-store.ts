import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { SshPreset, SftpEntry, ConnectionStatus } from "./ssh-types";
import { usePaneStore } from "@/stores/pane-store";

interface SshConnection {
  presetId: string;
  status: ConnectionStatus;
  password?: string; // cached in memory for SFTP reuse, never persisted
  error?: string;
  // SFTP state (per-session)
  sftpPath: string;
  sftpEntries: SftpEntry[];
  sftpLoading: boolean;
  sftpError: string | null;
  // Pane → channel mapping
  channelMap: Record<string, string>; // paneId → channelId
}

interface SshStore {
  // Presets
  presets: SshPreset[];
  loadPresets: () => Promise<void>;
  savePreset: (preset: SshPreset) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;

  // Connections
  connections: Record<string, SshConnection>;
  activeSessionId: string | null;
  tabOrder: string[]; // ordered list of session IDs
  setActiveSession: (id: string | null) => void;
  connect: (preset: SshPreset, password?: string) => Promise<string>;
  disconnect: (sessionId: string) => Promise<void>;
  openChannel: (sessionId: string, paneId: string) => Promise<void>;
  closeChannel: (sessionId: string, paneId: string) => Promise<void>;

  // SFTP
  browsePath: (sessionId: string, path: string) => Promise<void>;

  // Helpers
  getActivePreset: () => SshPreset | undefined;
  getActiveSftpCredentials: (sessionId?: string) => Record<string, unknown> | null;
  getSessionSftp: (sessionId: string) => {
    sftpPath: string;
    sftpEntries: SftpEntry[];
    sftpLoading: boolean;
    sftpError: string | null;
  };
}

export const useSshStore = create<SshStore>((set, get) => ({
  // Presets
  presets: [],
  loadPresets: async () => {
    try {
      const presets = await invoke<SshPreset[]>("ssh_preset_list");
      set({ presets });
    } catch (e) {
      console.error("Failed to load SSH presets:", e);
    }
  },
  savePreset: async (preset) => {
    await invoke("ssh_preset_save", { preset });
    await get().loadPresets();
  },
  deletePreset: async (id) => {
    await invoke("ssh_preset_delete", { id });
    await get().loadPresets();
  },

  // Connections
  connections: {},
  activeSessionId: null,
  tabOrder: [],
  setActiveSession: (id) => set({ activeSessionId: id }),

  connect: async (preset, password) => {
    const sessionId = await invoke<string>("ssh_connect", {
      host: preset.host,
      port: preset.port,
      username: preset.username,
      auth_method: preset.auth_method,
      password: password ?? null,
      private_key_path: preset.private_key_path ?? null,
    });

    // Get the initial leaf pane ID from pane-store (lazily creates tree for sessionId)
    const initialPaneId = usePaneStore.getState().getTree(sessionId).id;

    set((s) => ({
      connections: {
        ...s.connections,
        [sessionId]: {
          presetId: preset.id,
          status: "connected",
          password,
          sftpPath: "/",
          sftpEntries: [],
          sftpLoading: false,
          sftpError: null,
          channelMap: { [initialPaneId]: "default" },
        },
      },
      activeSessionId: sessionId,
      tabOrder: [...s.tabOrder, sessionId],
    }));

    return sessionId;
  },

  disconnect: async (sessionId) => {
    try {
      await invoke("ssh_disconnect", { id: sessionId });
    } catch {
      // ignore disconnect errors
    }
    // Clean up pane tree for this session
    usePaneStore.getState().removeProject(sessionId);
    set((s) => {
      const { [sessionId]: _, ...rest } = s.connections;
      const newTabOrder = s.tabOrder.filter((id) => id !== sessionId);

      let newActiveSessionId = s.activeSessionId;
      if (s.activeSessionId === sessionId) {
        if (newTabOrder.length === 0) {
          newActiveSessionId = null;
        } else {
          // Activate adjacent tab (previous or next)
          const idx = s.tabOrder.indexOf(sessionId);
          const prevIdx = idx > 0 ? idx - 1 : 0;
          newActiveSessionId = newTabOrder[prevIdx] ?? newTabOrder[0] ?? null;
        }
      }

      return {
        connections: rest,
        tabOrder: newTabOrder,
        activeSessionId: newActiveSessionId,
      };
    });
  },

  openChannel: async (sessionId, paneId) => {
    try {
      const channelId = await invoke<string>("ssh_open_channel", { session_id: sessionId });
      set((s) => {
        const conn = s.connections[sessionId];
        if (!conn) return s;
        return {
          connections: {
            ...s.connections,
            [sessionId]: {
              ...conn,
              channelMap: { ...conn.channelMap, [paneId]: channelId },
            },
          },
        };
      });
    } catch (e) {
      console.error("Failed to open SSH channel:", e);
    }
  },

  closeChannel: async (sessionId, paneId) => {
    const conn = get().connections[sessionId];
    const channelId = conn?.channelMap[paneId];
    if (channelId && channelId !== "default") {
      try {
        await invoke("ssh_close_channel", { session_id: sessionId, channel_id: channelId });
      } catch (e) {
        console.error("Failed to close SSH channel:", e);
      }
    }
    set((s) => {
      const c = s.connections[sessionId];
      if (!c) return s;
      const { [paneId]: _removed, ...restMap } = c.channelMap;
      return {
        connections: {
          ...s.connections,
          [sessionId]: { ...c, channelMap: restMap },
        },
      };
    });
  },

  // SFTP
  browsePath: async (sessionId, path) => {
    const creds = get().getActiveSftpCredentials(sessionId);
    if (!creds) return;

    set((s) => ({
      connections: {
        ...s.connections,
        [sessionId]: {
          ...s.connections[sessionId],
          sftpLoading: true,
          sftpError: null,
        },
      },
    }));

    try {
      const entries = await invoke<SftpEntry[]>("sftp_list_dir", {
        ...creds,
        path,
      });
      set((s) => ({
        connections: {
          ...s.connections,
          [sessionId]: {
            ...s.connections[sessionId],
            sftpPath: path,
            sftpEntries: entries,
            sftpLoading: false,
          },
        },
      }));
    } catch (e) {
      set((s) => ({
        connections: {
          ...s.connections,
          [sessionId]: {
            ...s.connections[sessionId],
            sftpLoading: false,
            sftpError: String(e),
          },
        },
      }));
    }
  },

  getActivePreset: () => {
    const { activeSessionId, connections, presets } = get();
    if (!activeSessionId) return undefined;
    const conn = connections[activeSessionId];
    if (!conn) return undefined;
    return presets.find((p) => p.id === conn.presetId);
  },

  getActiveSftpCredentials: (sessionId) => {
    const { activeSessionId, connections, presets } = get();
    const targetId = sessionId ?? activeSessionId;
    if (!targetId) return null;
    const conn = connections[targetId];
    if (!conn) return null;
    const preset = presets.find((p) => p.id === conn.presetId);
    if (!preset) return null;
    return {
      host: preset.host,
      port: preset.port,
      username: preset.username,
      auth_method: preset.auth_method,
      password: conn.password ?? null,
      private_key_path: preset.private_key_path ?? null,
    };
  },

  getSessionSftp: (sessionId) => {
    const conn = get().connections[sessionId];
    return {
      sftpPath: conn?.sftpPath ?? "/",
      sftpEntries: conn?.sftpEntries ?? [],
      sftpLoading: conn?.sftpLoading ?? false,
      sftpError: conn?.sftpError ?? null,
    };
  },
}));
