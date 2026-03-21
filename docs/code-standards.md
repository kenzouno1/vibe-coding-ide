# Code Standards — DevTools

## File Organization

### TypeScript/React Files (Frontend)
- **Location**: `src/` directory
- **Naming**: kebab-case (e.g., `file-explorer.tsx`, `editor-store.ts`)
- **Size limit**: Keep components/stores under 200 lines
- **Organization**:
  - `components/` — UI components (terminal-pane.tsx, editor-view.tsx)
  - `stores/` — Zustand state stores (app-store.ts, editor-store.ts)
  - `hooks/` — Custom React hooks (use-keyboard-shortcuts.ts, use-pty.ts)
  - `utils/` — Utility functions (language-detect.ts, file-icons.ts)

### Rust Files (Backend)
- **Location**: `src-tauri/src/` directory
- **Naming**: snake_case (e.g., `file_ops.rs`, `pty_manager.rs`)
- **Organization**:
  - `main.rs` — Tauri app setup and initialization
  - `lib.rs` — Command handlers and IPC interface
  - `file_ops.rs` — File read/write operations
  - `git_ops.rs` — Git command execution
  - `pty_manager.rs` — Terminal PTY management
  - `session_store.rs` — Session persistence logic
  - `clipboard_helper.rs` — Clipboard utilities
  - `browser_ops.rs` — Browser webview lifecycle management
  - `ssh_manager.rs` — SSH connection management via russh
  - `sftp_ops.rs` — SFTP file operations
  - `ssh_presets.rs` — SSH preset persistence
  - `claude_manager.rs` — Claude CLI subprocess, NDJSON streaming
  - `agent_server.rs` — WebSocket server for agent protocol (127.0.0.1:9876-9880)
  - `agent_protocol.rs` — Agent protocol message types

## Code Style

### TypeScript/React
- **Formatting**: Use Prettier for consistent formatting
- **Linting**: ESLint with recommended rules
- **Language**: TypeScript strict mode enabled
- **Imports**: Use path aliases (`@/` for src/ directory)
- **Naming**:
  - Components: PascalCase (e.g., `EditorView`, `FileExplorer`)
  - Functions/variables: camelCase (e.g., `openFile`, `activeFilePath`)
  - Constants: UPPER_SNAKE_CASE (e.g., `MAX_WIDTH = 500`)
  - Store actions: camelCase (e.g., `setActiveFile`, `saveFile`)

### Rust
- **Formatting**: `rustfmt` (standard Rust format)
- **Linting**: `clippy` warnings addressed before commit
- **Naming**:
  - Types: PascalCase (e.g., `EditorState`, `GitStatus`)
  - Functions: snake_case (e.g., `read_file`, `git_status`)
  - Constants: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- **Error Handling**: Result<T, E> for fallible operations, log errors clearly

## Component Patterns

### React Components
```typescript
interface ComponentProps {
  projectPath: string;
  onClose?: () => void;
}

export function ComponentName({ projectPath, onClose }: ComponentProps) {
  // Hooks first
  const store = useStore((s) => s.selector);

  // Callbacks
  const handleAction = useCallback(() => {}, []);

  // Render
  return <div>...</div>;
}
```

### Zustand Store Pattern
```typescript
interface StoreState {
  data: Type[];
  action: (arg: Arg) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  data: [],
  action: (arg) => set((s) => ({
    data: [...s.data, arg]
  })),
}));
```

### Claude Chat Component Pattern
```typescript
// Per-pane Claude state via ClaudeStore
const ClaudeStore: Record<paneId, {
  messages: Message[];
  streaming: boolean;
  sessionId: string;
  cost: number;
  model: "default" | "opus" | "sonnet" | "haiku";
  permissions: PermissionMode;
  attachments: Attachment[];
}>
```
- Messages include assistant tool use blocks with language-specific rendering
- Slash commands dispatch to backend or execute locally (/clear, /new, /cost, /help)
- Attachments stored as {type, data, filename} — images/PDFs previewed
- Streaming via NDJSON backend, cost calculated from response metadata

## State Management Guidelines

### Store Responsibilities
- **AppStore** — Global UI state only (current view)
- **ProjectStore** — Open project tabs, active tab
- **PaneStore** — Terminal pane tree per project
- **GitStore** — Git file state (staged/unstaged) per project
- **EditorStore** — Open file tabs, content, cursor per project

### Per-Project State
Most stores use `Record<projectPath, State>` pattern:
```typescript
states: Record<string, ProjectEditorState>;
getState: (projectPath: string) => ProjectEditorState;
```

When a project is removed, clean up its state via `removeProject(projectPath)`.

## Error Handling

### Frontend
- Use try/catch for async operations
- Log errors to console with context
- Show user-friendly error messages in UI
- Don't let errors crash the app

```typescript
try {
  const content = await invoke("read_file", { path: filePath });
} catch (err) {
  console.error("Failed to read file:", err);
  // Show toast or message to user
}
```

### Backend (Rust)
- Return `Result<T, String>` for fallible operations
- Log errors with `eprintln!` or logging framework
- Validate paths before file operations
- Return meaningful error messages to frontend

```rust
pub fn read_file(path: &str) -> Result<String, String> {
  validate_path(path)?;
  std::fs::read_to_string(path)
    .map_err(|e| format!("Failed to read: {}", e))
}
```

## Security Guidelines

### Path Traversal Protection
- Validate all file paths in `file_ops.rs`
- Prevent `..` sequences and absolute paths outside project
- Use `std::path::Path::canonicalize` for validation
- Log suspicious path attempts

### Git Command Safety
- Escape shell arguments in `git_ops.rs`
- Use subprocess with explicit args array, not shell strings
- Validate git commands before execution

### Terminal Input
- Sanitize terminal input to prevent code injection
- Validate PTY data before forwarding to UI
- Monitor resource usage (memory, file handles)

## Testing Conventions

### Unit Tests
- Locate in same file as code: `#[cfg(test)]`
- Name: `test_function_name`
- Test happy path and error cases

### Integration Tests
- Locate in `tests/` directory at project root
- Test component interactions and store behavior
- Use mock data, not real file I/O

## Documentation Requirements

### Code Comments
- Explain "why", not "what"
- Add comments for complex logic, hacks, workarounds
- Update comments when code changes

### Function Documentation
```typescript
/**
 * Opens a file in the editor and loads its content.
 * If already open, switches to that file.
 *
 * @param projectPath - Full path to project directory
 * @param filePath - Relative or absolute file path
 */
```

### Commit Messages
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Keep subject under 50 characters
- Reference issue/PR if applicable
- Explain "why" in body, not "what"

Example:
```
feat: add dark mode support to editor

Use Catppuccin Mocha theme for editor instance.
Persist theme preference to localStorage.
Fixes #123
```

## Performance Guidelines

### Frontend
- Memoize callbacks with `useCallback`
- Use selector functions in stores to avoid rerenders
- Lazy load components if needed
- Keep components under 200 lines

### Backend
- Cache git status to avoid repeated CLI calls
- Use efficient file I/O (streaming for large files)
- Limit PTY output buffer size
- Profile and optimize hot paths

## Accessibility (a11y)

### ARIA Labels
- Add `aria-label` to icon-only buttons
- Use semantic HTML (`<button>`, not `<div role="button">`)

### Keyboard Navigation
- All interactive elements keyboard-accessible
- Focus rings visible and clear
- Keyboard shortcuts documented in UI

### Color Contrast
- All text meets WCAG AA contrast ratios
- Don't rely on color alone (use icons/text)

## Version Control Workflow

### Branching
- Feature branches: `feature/short-description`
- Bug fix branches: `fix/short-description`
- Never force-push to main

### Commits
- One logical change per commit
- Reference issues in commit messages
- Keep commits small and focused

### Pull Requests
- Descriptive title and summary
- Link to related issues
- Request review from team
- Address review comments in new commits

## Removed Components

- **use-ime-handler.ts** (deleted) — IME composition events no longer used
- **ime_handler.rs** (deleted) — Rust IME handler removed

## Development Checklist

Before committing:
- [ ] Code compiles/type-checks
- [ ] No console errors or warnings
- [ ] Error handling in place
- [ ] Follows naming conventions
- [ ] Under 200 lines (components/stores)
- [ ] No hardcoded values (use constants)
- [ ] Comments updated if needed
- [ ] Tests pass

Before pushing:
- [ ] All tests pass
- [ ] Linting passes (ESLint, clippy)
- [ ] Code review requested
- [ ] No secrets committed (.env, keys, tokens)
