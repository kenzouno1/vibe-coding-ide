import { useEffect, useState, useCallback } from "react";
import { Plus, Play, Pencil, Trash2, LogOut } from "lucide-react";
import { useSshStore } from "@/stores/ssh-store";
import { SshPresetForm } from "@/components/ssh-preset-form";
import type { SshPreset } from "@/stores/ssh-types";

interface SshPresetManagerProps {
  onConnected?: () => void;
}

export function SshPresetManager({ onConnected }: SshPresetManagerProps) {
  const presets = useSshStore((s) => s.presets);
  const loadPresets = useSshStore((s) => s.loadPresets);
  const savePreset = useSshStore((s) => s.savePreset);
  const deletePreset = useSshStore((s) => s.deletePreset);
  const connect = useSshStore((s) => s.connect);
  const disconnect = useSshStore((s) => s.disconnect);
  const connections = useSshStore((s) => s.connections);
  const activeSessionId = useSshStore((s) => s.activeSessionId);
  const setActiveSession = useSshStore((s) => s.setActiveSession);

  const [editing, setEditing] = useState<SshPreset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleConnect = useCallback(
    async (preset: SshPreset) => {
      setError(null);
      setConnecting(true);
      try {
        let password: string | undefined;
        if (preset.auth_method === "password") {
          const pw = window.prompt(
            `Password for ${preset.username}@${preset.host}:`,
          );
          if (pw === null) {
            setConnecting(false);
            return;
          }
          password = pw;
        }
        await connect(preset, password);
        onConnected?.();
      } catch (e) {
        setError(String(e));
      } finally {
        setConnecting(false);
      }
    },
    [connect, onConnected],
  );

  const handleSave = useCallback(
    async (preset: SshPreset) => {
      await savePreset(preset);
      setShowForm(false);
      setEditing(null);
    },
    [savePreset],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (window.confirm("Delete this preset?")) {
        await deletePreset(id);
      }
    },
    [deletePreset],
  );

  // Show form when creating/editing
  if (showForm || editing) {
    return (
      <div className="h-full bg-ctp-base overflow-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-ctp-text mb-2">
            {editing ? "Edit Connection" : "New Connection"}
          </h2>
        </div>
        <SshPresetForm
          preset={editing ?? undefined}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  // Active connections list
  const activeConnections = Object.entries(connections).filter(
    ([, c]) => c.status === "connected",
  );

  return (
    <div className="h-full bg-ctp-base overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
        <h2 className="text-sm font-semibold text-ctp-text">
          SSH Connections
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-ctp-mauve text-ctp-base rounded hover:opacity-90 transition-opacity"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {/* Error message */}
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
          {activeConnections.map(([sessionId, conn]) => {
            const preset = presets.find((p) => p.id === conn.presetId);
            return (
              <div
                key={sessionId}
                className="flex items-center justify-between p-2 mb-1 rounded bg-ctp-surface0"
              >
                <div>
                  <span className="text-sm text-ctp-green">
                    {preset?.name ?? "Unknown"}
                  </span>
                  <span className="text-xs text-ctp-overlay0 ml-2">
                    {preset?.username}@{preset?.host}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveSession(sessionId)}
                    title="Resume"
                    className="p-1 rounded text-ctp-green hover:bg-ctp-surface1"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={() => disconnect(sessionId)}
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

      {/* Saved presets */}
      <div className="px-4 pt-3">
        <h3 className="text-xs text-ctp-overlay1 uppercase tracking-wider mb-2">
          Saved Presets
        </h3>
        {presets.length === 0 && (
          <p className="text-xs text-ctp-overlay0 py-4 text-center">
            No saved connections. Click "New" to create one.
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
                {preset.username}@{preset.host}:{preset.port}
                <span className="ml-2 text-ctp-overlay0">
                  ({preset.auth_method})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => handleConnect(preset)}
                disabled={connecting}
                title="Connect"
                className="p-1.5 rounded text-ctp-green hover:bg-ctp-surface1 disabled:opacity-50"
              >
                <Play size={14} />
              </button>
              <button
                onClick={() => setEditing(preset)}
                title="Edit"
                className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface1"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleDelete(preset.id)}
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
