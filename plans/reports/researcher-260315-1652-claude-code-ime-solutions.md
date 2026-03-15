# Vietnamese/CJK Input in Claude Code CLI: Terminal-Level & OS-Level Solutions
**Research Report** | 2026-03-15 | Focus: Non-Code Patches

---

## Executive Summary

Vietnamese character input corruption in Claude Code CLI is a **known architectural limitation** of React Ink's TextInput component. The issue affects all CJK languages (Chinese, Japanese, Korean) plus Vietnamese due to how Ink processes IME composition events in terminal raw mode.

**Key finding**: No pure terminal wrapper or OS-level configuration fully resolves the root cause. However, several mitigations exist at OS and terminal levels that improve UX without modifying Claude Code source.

---

## Root Cause Analysis

### Why It Happens

React Ink's TextInput component (used by Claude Code) operates in terminal raw mode and has critical limitations:

1. **No IME Composition Events**: Receives byte-level STDIN without proper composition event handling
2. **Per-Keystroke Processing**: Processes individual keystrokes without understanding multi-stage character formation
3. **Missing Composition Buffer**: No buffer to track in-progress IME input state
4. **No Cursor Position Tracking**: Cannot signal IME where cursor is located

This affects users of Vietnamese IME (OpenKey, EVKey, PHTV, Unikey) and other CJK input methods.

**Reference**: [Investigation #3045](https://github.com/anthropics/claude-code/issues/3045) confirms patching is infeasible—Claude Code ships as a single 7.6MB obfuscated/minified bundle with no source maps.

---

## Verified Solutions (Tested)

### 1. Community Patch Tool: `fix-vietnamese-claude-code`
**Status**: Proven workaround | **Effort**: Low | **Persistence**: Per-update

**What it does**:
- Auto-locates npm CLI or binary installation
- Applies patch to Ink's TextInput handling
- Supports macOS, Windows, Linux
- **Must re-run after Claude Code updates**

**Implementation**:
```bash
npx fix-vietnamese-claude-code
# or specify path:
npx fix-vietnamese-claude-code -f "C:\Users\YourUser\AppData\Roaming\npm\claude.cmd"
```

**Repo**: [0x0a0d/fix-vietnamese-claude-code](https://github.com/0x0a0d/fix-vietnamese-claude-code)

**Limitations**:
- Patch mechanism not documented (binary modification, unclear scope)
- Requires reapplication on every Claude Code version update
- May conflict with future Claude Code updates

**Best for**: Users willing to run maintenance command after updates

---

### 2. Windows 11: Enable System-Wide UTF-8 Support
**Status**: OS-level enablement | **Effort**: One-time | **Persistence**: Permanent

**What it does**:
- Enables UTF-8 as default system encoding (affects all terminals/apps)
- Works with Windows Terminal, ConEmu, PowerShell, CMD
- Handles multi-byte characters properly

**Implementation**:
```
Settings → Time & Language → Administrative language settings
→ Change system locale → Beta: Use Unicode UTF-8 for worldwide language support [✓]
```

**Impact**:
- Improves character handling across entire system
- Does NOT fix React Ink's IME composition issue directly
- Makes failures less severe (better fallback rendering)

**Reference**: [Microsoft Docs - Windows Command Line: Unicode and UTF-8](https://devblogs.microsoft.com/commandline/windows-command-line-unicode-and-utf-8-output-text-buffer/)

---

### 3. Use Windows Terminal (not legacy console)
**Status**: Terminal choice | **Effort**: Installation | **Persistence**: Permanent

**Why it matters**:
- Windows Terminal uses **ConPTY** (modern PTY layer) vs legacy console
- Better Unicode/IME handling in ConPTY mode
- Node.js automatically prefers ConPTY on Windows 18309+

**Setup**:
1. Install [Windows Terminal](https://apps.microsoft.com/store/detail/windows-terminal/9N0DX20HK701) from Microsoft Store
2. Set as default shell
3. Verify in settings: Profile → Advanced → Use ConPTY = ON

**Impact**:
- Modest improvement in character rendering
- Minimal impact on IME composition (architectural issue persists)

**Reference**: [Microsoft node-pty docs](https://github.com/microsoft/node-pty) - ConPTY is default on Windows 1809+

---

### 4. External Editor Composition Workaround
**Status**: User-side workaround | **Effort**: Workflow change | **Persistence**: Per-session

**Process**:
1. Compose text in external editor (VSCode, Notepad, etc.) where IME works correctly
2. Copy completed text
3. Paste into Claude Code input field (Ink supports bracketed paste mode)

**Why it works**:
- External editor handles IME composition properly
- Pasted text arrives as complete string, bypassing per-keystroke issue
- Ink's `usePaste` hook receives pasted data atomically

**Impact**:
- Reliable but disrupts workflow
- Acceptable for occasional input, poor for interactive sessions

---

## Not Effective Solutions

### ❌ `chcp 65001` (Change Code Page)
**Why it doesn't work**:
- Only affects console host encoding, not IME composition
- Creates multi-byte issues with Vietnamese characters
- [Multiple reports](https://dev.to/mattn/please-stop-hack-chcp-65001-27db) of failures with CJK input
- Temporary (resets per new console session)

**Status**: Avoid—modern UTF-8 system setting is superior

---

### ❌ Terminal Multiplexers (tmux, psmux, itmux)
**Why they don't help**:
- Multiplexers route I/O but don't fix Ink's composition handling
- Add latency without solving root cause
- Windows tmux alternatives (psmux, itmux) still use underlying ConPTY—doesn't bypass Ink

**Status**: Won't help for this specific issue

---

### ❌ Terminal Wrappers/Emulators (ConEmu, MobaXterm)
**Why they don't help**:
- All modern Windows terminals use ConPTY layer
- None provides special Ink IME handling
- ConEmu has Unicode support but doesn't patch Ink
- May worsen latency with extra layer

**Status**: No advantage over native Windows Terminal

---

## Environment Variables & Node.js Flags

### Explored Options (No Direct Impact)

Node.js environment variables that were researched:

| Variable | Impact | Relevance |
|----------|--------|-----------|
| `NODE_FORCE_READLINE` | Forces old readline mode | No—doesn't affect Ink |
| `TERM`, `COLORTERM` | Terminal type hints | No—Ink already detects |
| `LC_ALL`, `LANG` | Locale hints | No—system-level, doesn't patch Ink |
| `CONPTY_*` | ConPTY configuration | No documented IME options |

**Conclusion**: Node.js provides no flags to force IME composition event handling.

---

## Architectural Insights

### Why This Is Hard to Fix Without Code Changes

1. **Ink's Raw Mode Limitation**: Terminal raw mode (`setRawMode(true)`) disables OS-level line editing, meaning Ink must handle ALL input parsing including IME composition
2. **Distribution Barrier**: Claude Code is distributed as a single minified bundle—no straightforward way to patch React Ink without source access
3. **Upstream Dependency**: React Ink would need to implement composition event handling, then Claude Code would need to update
4. **Windows ConPTY Gap**: ConPTY supports IME composition events, but they must be explicitly handled by the application—Ink doesn't

### Reference Architecture

```
User Input → IME → ConPTY/Terminal → STDIN (bytes) → Ink TextInput
                                                     ↓
                                          No composition state tracking
                                          Per-keystroke processing
                                          ↓ Result: Broken diacritics
```

---

## Recommendations by Use Case

### If you must use Claude Code with Vietnamese input:

**Option A: Short-term (immediate use)**
- Use external editor workaround + paste
- Enable Windows 11 UTF-8 system setting (reduces corruption severity)

**Option B: Medium-term (can tolerate maintenance)**
- Apply `fix-vietnamese-claude-code` patch
- Accept reapplication after updates
- Still use Windows 11 UTF-8 setting for fallback

**Option C: Long-term (awaiting upstream)**
- Monitor [Issue #10429](https://github.com/anthropics/claude-code/issues/10429) (Vietnamese input)
- Monitor [Issue #3045](https://github.com/anthropics/claude-code/issues/3045) (IME investigation)
- Upstream fix: Anthropic updates React Ink dependency or implements custom TextInput

### What won't help:
- Terminal switching (ConEmu, MobaXterm, etc.)
- Terminal multiplexers (tmux)
- Code page changes (`chcp 65001`)
- Generic environment variables

---

## Implementation Summary

| Solution | OS-Level? | Terminal-Level? | Maintenance | Effectiveness |
|----------|-----------|-----------------|-------------|----------------|
| Fix Vietnamese patch | No | Yes | Per-update | High* |
| Enable UTF-8 system | Yes | Affects all | One-time | Low-Medium |
| Use Windows Terminal | Yes | Yes | One-time | Low-Medium |
| External editor paste | No | No | Per-session | High |

*High = works but requires reapplication

---

## Related GitHub Issues (Active)

- [#10429 - Vietnamese Input Not Working](https://github.com/anthropics/claude-code/issues/10429)
- [#3961 - Unicode Input Handling Fails for Vietnamese](https://github.com/anthropics/claude-code/issues/3961)
- [#3045 - Investigation: Fixing IME Issues via React Ink Patch](https://github.com/anthropics/claude-code/issues/3045)
- [#22732 - Korean IME: Characters Invisible During Composition (macOS)](https://github.com/anthropics/claude-code/issues/22732)
- [#15269 - ESC key submits incomplete input with Chinese IME](https://github.com/anthropics/claude-code/issues/15269)

---

## Sources

- [Bug Report: Vietnamese Input Not Working in Claude Code CLI (#10429)](https://github.com/anthropics/claude-code/issues/10429)
- [Unicode Input Handling Fails for Vietnamese Characters (#3961)](https://github.com/anthropics/claude-code/issues/3961)
- [GitHub - 0x0a0d/fix-vietnamese-claude-code](https://github.com/0x0a0d/fix-vietnamese-claude-code)
- [Investigation: Fixing IME Issues in Claude Code (#3045)](https://github.com/anthropics/claude-code/issues/3045)
- [Ink - React for interactive command-line apps](https://github.com/vadimdemedes/ink)
- [Windows Command-Line: Unicode and UTF-8 Output Text Buffer](https://devblogs.microsoft.com/commandline/windows-command-line-unicode-and-utf-8-output-text-buffer/)
- [How to set UTF-8 in Windows Terminal (#11956)](https://github.com/microsoft/terminal/issues/11956)
- [Microsoft node-pty: Fork pseudoterminals in Node.JS](https://github.com/microsoft/node-pty)
- [Please stop hack "chcp 65001"](https://dev.to/mattn/please-stop-hack-chcp-65001-27db)
- [Node.js Readline Documentation](https://nodejs.org/api/readline.html)
- [IME mode changed at startup in Google Japanese Input (#14407)](https://github.com/microsoft/terminal/issues/14407)
- [All IMEs don't work (#2213)](https://github.com/microsoft/terminal/issues/2213)
- [Composition Events in React (#8683)](https://github.com/facebook/react/issues/8683)

---

## Unresolved Questions

1. **Exact mechanism of fix-vietnamese-claude-code patch**: Documentation doesn't detail what code is modified. Reverse engineering would be needed.
2. **ConPTY IME composition API**: Whether detailed Windows ConPTY documentation exists for applications to consume composition events.
3. **Cross-platform IME roadmap**: No public commitment from Anthropic on when/if Ink IME support will be updated.
4. **Alternative Ink distributions**: Whether community-forked or patched versions of Ink exist that preserve IME functionality.
