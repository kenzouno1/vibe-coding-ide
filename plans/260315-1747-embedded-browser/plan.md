---
status: in-progress
created: 2026-03-15
slug: embedded-browser
phases: 6
last_updated: 2026-03-15
---

# Embedded Browser Feature — Implementation Plan

## Context
- Brainstorm: `plans/reports/brainstorm-260315-1747-embedded-browser-feature.md`
- Architecture: `docs/system-architecture.md`
- Code standards: `docs/code-standards.md`

## Overview
Add embedded browser (View 4, Ctrl+4) to DevTools with:
- Tauri v2 native multi-webview for rendering web pages
- JS bridge for console error capture → terminal
- Text selection → terminal
- Auto-detect localhost dev servers from terminal output
- Screenshot + Konva.js annotation canvas
- Structured feedback workflow to terminal
- Split pane + floating panel layout modes

## Phase Summary

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Browser Pane MVP](phase-01-browser-pane-mvp.md) | complete | P0 | L |
| 2 | [Console Capture Bridge](phase-02-console-capture-bridge.md) | pending | P0 | M |
| 3 | [Terminal Integration](phase-03-terminal-integration.md) | pending | P1 | M |
| 4 | [Screenshot & Annotation](phase-04-screenshot-annotation.md) | pending | P1 | L |
| 5 | [Feedback Workflow](phase-05-feedback-workflow.md) | pending | P2 | M |
| 6 | [Float Layout & DevTools](phase-06-float-layout-devtools.md) | pending | P2 | M |

## Key Dependencies
- Phase 2 depends on Phase 1 (needs webview)
- Phase 3 depends on Phase 2 (needs console bridge)
- Phase 4 independent of 2/3 (only needs Phase 1)
- Phase 5 depends on Phase 4 (needs annotation)
- Phase 6 independent (layout refactor)

## Tech Stack Additions
| Package | Purpose | Size |
|---------|---------|------|
| konva | 2D canvas library | ~55KB gzip |
| react-konva | React bindings for Konva | ~10KB gzip |
| (no new Rust crates needed — Tauri v2 multi-webview is built-in via wry) | | |

## Files Changed/Created Summary
- **Modified**: `app-store.ts`, `app.tsx`, `sidebar.tsx`, `use-keyboard-shortcuts.ts`, `lib.rs`, `Cargo.toml`, `tauri.conf.json`
- **New Frontend**: `browser-view.tsx`, `browser-url-bar.tsx`, `browser-console-panel.tsx`, `annotation-overlay.tsx`, `annotation-toolbar.tsx`, `floating-panel.tsx`, `browser-store.ts`, `use-server-detect.ts`
- **New Backend**: `browser_ops.rs`
