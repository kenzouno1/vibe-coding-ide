# Phase 6: App Shell (Sidebar, Status Bar, Theme)

## Priority: Medium
## Status: Pending

## Overview
Assemble full app layout: sidebar nav, status bar, Catppuccin theming.

## Files
- `components/sidebar.tsx` — icon-only nav (Terminal/Git/Settings)
- `components/status-bar.tsx` — project, branch, session count, shortcuts
- `components/app-layout.tsx` — main layout orchestrator
- `lib/theme.ts` — Catppuccin Mocha color tokens

## Steps
1. AppLayout: sidebar + main content area + status bar
2. Sidebar: Terminal/Git view switching with active indicator
3. Status bar: project name, branch, session count
4. Apply Catppuccin theme globally
5. Custom window title bar (Tauri decorations: false)

## Success Criteria
- Switch between Terminal and Git views
- Status bar shows live info
- Consistent Catppuccin dark theme
