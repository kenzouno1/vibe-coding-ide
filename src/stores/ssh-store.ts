import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  SshPreset,
  SshSavedSession,
  SftpEntry,
  ConnectionStatus,
} from "./ssh-types";
import { usePaneStore } from "@/stores/pane-store";

interface SshConnection {
  sessionId: string; // saved session id
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
  // Presets (templates)
  presets: SshPreset[];
  loadPresets: () => Promise<void>;
  savePreset: (preset: SshPreset) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;

  // Saved sessions (persisted server profiles)
  savedSessions: SshSavedSession[];
  loadSavedSessions: () => Promise<void>;
  saveSavedSession: (session: SshSavedSession) => Promise<void>;
  deleteSavedSession: (id: string) => Promise<void>;

  // Active connections
  connections: Record<string, SshConnection>;
  activeSessionId: string | null;
  tabOrder: string[]; // ordered list of active connection IDs
  setActiveSession: (id: string | null) => void;
  connect: (session: SshSavedSession, password?: string) => Promise<string>;
  disconnect: (connId: string) => Promise<void>;
  openChannel: (connId: string, paneId: string) => Promise<void>;
  closeChannel: (connId: string, paneId: string) => Promise<void>;

  // SFTP
  browsePath: (connId: string, path: string) => Promise<void>;

  // Helpers
  getActiveSavedSession: () => SshSavedSession | undefined;
  getActiveSftpCredentials: (
    connId?: string,
  ) => Record<string, unknown> | null;
  getSessionSftp: (connId: string) => {
    sftpPath: string;
    sftpEntries: SftpEntry[];
    sftpLoading: boolean;
    sftpError: string | null;
  };
}

export const useSshStore = create<SshStore>((set, get) => ({
  // ── Presets ──────────────────────────────────────────────────────────
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

  // ── Saved Sessions ──────────────────────────────────────────────────
  savedSessions: [],
  loadSavedSessions: async () => {
    try {
      const sessions = await invoke<SshSavedSession[]>("ssh_session_list");
      set({ savedSessions: sessions });
    } catch (e) {
      console.error("Failed to load SSH sessions:", e);
    }
  },
  saveSavedSession: async (session) => {
    await invoke("ssh_session_save", { session });
    await get().loadSavedSessions();
  },
  deleteSavedSession: async (id) => {
    await invoke("ssh_session_delete", { id });
    await get().loadSavedSessions();
  },

  // ── Active Connections ──────────────────────────────────────────────
  connections: {},
  activeSessionId: null,
  tabOrder: [],
  setActiveSession: (id) => set({ activeSessionId: id }),

  connect: async (session, password) => {
    const connId = await invoke<string>("ssh_connect", {
      host: session.host,
      port: session.port,
      username: session.username,
      authMethod: session.auth_method,
      password: password ?? null,
      privateKeyPath: session.private_key_path ?? null,
    });

    const initialPaneId = usePaneStore.getState().getTree(connId).id;

    set((s) => ({
      connections: {
        ...s.connections,
        [connId]: {
          sessionId: session.id,
          status: "connected",
          password,
          sftpPath: "/",
          sftpEntries: [],
          sftpLoading: false,
          sftpError: null,
          channelMap: { [initialPaneId]: "default" },
        },
      },
      activeSessionId: connId,
      tabOrder: [...s.tabOrder, connId],
    }));

    return connId;
  },

  disconnect: async (connId) => {
    try {
      await invoke("ssh_disconnect", { id: connId });
    } catch {
      // ignore disconnect errors
    }
    usePaneStore.getState().removeProject(connId);
    set((s) => {
      const { [connId]: _, ...rest } = s.connections;
      const newTabOrder = s.tabOrder.filter((id) => id !== connId);

      let newActiveSessionId = s.activeSessionId;
      if (s.activeSessionId === connId) {
        if (newTabOrder.length === 0) {
          newActiveSessionId = null;
        } else {
          const idx = s.tabOrder.indexOf(connId);
          const prevIdx = idx > 0 ? idx - 1 : 0;
          newActiveSessionId =
            newTabOrder[prevIdx] ?? newTabOrder[0] ?? null;
        }
      }

      return {
        connections: rest,
        tabOrder: newTabOrder,
        activeSessionId: newActiveSessionId,
      };
    });
  },

  openChannel: async (connId, paneId) => {
    try {
      const channelId = await invoke<string>("ssh_open_channel", {
        sessionId: connId,
      });
      set((s) => {
        const conn = s.connections[connId];
        if (!conn) return s;
        return {
          connections: {
            ...s.connections,
            [connId]: {
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

  closeChannel: async (connId, paneId) => {
    const conn = get().connections[connId];
    const channelId = conn?.channelMap[paneId];
    if (channelId && channelId !== "default") {
      try {
        await invoke("ssh_close_channel", {
          sessionId: connId,
          channelId,
        });
      } catch (e) {
        console.error("Failed to close SSH channel:", e);
      }
    }
    set((s) => {
      const c = s.connections[connId];
      if (!c) return s;
      const { [paneId]: _removed, ...restMap } = c.channelMap;
      return {
        connections: {
          ...s.connections,
          [connId]: { ...c, channelMap: restMap },
        },
      };
    });
  },

  // ── SFTP ────────────────────────────────────────────────────────────
  browsePath: async (connId, path) => {
    const creds = get().getActiveSftpCredentials(connId);
    if (!creds) return;

    set((s) => ({
      connections: {
        ...s.connections,
        [connId]: {
          ...s.connections[connId],
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
          [connId]: {
            ...s.connections[connId],
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
          [connId]: {
            ...s.connections[connId],
            sftpLoading: false,
            sftpError: String(e),
          },
        },
      }));
    }
  },

  // ── Helpers ─────────────────────────────────────────────────────────
  getActiveSavedSession: () => {
    const { activeSessionId, connections, savedSessions } = get();
    if (!activeSessionId) return undefined;
    const conn = connections[activeSessionId];
    if (!conn) return undefined;
    return savedSessions.find((s) => s.id === conn.sessionId);
  },

  getActiveSftpCredentials: (connId) => {
    const { activeSessionId, connections, savedSessions } = get();
    const targetId = connId ?? activeSessionId;
    if (!targetId) return null;
    const conn = connections[targetId];
    if (!conn) return null;
    const session = savedSessions.find((s) => s.id === conn.sessionId);
    if (!session) return null;
    return {
      host: session.host,
      port: session.port,
      username: session.username,
      authMethod: session.auth_method,
      password: conn.password ?? null,
      privateKeyPath: session.private_key_path ?? null,
    };
  },

  getSessionSftp: (connId) => {
    const conn = get().connections[connId];
    return {
      sftpPath: conn?.sftpPath ?? "/",
      sftpEntries: conn?.sftpEntries ?? [],
      sftpLoading: conn?.sftpLoading ?? false,
      sftpError: conn?.sftpError ?? null,
    };
  },
}));
