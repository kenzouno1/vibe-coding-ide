# Documentation Update Report: Browser Sidebar → Workspace Pane

**Date:** 2026-03-21 19:50 UTC
**Scope:** Architecture migration from browser as sidebar view to browser as workspace pane type

## Summary

Updated all project documentation to reflect the architectural shift where the browser has been migrated from a dedicated sidebar view (Ctrl+4) to a workspace pane type integrated into the terminal view. This change reduces the number of sidebar views from 5 to 4 and enables multiple browser panes per project.

## Files Updated

### 1. `docs/project-overview.md`
**Lines changed:** ~40
- **Key Features section:**
  - Removed "Browser View (Ctrl+4)" standalone feature
  - Added "Browser Pane (Ctrl+Shift+B)" under Claude Chat Pane context
  - Updated Terminal View to mention browser splits with Ctrl+Shift+B
  - Added F5 and F12 keyboard shortcuts for browser pane
  - Moved browser from sidebar view to terminal-integrated feature

- **Architecture Overview - State Management:**
  - Updated AppStore: view now `terminal|git|editor|ssh` (removed browser)
  - Updated PaneStore: pane types now `terminal|claude|browser` (browser is pane type)
  - Updated BrowserStore: now keyed by paneId instead of projectPath (multiple browsers per project)
  - Renamed "Browser View" to "Browser Pane"

- **Keyboard Shortcuts table:**
  - Removed `Ctrl+4 → Switch Browser`
  - Changed `Ctrl+4` → Switch SSH (was Ctrl+5)
  - Removed `Ctrl+5 → Switch SSH`
  - Added `Ctrl+Shift+B` → Split Browser pane
  - Added F5 and F12 shortcuts for browser when focused

### 2. `docs/system-architecture.md`
**Lines changed:** ~25
- **High-Level Overview:**
  - Updated view count from 6 to 5 (removed browser view)
  - Clarified pane integration (Claude Chat, Browser, Terminal as pane types)
  - Updated diagram to show pane types in terminal view
  - Added browser_ops to backend for per-pane webview management

- **View Layer - Browser Pane:**
  - Renamed section from "Browser View" to "Browser Pane"
  - Updated component references (browser-pane.tsx, browser-url-bar.tsx)
  - Added per-pane state (paneId keying)
  - Documented multiple browsers per project support
  - Added F5/F12 shortcut behavior
  - Added pin mode and float mode features

- **AppStore documentation:**
  - Removed "browser" from AppView type union
  - Added clarification that browser moved to pane type

- **PaneStore documentation:**
  - Updated type definition to include "browser" in paneType
  - Clarified binary tree structure per project
  - Documented getPaneType() method

- **BrowserStore documentation:**
  - Changed keying from `Record<projectPath, BrowserState>` to `Record<paneId, BrowserState>`
  - Documented per-pane support (multiple browsers per project)
  - Clarified lazy webview instantiation

### 3. `docs/design-guidelines.md`
**Lines changed:** ~15
- **Keyboard Shortcuts table:**
  - Removed `Ctrl+4 → Switch to Browser`
  - Changed `Ctrl+4` → Switch to SSH (was Ctrl+5)
  - Removed `Ctrl+5` entry
  - Added `Ctrl+Shift+B` → Split Browser pane
  - Added `F5` → Refresh browser pane (context: when browser focused)
  - Added `F12` → Open browser DevTools (context: when browser focused)
  - Moved browser shortcuts into Terminal View section

### 4. `docs/code-standards.md`
**Lines changed:** ~10
- **Store Responsibilities section:**
  - Updated AppStore: clarified view types (removed browser)
  - Updated PaneStore: clarified pane types include browser
  - Added BrowserStore responsibility: per-pane browser state
  - Added ClaudeStore responsibility: per-pane chat state
  - Added SSHStore responsibility: per-project SSH state

## Technical Changes Explained

### View Restructuring
- **Before:** 5 sidebar tabs (Terminal, Git, Editor, Browser, SSH)
- **After:** 4 sidebar tabs (Terminal, Git, Editor, SSH)
- Browser functionality integrated into Terminal view as a pane type

### State Keying
- **AppStore:** View union now excludes "browser" (4 types instead of 5)
- **PaneStore:** PaneType union now includes "browser" alongside "terminal" and "claude"
- **BrowserStore:** State keyed by paneId instead of projectPath, enabling multiple browsers per project

### Keyboard Shortcuts
| Old | New | Notes |
|-----|-----|-------|
| Ctrl+4 | Browser View | Ctrl+4 → SSH (shifted up) |
| Ctrl+5 | SSH View | Removed (SSH takes Ctrl+4) |
| N/A | Ctrl+Shift+B | New: Split with browser pane |
| N/A | F5 | New: Refresh browser (in terminal view) |
| N/A | F12 | New: Open browser DevTools (in terminal view) |

### Multi-Browser Support
The change from per-project to per-pane browser state enables:
- Multiple browser instances in the same project
- Independent navigation state per browser pane
- Browser panes alongside Terminal and Claude Chat panes
- Pin mode to keep browser visible across view switches

## Verification

All documentation changes verified against:
- `src/hooks/use-keyboard-shortcuts.ts` (keyboard handler)
- `src/stores/pane-store.ts` (PaneType definition includes "browser")
- `src/stores/browser-store.ts` (per-pane state structure)

Code confirms:
- Ctrl+4 maps to setView("ssh") ✓
- Ctrl+Shift+B maps to split(..., "browser") ✓
- F5 invokes browser_reload when browser pane focused ✓
- F12 invokes open_browser_devtools when browser pane focused ✓
- PaneType = "terminal" | "claude" | "browser" ✓

## Impact Assessment

**Scope:** Documentation only (reflects existing code changes)
**Affected sections:**
- Architecture overview (4 views instead of 5)
- Keyboard shortcuts (Ctrl+4 reassignment, new Ctrl+Shift+B)
- State management patterns (browser keyed by paneId)
- Feature descriptions (browser as pane, not view)

**No breaking changes:** All updates maintain backward compatibility in spirit; code already implements these changes.

## Recommendations

1. **Future docs:** Continue pattern of documenting pane types vs sidebar views
2. **API examples:** When showing browser usage, reference paneId not projectPath
3. **UX docs:** Note that F5/F12 only work when browser pane is focused in terminal view

## Unresolved Questions

None. All documentation aligned with current codebase implementation.
