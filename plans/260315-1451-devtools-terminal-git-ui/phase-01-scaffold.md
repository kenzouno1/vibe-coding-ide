# Phase 1: Tauri + React Scaffold

## Priority: Critical
## Status: Pending (waiting for Rust install)

## Overview
Bootstrap Tauri v2 project with React + TypeScript + Vite frontend.

## Steps
1. Install Tauri CLI: `npm create tauri-app@latest`
2. Select: React + TypeScript + Vite template
3. Install deps: Tailwind CSS, shadcn/ui, Zustand, Lucide icons
4. Configure Tailwind with Catppuccin Mocha colors
5. Set up Tauri permissions for shell, fs, process
6. Verify `npm run tauri dev` works

## Files to Create/Modify
- `package.json` — deps
- `src-tauri/Cargo.toml` — Rust deps (portable-pty)
- `src-tauri/tauri.conf.json` — window config, permissions
- `tailwind.config.ts` — Catppuccin theme
- `src/App.tsx` — root layout

## Success Criteria
- `npm run tauri dev` opens empty window with React + Tailwind rendering
- Hot reload works
