---
phase: 2
title: "SSH Tab Store + Tab Bar UI"
status: pending
effort: 2h
depends_on: [1]
---

# Phase 2: SSH Tab Store + Tab Bar UI

## Context Links
- [ssh-store.ts](../../src/stores/ssh-store.ts) — current single-session store
- [ssh-panel.tsx](../../src/components/ssh-panel.tsx) — current panel layout
- [tab-bar.tsx](../../src/components/tab-bar.tsx) — project tab bar (pattern to follow)
- [project-store.ts](../../src/stores/project-store.ts) — tab management pattern

## Overview
Transform the SSH panel from single-session to multi-tab. Each tab = one SSH connection with its own SFTP state. Tab bar at top, "+" button opens preset manager.

## Key Insights
- Current `activeSessionId` is a single string — becomes derived from active tab
- SFTP state (`sftpPath`, `sftpEntries`, `sftpLoading`, `sftpError`) is global — must move into per-session `SshConnection`
- Project tab bar is a good visual pattern but SSH tabs don't need localStorage persistence (sessions are transient)
- When all tabs closed → show preset manager (existing behavior for no active session)

## Architecture

```
ssh-store.ts (refactored):
  connections: Record<sessionId, SshConnection> {
    presetId, status, password, error,
    sftpPath, sftpEntries, sftpLoading, sftpError  // MOVED from global
  }
  tabOrder: string[]           // NEW — ordered session IDs
  activeSessionId: string|null // existing — points to active tab

ssh-tab-bar.tsx (NEW):
  Renders tabOrder as tabs
  Each tab shows: preset.name or "host:port"
  Click → setActiveSession(id)
  Close → disconnect(id)
  "+" → opens preset manager overlay
```

## Related Code Files

### Modify
- `src/stores/ssh-store.ts` — move SFTP state into SshConnection, add tabOrder, update browsePath
- `src/stores/ssh-types.ts` — add SFTP fields to connection type (or keep inline)
- `src/components/ssh-panel.tsx` — add tab bar, conditional preset manager
- `src/components/sftp-browser.tsx` — read SFTP state from connection instead of global store
- `src/hooks/use-ssh.ts` — update event payload to include channel_id filtering

### Create
- `src/components/ssh-tab-bar.tsx` — tab bar component for SSH sessions

### No changes
- `src/components/ssh-terminal.tsx` — already accepts sessionId prop
- `src/components/ssh-preset-manager.tsx` — already works standalone

## Implementation Steps

### 1. Update SshConnection interface in ssh-store.ts
```typescript
interface SshConnection {
  presetId: string;
  status: ConnectionStatus;
  password?: string;
  error?: string;
  // SFTP state (moved from global)
  sftpPath: string;
  sftpEntries: SftpEntry[];
  sftpLoading: boolean;
  sftpError: string | null;
}
```

### 2. Add tabOrder to SshStore
```typescript
interface SshStore {
  // ... existing
  tabOrder: string[];  // NEW — ordered list of session IDs
  // Remove global sftpPath, sftpEntries, sftpLoading, sftpError
}
```

### 3. Refactor connect() — push to tabOrder
```typescript
connect: async (preset, password) => {
  const sessionId = await invoke<string>("ssh_connect", { ... });
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
      },
    },
    tabOrder: [...s.tabOrder, sessionId],
    activeSessionId: sessionId,
  }));
  return sessionId;
};
```

### 4. Refactor disconnect() — remove from tabOrder, activate adjacent
```typescript
disconnect: async (sessionId) => {
  await invoke("ssh_disconnect", { id: sessionId });
  set((s) => {
    const { [sessionId]: _, ...rest } = s.connections;
    const newOrder = s.tabOrder.filter((id) => id !== sessionId);
    const idx = s.tabOrder.indexOf(sessionId);
    let newActive = s.activeSessionId === sessionId
      ? newOrder[Math.min(idx, newOrder.length - 1)] ?? null
      : s.activeSessionId;
    return {
      connections: rest,
      tabOrder: newOrder,
      activeSessionId: newActive,
    };
  });
};
```

### 5. Refactor browsePath() — scoped to session
```typescript
browsePath: async (sessionId: string, path: string) => {
  // Get credentials from specific session, not active session
  // Update sftpPath/entries/loading/error on that session's connection
};
```
- Signature changes: add `sessionId` param
- Update the specific connection entry, not global state

### 6. Add helper: getSessionSftp(sessionId)
Returns `{ sftpPath, sftpEntries, sftpLoading, sftpError }` from the specific connection, or defaults.

### 7. Update use-ssh.ts — filter by channel_id
```typescript
// Event payload now includes channel_id from Phase 1
// Default: filter for channel_id === "default" (single-terminal mode)
export function useSsh(
  sessionId: string | null,
  channelId: string,  // NEW param, default "default"
  onData: (data: string) => void,
)
```
- In event listener: check `event.payload.channel_id === channelId`
- Update `write`/`resize` to pass `channelId` to IPC

### 8. Create ssh-tab-bar.tsx
```
<div className="h-8 flex items-center bg-ctp-crust border-b border-ctp-surface0 overflow-x-auto">
  {tabOrder.map(sessionId => {
    const conn = connections[sessionId];
    const preset = presets.find(p => p.id === conn.presetId);
    const label = preset?.name || sessionId.slice(0, 8);
    const isActive = sessionId === activeSessionId;
    return (
      <div key={sessionId} onClick={() => setActiveSession(sessionId)} ...>
        <span>{label}</span>
        <X onClick={() => disconnect(sessionId)} />
      </div>
    );
  })}
  <button onClick={() => setShowPresetManager(true)}><Plus /></button>
</div>
```
- Follow tab-bar.tsx styling (catppuccin classes, same dimensions)
- Show connection status indicator (green dot = connected, red = error)

### 9. Refactor ssh-panel.tsx
```typescript
export function SshPanel() {
  const { tabOrder, activeSessionId } = useSshStore();
  const [showPresetManager, setShowPresetManager] = useState(false);

  // No sessions and no preset manager → show preset manager
  if (tabOrder.length === 0 || showPresetManager) {
    return (
      <div className="h-full flex flex-col">
        {tabOrder.length > 0 && <SshTabBar onNewTab={() => setShowPresetManager(true)} />}
        <SshPresetManager onConnected={() => setShowPresetManager(false)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <SshTabBar onNewTab={() => setShowPresetManager(true)} />
      <div className="flex-1 min-h-0 flex flex-row">
        <SftpBrowser sessionId={activeSessionId!} />
        <SplitHandle ... />
        <SshTerminal sessionId={activeSessionId!} />
      </div>
    </div>
  );
}
```

### 10. Update sftp-browser.tsx — read per-session SFTP state
- Instead of `useSshStore(s => s.sftpPath)`, use `useSshStore(s => s.connections[sessionId]?.sftpPath)`
- Pass `sessionId` to `browsePath(sessionId, path)`

## Todo List
- [ ] Move SFTP fields into SshConnection
- [ ] Add tabOrder to store
- [ ] Refactor connect() with tabOrder push
- [ ] Refactor disconnect() with adjacent tab activation
- [ ] Refactor browsePath() to be session-scoped
- [ ] Update use-ssh.ts with channel_id filtering
- [ ] Create ssh-tab-bar.tsx
- [ ] Refactor ssh-panel.tsx with tab bar + conditional preset manager
- [ ] Update sftp-browser.tsx for per-session SFTP state
- [ ] Compile check: `npx tsc --noEmit`

## Success Criteria
- Multiple SSH connections appear as tabs
- Switching tabs switches terminal + SFTP browser
- Closing tab disconnects that session, activates neighbor
- "+" button shows preset manager to create new connection
- Last tab close returns to preset manager view
- SFTP state is independent per session

## Risk Assessment
- **Terminal preservation** — switching tabs must NOT destroy xterm.js instances. Use CSS `display:none` or keep terminals mounted with `visibility:hidden`. If xterm re-mounts, it loses scrollback. Consider keeping all session containers mounted and toggling visibility.
- **Mitigation:** Render all sessions, only show active one: `<div style={{ display: sessionId === activeSessionId ? 'block' : 'none' }}>`
