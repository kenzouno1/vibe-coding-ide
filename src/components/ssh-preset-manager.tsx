import { useEffect, useState, useCallback } from "react";
import { Plus, Play, Pencil, Trash2, LogOut, Copy, Settings } from "lucide-react";
import { useSshStore } from "@/stores/ssh-store";
import { SshPresetForm } from "@/components/ssh-preset-form";
import { SshSessionForm } from "@/components/ssh-session-form";
import type { SshSavedSession, SshPreset } from "@/stores/ssh-types";

type View = "list" | "session-form" | "preset-list" | "preset-form";

interface SshPresetManagerProps {
  onConnected?: () => void;
}

export function SshPresetManager({ onConnected }: SshPresetManagerProps) {
  const savedSessions = useSshStore((s) => s.savedSessions);
  const presets = useSshStore((s) => s.presets);
  const loadSavedSessions = useSshStore((s) => s.loadSavedSessions);
  const loadPresets = useSshStore((s) => s.loadPresets);
  const saveSavedSession = useSshStore((s) => s.saveSavedSession);
  const deleteSavedSession = useSshStore((s) => s.deleteSavedSession);
  const savePreset = useSshStore((s) => s.savePreset);
  const deletePreset = useSshStore((s) => s.deletePreset);
  const connect = useSshStore((s) => s.connect);
  const disconnect = useSshStore((s) => s.disconnect);
  const connections = useSshStore((s) => s.connections);
  const setActiveSession = useSshStore((s) => s.setActiveSession);

  const [view, setView] = useState<View>("list");
  const [editingSession, setEditingSession] = useState<SshSavedSession | null>(null);
  const [editingPreset, setEditingPreset] = useState<SshPreset | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedSessions();
    loadPresets();
  }, [loadSavedSessions, loadPresets]);

  const handleConnect = useCallback(
    async (session: SshSavedSession) => {
      setError(null);
      setConnecting(true);
      try {
        let password: string | undefined;
        if (session.auth_method === "password") {
          const pw = window.prompt(
            `Password for ${session.username}@${session.host}:`,
          );
          if (pw === null) {
            setConnecting(false);
            return;
          }
          password = pw;
        }
        await connect(session, password);
        onConnected?.();
      } catch (e) {
        setError(String(e));
      } finally {
        setConnecting(false);
      }
    },
    [connect, onConnected],
  );

  const handleSaveSession = useCallback(
    async (session: SshSavedSession) => {
      await saveSavedSession(session);
      setView("list");
      setEditingSession(null);
    },
    [saveSavedSession],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (window.confirm("Delete this session?")) {
        await deleteSavedSession(id);
      }
    },
    [deleteSavedSession],
  );

  const handleDuplicateSession = useCallback((session: SshSavedSession) => {
    setEditingSession({
      ...session,
      id: crypto.randomUUID(),
      name: `${session.name} (copy)`,
    });
    setView("session-form");
  }, []);

  const handleSavePreset = useCallback(
    async (preset: SshPreset) => {
      await savePreset(preset);
      setView("preset-list");
      setEditingPreset(null);
    },
    [savePreset],
  );

  const handleDeletePreset = useCallback(
    async (id: string) => {
      if (window.confirm("Delete this template?")) {
        await deletePreset(id);
      }
    },
    [deletePreset],
  );

  // ── Session Form ────────────────────────────────────────────────────
  if (view === "session-form") {
    return (
      <div className="h-full bg-ctp-base overflow-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-ctp-text mb-2">
            {editingSession ? "Edit Session" : "New Session"}
          </h2>
        </div>
        <SshSessionForm
          session={editingSession ?? undefined}
          onSave={handleSaveSession}
          onCancel={() => {
            setView("list");
            setEditingSession(null);
          }}
        />
      </div>
    );
  }

  // ── Preset List ─────────────────────────────────────────────────────
  if (view === "preset-list") {
    return (
      <div className="h-full bg-ctp-base overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
          <h2 className="text-sm font-semibold text-ctp-text">Templates</h2>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setEditingPreset(null);
                setView("preset-form");
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-ctp-mauve text-ctp-base rounded hover:opacity-90 transition-opacity"
            >
              <Plus size={12} />
              New
            </button>
            <button
              onClick={() => setView("list")}
              className="px-2 py-1 text-xs bg-ctp-surface0 text-ctp-text rounded hover:bg-ctp-surface1 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
        <div className="px-4 pt-3">
          {presets.length === 0 && (
            <p className="text-xs text-ctp-overlay0 py-4 text-center">
              No templates yet. Create one to pre-fill new sessions.
            </p>
          )}
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between p-2 mb-1 rounded bg-ctp-mantle hover:bg-ctp-surface0 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm text-ctp-text truncate">
                  {preset.name}
                </div>
                <div className="text-xs text-ctp-overlay0">
                  {preset.username}:{preset.port} ({preset.auth_method})
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => {
                    setEditingPreset(preset);
                    setView("preset-form");
                  }}
                  title="Edit"
                  className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface1"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  title="Delete"
                  className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-red hover:bg-ctp-surface1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Preset Form ─────────────────────────────────────────────────────
  if (view === "preset-form") {
    return (
      <div className="h-full bg-ctp-base overflow-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-ctp-text mb-2">
            {editingPreset ? "Edit Template" : "New Template"}
          </h2>
        </div>
        <SshPresetForm
          preset={editingPreset ?? undefined}
          onSave={handleSavePreset}
          onCancel={() => {
            setView("preset-list");
            setEditingPreset(null);
          }}
        />
      </div>
    );
  }

  // ── Main: Session List ──────────────────────────────────────────────
  const activeConnections = Object.entries(connections).filter(
    ([, c]) => c.status === "connected",
  );

  return (
    <div className="h-full bg-ctp-base overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
        <h2 className="text-sm font-semibold text-ctp-text">
          SSH Sessions
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setEditingSession(null);
              setView("session-form");
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-ctp-mauve text-ctp-base rounded hover:opacity-90 transition-opacity"
          >
            <Plus size={12} />
            New
          </button>
          <button
            onClick={() => setView("preset-list")}
            title="Manage Templates"
            className="p-1 text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 rounded transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 p-2 text-xs text-ctp-red bg-ctp-surface0 rounded">
          {error}
        </div>
      )}

      {/* Active connections */}
      {activeConnections.length > 0 && (
        <div className="px-4 pt-3">
          <h3 className="text-xs text-ctp-overlay1 uppercase tracking-wider mb-2">
            Active
          </h3>
          {activeConnections.map(([connId, conn]) => {
            const session = savedSessions.find((s) => s.id === conn.sessionId);
            return (
              <div
                key={connId}
                className="flex items-center justify-between p-2 mb-1 rounded bg-ctp-surface0"
              >
                <div>
                  <span className="text-sm text-ctp-green">
                    {session?.name ?? "Unknown"}
                  </span>
                  <span className="text-xs text-ctp-overlay0 ml-2">
                    {session?.username}@{session?.host}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setActiveSession(connId);
                      onConnected?.();
                    }}
                    title="Resume"
                    className="p-1 rounded text-ctp-green hover:bg-ctp-surface1"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={() => disconnect(connId)}
                    title="Disconnect"
                    className="p-1 rounded text-ctp-red hover:bg-ctp-surface1"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Saved sessions */}
      <div className="px-4 pt-3">
        <h3 className="text-xs text-ctp-overlay1 uppercase tracking-wider mb-2">
          Saved Sessions
        </h3>
        {savedSessions.length === 0 && (
          <p className="text-xs text-ctp-overlay0 py-4 text-center">
            No saved sessions. Click "New" to create one.
          </p>
        )}
        {savedSessions.map((session) => {
          const preset = presets.find((p) => p.id === session.preset_id);
          return (
            <div
              key={session.id}
              className="flex items-center justify-between p-2 mb-1 rounded bg-ctp-mantle hover:bg-ctp-surface0 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm text-ctp-text truncate">
                  {session.name}
                  {preset && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-ctp-surface1 text-ctp-overlay1">
                      {preset.name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ctp-overlay0">
                  {session.username}@{session.host}:{session.port}
                  <span className="ml-2">({session.auth_method})</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleConnect(session)}
                  disabled={connecting}
                  title="Connect"
                  className="p-1.5 rounded text-ctp-green hover:bg-ctp-surface1 disabled:opacity-50"
                >
                  <Play size={14} />
                </button>
                <button
                  onClick={() => {
                    setEditingSession(session);
                    setView("session-form");
                  }}
                  title="Edit"
                  className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface1"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDuplicateSession(session)}
                  title="Duplicate"
                  className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface1"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDeleteSession(session.id)}
                  title="Delete"
                  className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-red hover:bg-ctp-surface1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
