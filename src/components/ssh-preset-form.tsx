import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import type { SshPreset } from "@/stores/ssh-types";

interface SshPresetFormProps {
  preset?: SshPreset;
  onSave: (preset: SshPreset) => void;
  onCancel: () => void;
}

export function SshPresetForm({ preset, onSave, onCancel }: SshPresetFormProps) {
  const [name, setName] = useState(preset?.name ?? "");
  const [host, setHost] = useState(preset?.host ?? "");
  const [port, setPort] = useState(preset?.port ?? 22);
  const [username, setUsername] = useState(preset?.username ?? "root");
  const [authMethod, setAuthMethod] = useState<"password" | "key">(
    preset?.auth_method ?? "password",
  );
  const [privateKeyPath, setPrivateKeyPath] = useState(
    preset?.private_key_path ?? "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: preset?.id ?? crypto.randomUUID(),
      name: name.trim() || `${username}@${host}`,
      host: host.trim(),
      port,
      username: username.trim(),
      auth_method: authMethod,
      private_key_path: authMethod === "key" ? privateKeyPath : undefined,
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
      <div>
        <label className="text-xs text-ctp-overlay1 mb-1 block">Name</label>
        <input
          className={inputClass}
          placeholder="My Server"
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
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-1.5 bg-ctp-mauve text-ctp-base text-sm rounded hover:opacity-90 transition-opacity"
        >
          {preset ? "Update" : "Save"}
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
