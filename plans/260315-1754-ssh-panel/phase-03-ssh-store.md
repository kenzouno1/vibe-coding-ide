# Phase 3: SSH Store (Frontend)

## Context
- [app-store.ts](../../src/stores/app-store.ts) — reference for zustand store pattern
- [pane-store.ts](../../src/stores/pane-store.ts) — reference for complex state
- Depends on Phase 1 (backend commands) and Phase 2 (preset commands)

## Overview
- **Priority:** P1
- **Status:** done
- **Effort:** 1.5h

## Key Insights
- Single zustand store managing: presets, active connections, SFTP state, connection status
- Connection status per session: "disconnected" | "connecting" | "connected" | "error"
- SFTP state (current path, entries) tied to active session

## Files to Create
- `src/stores/ssh-store.ts` (~120 lines)
- `src/types/ssh-types.ts` (~30 lines)

## Files to Modify
- `src/stores/app-store.ts` — extend AppView type to include "ssh"

## Implementation Steps

### 1. Create ssh-types.ts
```typescript
export interface SshPreset {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  privateKeyPath?: string;
}

export interface SftpEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  permissions: number;
  modified: number;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
```

### 2. Create ssh-store.ts
```typescript
interface SshConnection {
  sessionId: string;
  presetId: string;
  status: ConnectionStatus;
  error?: string;
}

interface SshStore {
  // Presets
  presets: SshPreset[];
  loadPresets: () => Promise<void>;
  savePreset: (preset: SshPreset) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;

  // Connections
  connections: Record<string, SshConnection>; // keyed by sessionId
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
  connect: (preset: SshPreset, password?: string) => Promise<string>;
  disconnect: (sessionId: string) => Promise<void>;

  // SFTP
  sftpPath: string; // current browse path
  sftpEntries: SftpEntry[];
  sftpLoading: boolean;
  browsePath: (sessionId: string, path: string) => Promise<void>;
  downloadFile: (sessionId: string, remotePath: string, localPath: string) => Promise<void>;
  uploadFile: (sessionId: string, localPath: string, remotePath: string) => Promise<void>;
}
```

### 3. Update app-store.ts
```typescript
export type AppView = "terminal" | "git" | "editor" | "ssh";
```

## Todo
- [ ] Create ssh-types.ts
- [ ] Create ssh-store.ts with zustand
- [ ] Update AppView in app-store.ts
- [ ] Verify TypeScript compiles

## Success Criteria
- Store connects to all backend commands
- AppView includes "ssh"
- Type-safe preset CRUD and connection management
