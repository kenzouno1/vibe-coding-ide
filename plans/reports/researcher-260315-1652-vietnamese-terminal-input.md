# Vietnamese Diacritical Characters in CLI/Terminal Applications

**Date:** 2026-03-15
**Platform:** Windows 11
**Scope:** Research on tiếng Việt có dấu (Vietnamese with diacritics) rendering/input in terminal environments

---

## Executive Summary

Vietnamese diacritical character input failures in Claude Code and similar CLI tools stem from **IME (Input Method Editor) composition event handling**, not display encoding. Terminal-level solutions exist across multiple Windows terminal emulators, though **Windows Terminal v1.15.228+** is the most robust option due to dedicated IME fixes. The issue is fundamentally about how applications handle multi-byte UTF-8 composition sequences and TSF (Text Services Framework) events.

---

## 1. Root Causes of Vietnamese Input Issues

### 1.1 IME Composition Event Handling
- **Primary Issue:** Terminal applications don't properly handle IME composition events where Vietnamese IME creates diacritics
- **Composition Problem:** When typing "xin chaof" to get "xin chào", the terminal needs to:
  1. Receive composition start/update/end events from Windows IME
  2. Replace the intermediate text with final composed characters
  3. Reset state for next word composition
- **Claude Code Specific:** Claude Code's custom TUI rendering layer doesn't properly manage multi-byte character composition sequences and composition event lifecycle

### 1.2 TSF (Text Services Framework) Integration
- Windows Terminal uses an "overlay" text field because the command-line buffer has not been connected to TSF
- TSF doesn't receive word delimitation signals (spaces, commas) from terminal buffers
- This limits advanced text editing and composition functionality
- Fixed in Windows Terminal v1.21.2361.0+ with rewritten IME integration

### 1.3 Encoding Issues (Secondary)
- Code pages: Windows-1258 (legacy) vs UTF-8 (modern)
- `chcp 65001` command sets UTF-8 codepage but has **critical limitations** for multi-byte locales like Vietnamese
- **Expert consensus:** `chcp 65001` is unreliable for Vietnamese; PowerShell is better

### 1.4 Vietnamese IME Composition Bug
Known bug in Windows Terminal <v1.15.228:
- After typing "Xin " + 'f', grave accent placed on 'i' of previous syllable → "Xinchaof" instead of "Xin chào"
- IME retains state from previous composition
- **Fixed in v1.15.228** with proper composition boundary handling

---

## 2. Terminal Emulator Comparison

### 2.1 Windows Terminal (RECOMMENDED)
**Status:** ✅ Best option
**Versions:** v1.21.2361.0+ (v1.15.228+ minimum)

**Pros:**
- Dedicated IME fixes for Vietnamese composition events
- Full UTF-8 support
- Proper TSF integration rewritten in v1.21+
- Handles Telex, VNI, VIQR input methods correctly
- Native Windows 11 application

**Configuration:**
```powershell
# In PowerShell profile
$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
```

**Known Workaround for v1.15.228-1.20:**
- Use default Vietnamese Telex IME
- Avoid rapid composition changes
- Insert pause between words

### 2.2 WezTerm
**Status:** ✅ Good alternative

**Pros:**
- IMM32 IME support on Windows
- Explicit `use_ime` configuration option (disabled by default)
- Rust-based, performant
- Cross-platform

**Configuration:**
```lua
-- wezterm.lua
config.use_ime = true
config.use_dead_keys = true
```

**Cons:**
- Less tested with Vietnamese than Windows Terminal
- May need additional configuration

### 2.3 ConEmu/Cmder
**Status:** ⚠️ Limited support

**Pros:**
- Legacy Windows support
- Customizable

**Cons:**
- No dedicated IME composition event handling
- UTF-8 support via `chcp 65001` but unreliable for Vietnamese
- Not recommended for multi-byte input

**If Using:**
```cmd
chcp 65001
:: Select Lucida Console or modern TrueType font (NOT Raster font)
```

### 2.4 VSCode Integrated Terminal
**Status:** ❌ Known issue

**Issue:** Diacritical characters cannot be typed in integrated terminal (works in editor, not terminal)
**Workaround:** Use external terminal or VSCode Vietnamese IME Helper extension
**Better Solution:** Use WezTerm or Windows Terminal as external terminal instead

### 2.5 Alacritty
**Status:** ❌ No IME support on Windows

**Issue:** Windows IME integration incomplete
**Recommendation:** Avoid for Vietnamese input

### 2.6 Hyper
**Status:** ❌ Not recommended

**Issue:** Electron-based, poor terminal input handling
**Recommendation:** Avoid for CLI applications requiring IME

### 2.7 Tabby (Terminal)
**Status:** ⚠️ Untested with Vietnamese

**Pros:**
- Unicode support claims
- Modern architecture

**Cons:**
- No documented Vietnamese support
- Unknown IME composition handling
- Issue reports about cursor movement with CJK characters

---

## 3. Windows 11 System Configuration

### 3.1 UTF-8 System Locale (Beta Feature)
**Location:** Settings → Time & Language → Language & Region → Administrative language settings → "Change system locale..."

**Toggle:** "Beta: Use Unicode UTF-8 for worldwide language support"

**Effect:**
- Affects non-Unicode applications globally
- Converts system locale from Windows-1258 to UTF-8
- May help with legacy CLI tools

**Caveats:**
- Some older applications may break
- Not needed if using modern terminals (Windows Terminal, PowerShell 7+)

### 3.2 Vietnamese Input Installation
**Windows 11 Default:** Vietnamese Telex IME pre-installed

**To Add VNI or VIQR Methods:**
1. Settings → Time & Language → Language & region
2. Select Vietnamese → Language options
3. Add Vietnamese Number Key-based IME or other variants

**Three Input Methods:**
- **Telex:** Most common, type `ofw` → ờ
- **VNI (Number Key):** Type `vuon72` → vườn
- **VIQR:** Accent-based combinations

### 3.3 PowerShell vs CMD
**Recommendation:** Use PowerShell Core (v7+)

**Why:**
- Better Unicode/UTF-8 handling than CMD.exe
- Modern character encoding support
- Windows Terminal native integration

---

## 4. Third-Party Vietnamese Input Tools

### 4.1 UniKey
**Status:** ⚠️ Legacy, but still functional

**Features:**
- TELEX, VNI, VIQR support
- Application exclusion list (useful for programmers)
- Windows 11/10/8/7 compatible
- Latest version: 4.6.250531

**Compatibility with Terminals:**
- Works with Windows Terminal (tested)
- Works with system-wide keyboard hooks
- Has "Application Exclusion" feature to disable Vietnamese in coding apps

**Link:** [Unikey on SourceForge](https://sourceforge.net/projects/unikey/)

### 4.2 EVKey
**Status:** ⚠️ Newer alternative to UniKey

**Features:**
- Lightweight, optimized for Windows 10+
- TELEX, VNI support
- Application Exclusion feature
- Windows XP and above

**Differences from UniKey:**
- More modern codebase
- Active development
- Designed for contemporary Windows versions

### 4.3 Recommendation
- **For Claude Code:** Don't use UniKey/EVKey with Claude Code as exclusion lists prevent input
- **For Other CLI Apps:** UniKey/EVKey useful if you want to disable Vietnamese in specific programs
- **Better Solution:** Use Windows Terminal with native Vietnamese IME and rely on terminal's composition handling

---

## 5. Claude Code Specific Issues

### 5.1 Known GitHub Issues
Multiple documented issues in Claude Code repository:

1. **Issue #10429:** "Bug Report: Vietnamese Input Not Working in Claude Code CLI"
2. **Issue #6094:** "[BUG] Unicode Character Input Corruption in Claude Code Terminal"
3. **Issue #3961:** "Unicode Input Handling Fails for Vietnamese Characters"
4. **Issue #10709:** "[BUG] Claude Code corrupts accented characters"

### 5.2 Root Cause (Claude Code Perspective)
- Custom TUI (Terminal UI) rendering layer doesn't properly handle:
  - Multi-byte UTF-8 input sequences
  - IME composition events (start/update/end)
  - TSF integration for character composition
- Similar to issues affecting Chinese, Japanese, Thai character input
- Systemic UTF-8 encoding corruption bug since June 2025 (unresolved as of Dec 2025)

### 5.3 User-Level Workaround (No Claude Code Patching)
Since patching Claude Code isn't acceptable, use terminal-level solutions:

**Option A: Windows Terminal (Recommended)**
- Update to v1.21.2361.0+
- Use default Vietnamese Telex IME
- Works with Claude Code because terminal handles composition

**Option B: External Editor + Copy-Paste**
- Type Vietnamese in external application (e.g., Word, Notepad)
- Copy Vietnamese text
- Paste into Claude Code
- Terminal-level composition is already resolved

**Option C: Terminal Workaround Script**
Create a wrapper script that:
1. Launches Claude Code with proper environment variables
2. Sets UTF-8 encoding before execution
3. May improve but won't fully fix underlying TUI issue

---

## 6. Recommended Configuration Steps

### 6.1 Windows Terminal Setup (Optimal)
```powershell
# 1. Install/Update Windows Terminal
# Download from: Microsoft Store or github.com/microsoft/terminal
# Ensure version 1.21.2361.0 or later

# 2. Create/Edit PowerShell profile
# Path: $PROFILE (usually Documents\PowerShell\profile.ps1)
$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding

# 3. Set Vietnamese IME as default
# Settings → Time & Language → Language & region → Vietnamese

# 4. Verify Vietnamese input works
# Type: xin chaof (should produce: xin chào)

# 5. Run Claude Code
claude-code
```

### 6.2 Alternative: WezTerm Setup
```lua
-- ~/.wezterm/wezterm.lua
local config = wezterm.config_builder()

config.use_ime = true
config.use_dead_keys = true
config.font = wezterm.font('Cascadia Code')

return config
```

### 6.3 Windows 11 System Settings
1. Settings → Time & Language → Language & region
2. Add Vietnamese language if not present
3. Click Vietnamese → Language options
4. Optionally enable "Beta: Use Unicode UTF-8 for worldwide language support"
5. Set default input method to "Vietnamese Telex IME"

### 6.4 Verify Configuration
```powershell
# Test Vietnamese input in terminal
# Type: tiếng Việt có dấu
# Should display: tiếng Việt có dấu (not: ti?ng Vi?t c? d?u)
```

---

## 7. Technical Deep Dive: Why Terminals Matter

### 7.1 IME Composition Flow
```
User types: x i n Space c h a o f
                        ↓
Vietnamese IME processes: "chao" + "f" (tone mark)
                        ↓
IME sends composition events to terminal:
  - CompositionStart(position)
  - CompositionUpdate(text="chào")
  - CompositionEnd(text="chào")
                        ↓
Terminal must handle events properly:
  - Replace intermediate text with final composed text
  - Clear composition state for next word
  - Maintain cursor position correctly
```

### 7.2 Why Some Terminals Fail
- **No TSF integration:** Terminal buffer not connected to Text Services Framework
- **No composition event handling:** Terminal treats each keystroke independently
- **No state management:** Composition state from previous syllable leaks into next

### 7.3 Why Windows Terminal v1.15.228+ Works
- Proper IME composition boundary detection
- State reset on whitespace/delimiters
- TSF integration (v1.21+)
- Handles composition lifecycle correctly

---

## 8. Known Issues & Limitations

### 8.1 Persistent Claude Code Issue
- **Status:** Unresolved as of Dec 2025 (6+ months)
- **Scope:** Affects all multi-byte character input (Vietnamese, Chinese, Japanese, Thai)
- **User Impact:** High for Vietnamese-speaking developers
- **Workaround:** Use external terminal or copy-paste from editor

### 8.2 VSCode Integrated Terminal Bug
- Diacritics work in editor, NOT in integrated terminal
- Affects all accent-using languages
- Workaround: Use external terminal (Windows Terminal/WezTerm)

### 8.3 Windows Terminal Pre-v1.15.228
- Composition state retention bug
- Manifests as grave accent on wrong syllable
- **Solution:** Update to latest Windows Terminal

### 8.4 Legacy Terminal Tools
- ConEmu, Cmder, CMD.exe: Unreliable for Vietnamese
- Not recommended for active development

---

## 9. Recommended Action Plan

### Priority 1: Immediate (Use Windows Terminal)
1. Update Windows Terminal to v1.21.2361.0+
2. Verify Vietnamese IME installed (Windows 11 default)
3. Configure PowerShell profile with UTF-8 encoding
4. Test Vietnamese input in Windows Terminal
5. Use Windows Terminal for Claude Code

### Priority 2: Backup Solution (WezTerm)
1. Download WezTerm for Windows
2. Enable `use_ime = true` in config
3. Keep as alternative terminal

### Priority 3: System-Wide (Optional)
1. Enable "Beta: Use Unicode UTF-8 for worldwide language support"
2. Install UniKey if you want Vietnamese exclusion lists for other apps
3. Update all Windows features

### Priority 4: If All Else Fails
1. Type Vietnamese in external editor (Notepad, Word)
2. Copy-paste into Claude Code
3. Terminal composition handled by source application, not Claude Code TUI

---

## 10. Sources & References

### Primary Sources
- [Microsoft Vietnamese IME Documentation](https://learn.microsoft.com/en-us/globalization/input/vietnamese-ime)
- [Windows Terminal GitHub Issue #11479 - Vietnamese IME Composition Bug](https://github.com/microsoft/terminal/issues/11479)
- [Windows Terminal PR #13678 - IME Fix by lhecker](https://github.com/microsoft/terminal/pull/13678)
- [Claude Code Issue #10429 - Vietnamese Input Not Working](https://github.com/anthropics/claude-code/issues/10429)
- [Claude Code Issue #6094 - Unicode Character Input Corruption](https://github.com/anthropics/claude-code/issues/6094)

### Terminal Emulator Documentation
- [WezTerm use_ime Configuration](https://wezterm.org/config/lua/config/use_ime.html)
- [ConEmu Unicode Support](https://conemu.github.io/en/UnicodeSupport.html)
- [Windows Command-Line: Unicode and UTF-8](https://devblogs.microsoft.com/commandline/windows-command-line-unicode-and-utf-8-output-text-buffer/)

### Input Methods
- [UniKey SourceForge](https://sourceforge.net/projects/unikey/)
- [EVKey Vietnamese Input](https://medium.com/@phanmemcuocsong.com/vietnamese-keyboard-setup-on-computer-487488ce1741)

### Configuration References
- [PowerShell Character Encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-7.5)
- [VSCode Integrated Terminal Issue #64922 - Diacritics](https://github.com/microsoft/vscode/issues/64922)

---

## Unresolved Questions

1. **Does WezTerm's `use_ime = true` fully solve Vietnamese composition without additional configuration?** (No documented Vietnamese testing found)
2. **Are there undocumented environment variables in Claude Code that control IME handling?** (Not found in public docs)
3. **When will Claude Code fix its UTF-8 composition event handling?** (No public timeline)
4. **Does enabling system-wide UTF-8 locale improve Claude Code Vietnamese input?** (Testing required; documentation suggests minimal impact for modern terminals)
5. **What is the exact version of Windows Terminal where Vietnamese works reliably?** (v1.15.228+ is minimum; v1.21.2361.0+ is confirmed working)
