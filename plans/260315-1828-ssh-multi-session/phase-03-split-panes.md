---
phase: 3
title: "Split Terminal Panes for SSH"
status: pending
effort: 2.5h
depends_on: [1, 2]
---

# Phase 3: Split Terminal Panes for SSH

## Context Links
- [pane-store.ts](../../src/stores/pane-store.ts) — binary tree pane layout (reuse directly)
- [split-pane-container.tsx](../../src/components/split-pane-container.tsx) — recursive pane renderer
- [ssh-terminal.tsx](../../src/components/ssh-terminal.tsx) — xterm.js SSH terminal
- Phase 1 provides: `ssh_open_channel`, `ssh_close_channel`, channel_id routing

## Overview
Reuse the existing `pane-store.ts` binary tree to manage SSH terminal splits within a session. Each leaf pane = a separate SSH channel (from Phase 1) with its own xterm.js instance. Keybindings: Ctrl+Shift+H (hsplit), Ctrl+Shift+V (vsplit), Ctrl+W (close pane).

## Key Insight: Reuse pane-store as-is
`pane-store.ts` is keyed by `projectPath: string`. For SSH, use `session_id` as the key. The store already handles:
- Binary tree of split/leaf nodes
- Active pane tracking
- Split/close/setRatio operations
- ID generation

No changes to pane-store.ts needed. Just use `sessionId` where local terminal uses `projectPath`.

## Architecture

```
ssh-panel.tsx (per active session):
  SFTP Browser (left 30%)
  SplitHandle
  SshSplitPaneContainer (right 70%)    ← NEW
    └── renders pane tree for this sessionId
        ├── Leaf → SshTerminalPane     ← NEW wrapper
        │     channelId = channelMap[paneId]
        │     SshTerminal(sessionId, channelId)
        └── Split → recurse

Channel mapping (in ssh-store.ts):
  connections[sessionId].channelMap: Record<paneId, channelId>
  - When pane created → ssh_open_channel → store mapping
  - When pane closed → ssh_close_channel → remove mapping
  - Default pane ("pane-N" from connect) → "default" channel
```

## Related Code Files

### Modify
- `src/stores/ssh-store.ts` — add channelMap to SshConnection, add openChannel/closeChannel actions
- `src/components/ssh-panel.tsx` — replace single SshTerminal with SshSplitPaneContainer
- `src/components/ssh-terminal.tsx` — accept channelId prop, pass to useSsh
- `src/hooks/use-ssh.ts` — write/resize use channelId (from Phase 2)

### Create
- `src/components/ssh-split-pane-container.tsx` — like split-pane-container but renders SshTerminalPane
- `src/components/ssh-terminal-pane.tsx` — wrapper: resolves channelId from paneId, renders SshTerminal

### No changes
- `src/stores/pane-store.ts` — reuse as-is with sessionId as key

## Implementation Steps

### 1. Add channelMap to SshConnection (ssh-store.ts)
```typescript
interface SshConnection {
  // ... existing fields from Phase 2
  channelMap: Record<string, string>; // paneId → channelId
}
```

Initialize in `connect()`:
- After `ssh_connect` returns, get the initial pane ID from pane-store's default tree
- Set `channelMap: { [initialPaneId]: "default" }`

### 2. Add openChannel action (ssh-store.ts)
```typescript
openChannel: async (sessionId: string, paneId: string) => {
  const channelId = await invoke<string>("ssh_open_channel", { sessionId });
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
};
```

### 3. Add closeChannel action (ssh-store.ts)
```typescript
closeChannel: async (sessionId: string, paneId: string) => {
  const conn = get().connections[sessionId];
  const channelId = conn?.channelMap[paneId];
  if (channelId && channelId !== "default") {
    await invoke("ssh_close_channel", { sessionId, channelId });
  }
  set((s) => {
    const c = s.connections[sessionId];
    if (!c) return s;
    const { [paneId]: _, ...restMap } = c.channelMap;
    return {
      connections: {
        ...s.connections,
        [sessionId]: { ...c, channelMap: restMap },
      },
    };
  });
};
```

### 4. Update SshTerminal to accept channelId
```typescript
interface SshTerminalProps {
  sessionId: string;
  channelId: string;  // NEW — "default" for initial channel
}
```
- Pass channelId to `useSsh(sessionId, channelId, onData)`

### 5. Create ssh-terminal-pane.tsx (~40 lines)
```typescript
interface SshTerminalPaneProps {
  sessionId: string;
  paneId: string;
  isActive: boolean;
  onFocus: () => void;
}

export function SshTerminalPane({ sessionId, paneId, isActive, onFocus }: Props) {
  const channelId = useSshStore(
    (s) => s.connections[sessionId]?.channelMap[paneId] ?? "default"
  );

  return (
    <div
      className={`h-full w-full ${isActive ? "ring-1 ring-ctp-mauve" : ""}`}
      onMouseDown={onFocus}
    >
      <SshTerminal sessionId={sessionId} channelId={channelId} />
    </div>
  );
}
```

### 6. Create ssh-split-pane-container.tsx (~50 lines)
Mirror `split-pane-container.tsx` but render `SshTerminalPane` at leaves:
```typescript
export function SshSplitPaneContainer({ sessionId, node }: Props) {
  const getTree = usePaneStore((s) => s.getTree);
  const getActiveId = usePaneStore((s) => s.getActiveId);
  const setActive = usePaneStore((s) => s.setActive);
  const setRatio = usePaneStore((s) => s.setRatio);

  const resolvedNode = node ?? getTree(sessionId);
  const activeId = getActiveId(sessionId);

  if (resolvedNode.type === "leaf") {
    return (
      <SshTerminalPane
        sessionId={sessionId}
        paneId={resolvedNode.id}
        isActive={resolvedNode.id === activeId}
        onFocus={() => setActive(sessionId, resolvedNode.id)}
      />
    );
  }
  // ... same split rendering as SplitPaneContainer
}
```

### 7. Add keyboard shortcuts for split/close
In `ssh-panel.tsx` or a dedicated hook, listen for:
- `Ctrl+Shift+H` → `usePaneStore.getState().split(sessionId, activePaneId, "horizontal")`
  then `useSshStore.getState().openChannel(sessionId, newPaneId)`
- `Ctrl+Shift+V` → same with `"vertical"`
- `Ctrl+W` → `useSshStore.getState().closeChannel(sessionId, activePaneId)`
  then `usePaneStore.getState().closePane(sessionId, activePaneId)`

Sequence matters: for split, pane-store creates the new leaf first, then we open a channel for it. For close, close the channel first, then remove the pane.

### 8. Wire into ssh-panel.tsx
Replace the single `<SshTerminal>` with `<SshSplitPaneContainer sessionId={activeSessionId} />`:
```typescript
<div style={{ flexBasis: rightWidth }} className="min-w-0 h-full overflow-hidden">
  <SshSplitPaneContainer sessionId={activeSessionId!} />
</div>
```

### 9. Cleanup on disconnect
In `disconnect()`, also clean up pane tree:
```typescript
usePaneStore.getState().removeProject(sessionId);
```

## Todo List
- [ ] Add channelMap to SshConnection
- [ ] Add openChannel / closeChannel actions
- [ ] Update SshTerminal with channelId prop
- [ ] Create ssh-terminal-pane.tsx
- [ ] Create ssh-split-pane-container.tsx
- [ ] Add keyboard shortcuts (Ctrl+Shift+H/V, Ctrl+W)
- [ ] Wire SshSplitPaneContainer into ssh-panel.tsx
- [ ] Add cleanup on disconnect (remove pane tree)
- [ ] Compile check + manual test

## Success Criteria
- Ctrl+Shift+H splits horizontally, each pane has independent shell
- Ctrl+Shift+V splits vertically
- Ctrl+W closes active pane (but not last one)
- Each pane has own scrollback/output
- Typing in one pane doesn't appear in others
- Closing session cleans up all channels and pane tree

## Risk Assessment
- **New pane channel race** — pane renders before `openChannel` completes, showing empty terminal. Mitigation: SshTerminalPane shows a loading state until channelId appears in channelMap.
- **pane-store ID collision** — pane-store uses a module-level `nextId` counter. Since local terminals and SSH both use it, IDs won't collide (monotonically increasing). But if pane-store is reset, stale channelMap entries linger. Mitigation: clean channelMap on disconnect.

## Security Considerations
- Each channel runs as the same authenticated user — no privilege escalation risk
- Channel count bounded by SSH server config (typically 10-100)
