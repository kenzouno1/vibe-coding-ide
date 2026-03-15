# Phase 7: Keyboard Shortcuts

## Priority: Medium
## Status: Pending

## Files
- `hooks/use-keyboard-shortcuts.ts` — global shortcut handler
- Update all components to respond to shortcuts

## Shortcuts
| Key | Action |
|-----|--------|
| Ctrl+1 | Switch to Terminal |
| Ctrl+2 | Switch to Git |
| Ctrl+T | New terminal tab |
| Ctrl+W | Close current pane |
| Ctrl+Shift+H | Split horizontal |
| Ctrl+Shift+V | Split vertical |
| Ctrl+Tab | Next pane |
| Ctrl+Enter | Commit (in git view) |
| S | Stage file (in git view) |
| U | Unstage file (in git view) |

## Success Criteria
- All shortcuts work globally
- No conflicts with terminal input (terminal captures when focused)
