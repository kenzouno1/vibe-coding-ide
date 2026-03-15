# Phase 6: SSH Panel + App Integration

## Context
- [app.tsx](../../src/app.tsx) — add SSH view rendering
- [sidebar.tsx](../../src/components/sidebar.tsx) — add SSH nav button
- [split-handle.tsx](../../src/components/split-handle.tsx) — reuse for SFTP/terminal split
- Depends on Phase 4 (SshTerminal) and Phase 5 (SftpBrowser)

## Overview
- **Priority:** P1
- **Status:** done
- **Effort:** 1.5h

## Key Insights
- SSH view is NOT per-project-tab. It's a standalone view with its own connection list.
- When no active SSH session: show preset manager (connect screen)
- When connected: show split layout (SFTP left, terminal right)
- Reuse SplitHandle for resizable divider

## Files to Create
- `src/components/ssh-panel.tsx` (~100 lines)

## Files to Modify
- `src/components/sidebar.tsx` — add SSH icon (lucide `Monitor` or `Server`)
- `src/app.tsx` — add SSH view conditional rendering
- `src/hooks/use-keyboard-shortcuts.ts` — add Ctrl+4 shortcut for SSH view (if pattern exists)

## Implementation Steps

### 1. Create ssh-panel.tsx
```typescript
export function SshPanel() {
  const activeSessionId = useSshStore((s) => s.activeSessionId);
  const [splitRatio, setSplitRatio] = useState(0.3);

  // No active session → show preset manager
  if (!activeSessionId) {
    return <SshPresetManager />;
  }

  // Active session → SFTP browser + SSH terminal
  return (
    <div className="h-full flex">
      <div style={{ width: `${splitRatio * 100}%` }} className="h-full overflow-hidden">
        <SftpBrowser sessionId={activeSessionId} />
      </div>
      <SplitHandle direction="horizontal" onResize={setSplitRatio} />
      <div style={{ width: `${(1 - splitRatio) * 100}%` }} className="h-full overflow-hidden">
        <SshTerminal sessionId={activeSessionId} />
      </div>
    </div>
  );
}
```

### 2. Update sidebar.tsx
```typescript
import { Terminal, GitBranch, Code, Monitor } from "lucide-react";

const NAV_ITEMS = [
  { view: "terminal", icon: Terminal, label: "Terminal" },
  { view: "git", icon: GitBranch, label: "Git" },
  { view: "editor", icon: Code, label: "Editor" },
  { view: "ssh", icon: Monitor, label: "SSH" },
];
```

### 3. Update app.tsx
Add SSH view block after editor view:
```tsx
{/* SSH view */}
<div
  className="absolute inset-0"
  style={{
    visibility: view === "ssh" ? "visible" : "hidden",
    zIndex: view === "ssh" ? 1 : 0,
  }}
>
  <SshPanel />
</div>
```

**Note:** SSH panel renders once (not per-tab) since it's connection-based. Could be outside the tab loop, or inside with same content. Simpler: render inside tab loop same as others, SSH panel ignores projectPath.

### 4. Update keyboard shortcuts (if applicable)
Check use-keyboard-shortcuts.ts for view switching patterns. Add Ctrl+4 for SSH if Ctrl+1/2/3 exist.

## Todo
- [ ] Create ssh-panel.tsx with split layout
- [ ] Add SSH to sidebar NAV_ITEMS
- [ ] Add SSH view rendering in app.tsx
- [ ] Add keyboard shortcut if pattern exists
- [ ] Test view switching and layout

## Success Criteria
- SSH icon appears in sidebar
- Clicking it shows preset manager (when disconnected)
- After connecting: split layout with SFTP + terminal
- Split handle resizable
- View switching preserves SSH session state
