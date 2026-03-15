import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useSshStore } from "@/stores/ssh-store";
import type { SshSavedSession } from "@/stores/ssh-types";

interface SshSessionFormProps {
  session?: SshSavedSession;
  onSave: (session: SshSavedSession) => void;
  onCancel: () => void;
}

/** Form for creating/editing saved SSH sessions (with preset template support) */
export function SshSessionForm({ session, onSave, onCancel }: SshSessionFormProps) {
  const presets = useSshStore((s) => s.presets);
  const isNew = !session;

  const [presetId, setPresetId] = useState(session?.preset_id ?? "");
  const [name, setName] = useState(session?.name ?? "");
  const [host, setHost] = useState(session?.host ?? "");
  const [port, setPort] = useState(session?.port ?? 22);
  const [username, setUsername] = useState(session?.username ?? "root");
  const [authMethod, setAuthMethod] = useState<"password" | "key">(
    session?.auth_method ?? "password",
  );
  const [privateKeyPath, setPrivateKeyPath] = useState(
    session?.private_key_path ?? "",
  );
  const [startupCmd, setStartupCmd] = useState(session?.startup_cmd ?? "");

  const applyPreset = (id: string) => {
    setPresetId(id);
    const tpl = presets.find((p) => p.id === id);
    if (!tpl) return;
    setPort(tpl.port);
    setUsername(tpl.username);
    setAuthMethod(tpl.auth_method);
    setPrivateKeyPath(tpl.private_key_path ?? "");
    setStartupCmd(tpl.startup_cmd ?? "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: session?.id ?? crypto.randomUUID(),
      name: name.trim() || `${username}@${host}`,
      host: host.trim(),
      preset_id: presetId || undefined,
      port,
      username: username.trim(),
      auth_method: authMethod,
      private_key_path: authMethod === "key" ? privateKeyPath : undefined,
      startup_cmd: startupCmd.trim() || undefined,
    });
  };

  const handleBrowseKey = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "All Files", extensions: ["*"] }],
    });
    if (path) setPrivateKeyPath(path as string);
  };

  const inputClass =
    "w-full bg-ctp-base text-ctp-text text-sm px-3 py-1.5 rounded border border-ctp-surface1 outline-none focus:border-ctp-mauve";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 max-w-md">
      {/* Template dropdown */}
      {presets.length > 0 && (
        <div>
          <label className="text-xs text-ctp-overlay1 mb-1 block">
            Use template
          </label>
          <select
            className={inputClass}
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">(None)</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.username}:{p.port} ({p.auth_method})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-ctp-overlay1 mb-1 block">Name</label>
        <input
          className={inputClass}
          placeholder="Production Server"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-ctp-overlay1 mb-1 block">Host</label>
          <input
            className={inputClass}
            placeholder="192.168.1.100"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            required
            autoFocus={isNew}
          />
        </div>
        <div className="w-20">
          <label className="text-xs text-ctp-overlay1 mb-1 block">Port</label>
          <input
            type="number"
            className={inputClass}
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-ctp-overlay1 mb-1 block">Username</label>
        <input
          className={inputClass}
          placeholder="root"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-xs text-ctp-overlay1 mb-1 block">Auth Method</label>
        <div className="flex gap-4 text-sm text-ctp-text">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={authMethod === "password"}
              onChange={() => setAuthMethod("password")}
              className="accent-ctp-mauve"
            />
            Password
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={authMethod === "key"}
              onChange={() => setAuthMethod("key")}
              className="accent-ctp-mauve"
            />
            Private Key
          </label>
        </div>
      </div>
      {authMethod === "key" && (
        <div>
          <label className="text-xs text-ctp-overlay1 mb-1 block">
            Private Key Path
          </label>
          <div className="flex gap-1">
            <input
              className={`${inputClass} flex-1`}
              placeholder="~/.ssh/id_rsa"
              value={privateKeyPath}
              onChange={(e) => setPrivateKeyPath(e.target.value)}
            />
            <button
              type="button"
              onClick={handleBrowseKey}
              className="p-1.5 rounded border border-ctp-surface1 text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
      )}
      <div>
        <label className="text-xs text-ctp-overlay1 mb-1 block">
          Startup Command
          <span className="text-ctp-overlay0 ml-1">(optional)</span>
        </label>
        <input
          className={inputClass}
          placeholder="cd /var/www && ls"
          value={startupCmd}
          onChange={(e) => setStartupCmd(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-1.5 bg-ctp-mauve text-ctp-base text-sm rounded hover:opacity-90 transition-opacity"
        >
          {session ? "Update" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 bg-ctp-surface0 text-ctp-text text-sm rounded hover:bg-ctp-surface1 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
