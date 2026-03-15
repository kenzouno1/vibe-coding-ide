# DevTools

**Lightweight dev environment for vibe coders.**

English | [Tiếng Việt](README.vi.md)

Modern IDEs ship with hundreds of features — debuggers, profilers, refactoring wizards, database explorers, extension ecosystems, remote containers, and more. Most vibe coders never touch 90% of them. What they actually need is a terminal, a way to see their changes, and quick access to git. Everything else is noise.

DevTools strips away the bloat and keeps only what matters:

- **Terminal** — Split panes, multi-project tabs, built-in PTY. Just code.
- **Git** — Stage, diff, commit. No menus, no wizards.
- **Editor** — Monaco-powered, multi-tab file editing when you need to make a quick fix.
- **Browser** — Embedded browser to preview your app without alt-tabbing.

That's it. Four views. One sidebar. Zero distractions.

## Why?

Vibe coding is about flow — you talk to an AI, it writes code, you run it, you see results, you iterate. The IDE should stay out of your way, not demand your attention with settings panels, plugin conflicts, and 50 toolbar buttons.

DevTools is built for this workflow:

1. Open your project
2. Run your AI coding tool in the terminal
3. Preview changes in the browser
4. Commit when you're happy

No setup wizards. No workspace configs. No "which extension should I install?" rabbit holes.

## Tech Stack

| Layer    | Tech                          |
| -------- | ----------------------------- |
| Shell    | Tauri v2 (Rust)               |
| Frontend | React 19, TypeScript, Vite    |
| Styling  | Tailwind CSS v4, Catppuccin   |
| Editor   | Monaco Editor                 |
| Terminal | xterm.js + portable-pty       |
| State    | Zustand                       |

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

Requires: Node.js 18+, Rust toolchain, Tauri v2 CLI.

## Project Structure

```
src/                    # React frontend
  components/           # UI components (terminal, git, editor, browser)
  stores/               # Zustand state management
  hooks/                # Custom React hooks
src-tauri/              # Rust backend
  src/
    lib.rs              # Tauri commands & PTY management
    git_ops.rs          # Git operations
    ssh_manager.rs      # SSH/SFTP support
    browser_ops.rs      # Embedded browser logic
```

## License

MIT — see [LICENSE](LICENSE) for details.
