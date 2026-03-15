# Phase 4: SSH Terminal Component

## Context
- [terminal-pane.tsx](../../src/components/terminal-pane.tsx) — reference for xterm.js setup
- [use-pty.ts](../../src/hooks/use-pty.ts) — reference for IPC hook pattern
- Depends on Phase 1 (backend) and Phase 3 (store)

## Overview
- **Priority:** P1
- **Status:** done
- **Effort:** 2h

## Key Insights
- Nearly identical to terminal-pane.tsx but uses `ssh_write`/`ssh_resize` commands and `ssh-output` events
- Reuse same Catppuccin theme, xterm config, FitAddon pattern
- IME handler reuse for Vietnamese input support
- Session ID comes from ssh-store (not spawned on mount like local PTY)

## Files to Create
- `src/hooks/use-ssh.ts` (~80 lines)
- `src/components/ssh-terminal.tsx` (~130 lines)

## Implementation Steps

### 1. Create use-ssh.ts
```typescript
export function useSsh(
  sessionId: string | null,
  onData: (data: string) => void
) {
  // Listen for "ssh-output" events filtered by sessionId
  // Return { write, resize } functions that invoke ssh_write / ssh_resize
  // Similar structure to use-pty.ts but:
  //   - No spawn on mount (session already created by store)
  //   - No cleanup kill (disconnect handled by store)
  //   - Listener setup/teardown when sessionId changes
}
```

Key differences from use-pty.ts:
- `sessionId` is a prop (not created internally)
- `useEffect` depends on `[sessionId]` — re-subscribe when session changes
- No spawn/kill — lifecycle managed by ssh-store

### 2. Create ssh-terminal.tsx
```typescript
interface SshTerminalProps {
  sessionId: string;
}

export const SshTerminal = memo(function SshTerminal({ sessionId }: SshTerminalProps) {
  // Same xterm.js setup as terminal-pane.tsx:
  // - containerRef, termRef, fitAddonRef
  // - Catppuccin theme
  // - FitAddon + ResizeObserver
  // - IME handler
  // - Paste handler
  //
  // Uses useSsh(sessionId, onData) instead of usePty
  // ResizeObserver checks view === "ssh" instead of "terminal"
});
```

### 3. Extract shared xterm config (DRY)
Consider extracting to `src/utils/xterm-config.ts`:
```typescript
export const CATPPUCCIN_THEME = { ... };
export const XTERM_OPTIONS = {
  theme: CATPPUCCIN_THEME,
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
  fontSize: 14,
  cursorBlink: true,
};
```

Both terminal-pane.tsx and ssh-terminal.tsx import from here. Avoids duplicating the theme object.

## Todo
- [ ] Extract CATPPUCCIN_THEME + options to xterm-config.ts
- [ ] Create use-ssh.ts hook
- [ ] Create ssh-terminal.tsx component
- [ ] Update terminal-pane.tsx to use shared xterm-config.ts
- [ ] Verify xterm renders and receives SSH output

## Success Criteria
- SSH terminal renders with same look as local terminal
- Keystrokes sent to remote shell via ssh_write
- Terminal resizes correctly
- Vietnamese IME works

## Risk
- xterm.js instance must be disposed when session disconnects — handle in useEffect cleanup
