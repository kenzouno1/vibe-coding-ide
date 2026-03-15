export interface SshPreset {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
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
