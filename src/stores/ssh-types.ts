/** Reusable SSH config template (no host) */
export interface SshPreset {
  id: string;
  name: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
  startup_cmd?: string;
}

/** Persisted server connection profile */
export interface SshSavedSession {
  id: string;
  name: string;
  host: string;
  preset_id?: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
  startup_cmd?: string;
}

export interface SftpEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  permissions: number;
  modified: number;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
