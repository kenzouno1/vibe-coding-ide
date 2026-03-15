# DevTools Documentation

Welcome to the DevTools project documentation. This folder contains comprehensive guides for developers working on this Tauri-based desktop IDE.

## Quick Navigation

### For New Developers
1. Start with **[Project Overview](./project-overview.md)** — Understand the project purpose, features, and structure
2. Read **[Code Standards](./code-standards.md)** — Learn naming conventions, file organization, and coding patterns
3. Review **[Design Guidelines](./design-guidelines.md)** — Understand UI patterns, colors, and keyboard shortcuts

### For Architecture & Design
- **[System Architecture](./system-architecture.md)** — High-level overview, component interactions, data flow
- **[Design Guidelines](./design-guidelines.md)** — Color palette, typography, spacing, component patterns
- **[Tech Stack](./tech-stack.md)** — Technology choices, rationale, and key decisions

### For Implementation
- **[Code Standards](./code-standards.md)** — File organization, naming conventions, patterns, and best practices
- **[System Architecture](./system-architecture.md)** — Data flow examples, state management, security guidelines

## Document Summaries

### project-overview.md (138 lines)
**Purpose:** Project goals, features, and workflow overview

**Contents:**
- Project purpose and key features (Terminal, Git, Editor)
- Project structure and directory organization
- Architecture overview (stores, backend services)
- Keyboard shortcuts reference
- Design system overview
- Development workflow

**Audience:** All team members, especially new developers

---

### code-standards.md (260 lines)
**Purpose:** Coding conventions and implementation patterns

**Contents:**
- File organization and naming (kebab-case TS, snake_case Rust)
- Code style per language
- Component and store patterns
- State management guidelines
- Error handling and security
- Testing conventions
- Documentation and commit standards
- Performance and accessibility guidelines

**Audience:** Developers implementing features

---

### design-guidelines.md (135 lines)
**Purpose:** UI/UX patterns and visual standards

**Contents:**
- Color palette (Catppuccin Mocha)
- Typography (fonts, sizes, weights)
- Spacing system (4px base unit)
- Component patterns (sidebar, tabs, diff viewer, editor)
- Icon style (Lucide icons)
- Keyboard shortcuts
- Responsive behavior
- Accessibility requirements

**Audience:** Frontend developers, UI/UX designers

---

### system-architecture.md (357 lines)
**Purpose:** Technical architecture and design patterns

**Contents:**
- High-level system diagram
- Frontend architecture (components, stores, hooks, utils)
- Backend architecture (commands, file ops, git ops, PTY)
- Data flow examples (file open, commit, terminal I/O)
- Project isolation model
- State persistence strategy
- Performance and security considerations
- Extension points (plugins, themes, LSP)

**Audience:** Architects, lead developers, code reviewers

---

### tech-stack.md (47 lines)
**Purpose:** Technology selections and rationale

**Contents:**
- Framework (Tauri v2, React 19, TypeScript, Vite)
- Terminal (xterm.js, portable-pty)
- Code Editor (Monaco, Catppuccin theme)
- Git integration (git CLI, diff2html)
- State management (Zustand)
- Styling (Tailwind, shadcn/ui)
- Build & package
- Key decisions and rationale

**Audience:** Architects, tech leads, decision makers

---

## Feature Documentation

### Terminal View (Ctrl+1)
See **[System Architecture](./system-architecture.md)** → Terminal View section
- Multi-pane split layout
- PTY backend management
- Session persistence

### Git View (Ctrl+2)
See **[System Architecture](./system-architecture.md)** → Git View section
- File staging/unstaging
- Commit interface
- Diff viewer

### Editor View (Ctrl+3)
See **[Design Guidelines](./design-guidelines.md)** → Editor View section
See **[System Architecture](./system-architecture.md)** → Editor View section
- Monaco Editor with syntax highlighting
- File explorer with tree navigation
- Multi-tab editing with dirty tracking
- Catppuccin Mocha theme

## State Management

All state is managed with Zustand. Each view has an associated store:

| Store | Purpose | Per-Project | Location |
|-------|---------|-------------|----------|
| AppStore | Current view (terminal/git/editor) | No | `src/stores/app-store.ts` |
| ProjectStore | Open project tabs, active tab | No | `src/stores/project-store.ts` |
| PaneStore | Terminal split pane tree | Yes | `src/stores/pane-store.ts` |
| GitStore | Staged/unstaged files, selection | Yes | `src/stores/git-store.ts` |
| EditorStore | Open file tabs, content, cursor | Yes | `src/stores/editor-store.ts` |

See **[Code Standards](./code-standards.md)** → State Management Guidelines for patterns.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Switch to Terminal | `Ctrl+1` |
| Switch to Git | `Ctrl+2` |
| Switch to Editor | `Ctrl+3` |
| Next project tab | `Ctrl+Tab` |
| Previous project tab | `Ctrl+Shift+Tab` |
| **Terminal:** Split horizontal | `Ctrl+Shift+H` |
| **Terminal:** Split vertical | `Ctrl+Shift+V` |
| **Terminal:** Close pane | `Ctrl+W` |
| **Editor:** Save file | `Ctrl+S` |
| **Editor:** Close file | `Ctrl+W` |
| **Git:** Commit | `Ctrl+Enter` |
| **Git:** Stage file | `S` (with file selected) |
| **Git:** Unstage file | `U` (with file selected) |

See **[Design Guidelines](./design-guidelines.md)** → Keyboard Shortcuts for complete reference.

## Common Tasks

### Adding a New Feature

1. Check **[Code Standards](./code-standards.md)** for file organization and naming
2. Review **[System Architecture](./system-architecture.md)** for where the feature fits
3. Follow component/store patterns from **[Code Standards](./code-standards.md)**
4. Update design guidelines if UI changes occur
5. Update this README if adding a new major feature/view

### Updating State Management

1. Check **[Code Standards](./code-standards.md)** → State Management Guidelines
2. Use per-project pattern if feature is project-scoped
3. Use Zustand create + set pattern (see examples in stores/)
4. Update **[System Architecture](./system-architecture.md)** store section if architectural change

### Adding a New Component

1. Follow **[Code Standards](./code-standards.md)** → Component Patterns
2. Keep component under 200 lines
3. Use TypeScript with strict mode
4. Add comments explaining "why", not "what"
5. Test error cases and edge cases

### Creating a New View

1. Create store in `src/stores/{view}-store.ts`
2. Create main component in `src/components/{view}-view.tsx`
3. Add view type to AppStore: `type AppView = "..." | "new-view"`
4. Add navigation item to Sidebar
5. Document shortcuts in design-guidelines.md
6. Update System Architecture with data flow

## Documentation Guidelines

### When to Update Docs
- After implementing a major feature
- When changing keyboard shortcuts
- When modifying state structure or store
- When adding security measures
- When making architectural changes

### What to Update
1. **Code Standards** — If coding patterns change
2. **System Architecture** — If data flow or component interactions change
3. **Design Guidelines** — If UI, colors, or shortcuts change
4. **Tech Stack** — If major dependency added/removed
5. **Project Overview** — If project goals or scope change

### How to Write
- Be concise; sacrifice grammar for clarity
- Use examples from actual code
- Link to related sections
- Include before/after for changes
- Verify all code references exist

## Development Workflow

1. **Research** — Explore problem, validate solutions (plans/research/)
2. **Planning** — Break into phases, create TODO list (plans/plan.md)
3. **Implementation** — Follow code standards, run linting
4. **Testing** — Write unit tests, verify edge cases
5. **Code Review** — Have peer review changes
6. **Documentation** — Update docs in this folder
7. **Commit** — Use conventional commit format
8. **Push** — Submit PR with description and test results

See **[Project Overview](./project-overview.md)** for detailed workflow phases.

## File Structure

```
docs/
├── README.md                 (this file) — Navigation and overview
├── project-overview.md       — Features, structure, workflow
├── code-standards.md         — Coding conventions and patterns
├── design-guidelines.md      — UI/UX patterns and shortcuts
├── system-architecture.md    — Technical architecture and design
├── tech-stack.md             — Technology choices and rationale
└── wireframes/               — UI mockups (HTML)
```

## Getting Help

### Understanding the codebase
→ Start with **[System Architecture](./system-architecture.md)** data flow section

### Implementing a feature
→ Follow **[Code Standards](./code-standards.md)** patterns and checklist

### Styling a component
→ Reference **[Design Guidelines](./design-guidelines.md)** color palette and spacing

### Choosing a technology
→ See **[Tech Stack](./tech-stack.md)** decisions and rationale

### Project goals and status
→ Check **[Project Overview](./project-overview.md)** and `plans/` directory

## Contributing

When contributing documentation:
1. Keep files under 500 lines each
2. Use relative links to other docs (`./{filename}.md`)
3. Verify all code references exist
4. Use Markdown formatting (bold for emphasis, code blocks for examples)
5. Update this README if adding new files
6. Link from relevant sections

## Last Updated

- **2026-03-15 17:35** — Added Editor view documentation (Monaco Editor + File Explorer)
  - Updated design-guidelines.md with editor shortcuts and component pattern
  - Updated tech-stack.md with Monaco Editor and file operations sections
  - Created project-overview.md with comprehensive feature and architecture overview
  - Created code-standards.md with complete coding conventions and patterns
  - Created system-architecture.md with detailed technical architecture

---

**Total Documentation:** 937 lines across 6 files (includes this README)
**All files under 500 lines limit** for optimal context management
