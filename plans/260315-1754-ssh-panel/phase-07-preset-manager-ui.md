# Phase 7: SSH Preset Manager UI

## Context
- Depends on Phase 2 (backend presets) and Phase 3 (store)
- This is the "landing page" of SSH view when no session is active

## Overview
- **Priority:** P2
- **Status:** done
- **Effort:** 1h

## Key Insights
- Two states: preset list view and edit/create form
- Quick-connect: click preset → prompt password (if auth=password) → connect
- Minimal form: name, host, port, username, auth method, key path
- Matches Catppuccin Mocha theme styling

## Files to Create
- `src/components/ssh-preset-manager.tsx` (~130 lines)
- `src/components/ssh-preset-form.tsx` (~120 lines)

## Implementation Steps

### 1. Create ssh-preset-manager.tsx
```typescript
export function SshPresetManager() {
  const presets = useSshStore((s) => s.presets);
  const loadPresets = useSshStore((s) => s.loadPresets);
  const connect = useSshStore((s) => s.connect);
  const [editing, setEditing] = useState<SshPreset | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadPresets(); }, []);

  // Layout:
  // - Header: "SSH Connections" + "New" button
  // - Preset cards in a grid/list
  // - Each card: name, host:port, username, Connect button, Edit button, Delete button
  // - Click Connect: if password auth → prompt dialog → connect
  //                   if key auth → connect directly
}
```

### 2. Create ssh-preset-form.tsx
```typescript
interface SshPresetFormProps {
  preset?: SshPreset; // undefined = create mode
  onSave: (preset: SshPreset) => void;
  onCancel: () => void;
}

export function SshPresetForm({ preset, onSave, onCancel }: SshPresetFormProps) {
  // Form fields: name, host, port, username, authMethod radio, privateKeyPath
  // Key path: use tauri dialog to browse for file
  // Save: generate uuid if new, call onSave
}
```

### 3. Password prompt
For password auth connections, use `window.prompt()` initially (KISS). Can upgrade to custom modal later.

### 4. Connect flow
```typescript
async function handleConnect(preset: SshPreset) {
  let password: string | undefined;
  if (preset.authMethod === "password") {
    password = window.prompt(`Password for ${preset.username}@${preset.host}:`);
    if (password === null) return; // cancelled
  }
  await connect(preset, password);
}
```

## Todo
- [ ] Create ssh-preset-manager.tsx
- [ ] Create ssh-preset-form.tsx
- [ ] Implement connect flow with password prompt
- [ ] Style with Catppuccin theme classes
- [ ] Test CRUD and connect

## Success Criteria
- List saved presets on SSH view load
- Create/edit/delete presets
- Connect from preset (password prompt if needed)
- After connect, view switches to split layout automatically

## Risk
- `window.prompt()` looks native/ugly. Acceptable for MVP; can replace with styled dialog later.
