---
title: "Migrate Browser from Sidebar Tab to Workspace Pane"
description: "Move browser from dedicated sidebar view into the pane split tree alongside terminal and Claude panes"
status: pending
priority: P1
effort: 6h
branch: main
tags: [browser, pane, refactor, native-webview]
created: 2026-03-21
---

# Migrate Browser from Sidebar Tab to Workspace Pane

## Summary

Remove the browser from the 5-view sidebar (terminal/git/editor/browser/ssh) and integrate it as a new `PaneType = "browser"` in the split pane binary tree. Users open browser panes via `Ctrl+Shift+B` split, alongside terminal and Claude panes. Multiple browser panes per project supported. Float/pin modes preserved.

## Key Challenges

1. **Native webview is not DOM** -- Tauri child webview is a native window overlay, positioned via absolute coordinates. Each browser pane needs its own webview instance with unique label, ResizeObserver tracking, and show/hide lifecycle.
2. **Multi-instance state** -- Current `browser-store.ts` keys state by `projectPath`. Must change to `paneId` keying for multiple browser panes per project.
3. **Visibility coordination** -- Webview must hide when terminal view is hidden AND when pane is not visible. Must show only when both conditions are met.
4. **Rust backend label generation** -- `browser_ops.rs` generates webview labels from project path hash. Must accept pane-scoped identifiers.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Refactor browser-store for pane-scoped state](phase-01-refactor-browser-store.md) | pending | 1h |
| 2 | [Update Rust backend for pane-scoped webviews](phase-02-update-rust-backend.md) | pending | 1h |
| 3 | [Create BrowserPane component](phase-03-create-browser-pane.md) | pending | 1.5h |
| 4 | [Integrate into pane system](phase-04-integrate-pane-system.md) | pending | 1h |
| 5 | [Remove browser sidebar view & update shortcuts](phase-05-remove-sidebar-view.md) | pending | 1h |
| 6 | [Float/pin mode & cleanup](phase-06-float-pin-cleanup.md) | pending | 0.5h |

## Architecture Diagram

```
BEFORE:
  Sidebar: [Terminal] [Git] [Editor] [Browser] [SSH]
  Terminal view -> SplitPaneContainer -> {terminal, claude} panes
  Browser view -> BrowserView (full screen, 1 per project)

AFTER:
  Sidebar: [Terminal] [Git] [Editor] [SSH]       (4 views)
  Terminal view -> SplitPaneContainer -> {terminal, claude, browser} panes
  Each browser pane -> BrowserPane -> manages own native webview
```

## Dependencies

- No external dependency changes
- No Cargo.toml changes needed (Tauri APIs already used)
- Existing components reused: `BrowserUrlBar`, `BrowserConsolePanel`, `AnnotationOverlay`, `FeedbackComposer`, `FloatingPanel`
