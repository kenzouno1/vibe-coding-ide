# Git Diff Viewer & Commit UI Research Report

## Executive Summary
**Best stack for Windows dev tool (Electron/web):** isomorphic-git (git ops) + diff2html (rendering) + line-by-line staging via hunk mapping. Monaco Editor preferred for 10MB+ files.

---

## 1. Git Operations Library Selection

### Comparison Matrix
| Lib | Browser | Node | Performance | Use Case |
|-----|---------|------|-------------|----------|
| **isomorphic-git** | ✅ | ✅ | Medium | Browser + Node hybrid, client-side git |
| **simple-git** | ❌ | ✅ | Good | Node CLI wrapper, lightweight |
| **nodegit** | ❌ | ✅ | Excellent | Server-side, libgit2 native, complex ops |

### Recommendation: **isomorphic-git**
- Pure JavaScript, works in browser/Electron
- 100% git-compatible (modifies .git directory like real git)
- Staging: `git.add({dir, filepath})` for files or `git.add({dir, filename: '.'})` for all
- Commit: `git.commit({dir, author, message})`
- Active maintenance, ~35k weekly downloads
- Slower than nodegit but sufficient for typical dev tools
- **Risk:** Large repos (1000+ files) need batching; index operations are single-threaded

---

## 2. Diff Rendering Libraries

### Performance Tiers
| Lib | Size | Speed | Large Files | Syntax Highlight |
|-----|------|-------|-------------|------------------|
| **diff2html** | Small | ~300ms | <2MB | Yes (highlight.js) |
| **react-diff-viewer** | Small | ~300ms | <2MB | Yes |
| **Monaco Editor** | Large | ~50ms | 10MB+ | Native |

### Recommendation: **Dual Approach**
- **Default:** diff2html (254k weekly downloads, mature, lightweight)
  - Hunk/inline/split views built-in
  - Syntax highlighting via highlight.js
  - ~3.2k GitHub stars, battle-tested
- **For large files:** Monaco Editor diff plugin
  - Can handle ~10MB JSON bodies without crashes
  - Better for binary/complex diffs
  - Heavier bundle but worth it for scale

---

## 3. Line-by-Line Staging Implementation

### How Git Handles It
Git patch mode (`git add -p`) walks through hunks (code blocks), user selects which hunks to stage. For granular control, edit the hunk with `e` flag.

### Web UI Implementation Strategy
1. **Parse diff into hunks** using diff2html or jsdiff
2. **Click handlers on each line** to toggle staged state
3. **Track partially-staged hunks** (line-level selections within a hunk)
4. **Apply staging via `git.apply`** with custom patch content
   - Build a patch blob with only selected lines
   - Use isomorphic-git's index manipulation to stage
5. **UI patterns from competitors:**
   - Tower: Click-drag to select lines
   - VSCode: Checkbox per line
   - Lazygit: `j/k` navigate, `space` toggle, smart hunk boundary detection

### Implementation Complexity: Medium
- Requires custom patch building (not trivial)
- Must track line→hunk→file relationships
- Performance: acceptable for <100KB diffs; consider virtual scrolling >500KB

---

## 4. Commit Workflow UI Patterns

### VSCode Pattern (Recommended for simplicity)
- Source Control panel: files list → diff panel → commit message box
- Stage/unstage toggles per file
- Commit button triggers `git.commit()`
- Linear, low cognitive load

### GitKraken Pattern (Advanced)
- Hunk view (default), toggle to inline/split view
- Full staging granularity (hunk + line level)
- Interactive rebase visualization
- More complex but powerful

### Lazygit Pattern (Terminal-focused)
- Vim keybindings (hjkl, q to quit)
- Diff anchoring (mark commit A, diff against B)
- Quick stage/unstage with keybinds

### For Dev Tools App: **Adopt VSCode pattern + GitKraken granularity**
- Simple entry-level workflow (file-level staging)
- Advanced path: toggle to hunk-level via UI toggle
- Skip line-level initially; add in phase 2 if needed

---

## 5. Performance Considerations

### Bottlenecks
- **Diff generation:** O(file size); cache parsed diffs
- **Index updates:** Single-threaded in isomorphic-git; batch operations
- **Rendering:** Virtual scrolling essential for >1000-line diffs

### Windows/Electron Specifics
- isomorphic-git works well in Electron (fs module available)
- File system watchers needed for detecting external changes
- No native git binary required (no PATH dependency)

### Optimization Checklist
- [ ] Cache diffs for unchanged files
- [ ] Virtual scroll in diff viewer (react-window)
- [ ] Batch `git.add()` calls for multiple files
- [ ] Use shallow clones for monorepos
- [ ] Debounce file watchers

---

## Unresolved Questions
1. Should line-level staging use `git apply` or custom index manipulation? (Need implementation spike)
2. How to handle merge conflicts in staging UI?
3. Does isomorphic-git support `git stash`? (Assumed yes, verify)
4. Branch switching: use `git.checkout()` or separate feature phase?
5. Performance threshold for switching to Monaco (exact file size test needed)

---

## Recommended Tech Stack
```
Git Ops:     isomorphic-git (v1.11+)
Diff UI:     diff2html (primary) + Monaco Editor (fallback for large files)
Staging:     Hunk-level initially; line-level in phase 2 via custom patch
Framework:   React + Electron (or web app)
State:       Track staged/unstaged/modified file maps
```

## Next Steps
1. Implement isomorphic-git wrapper (add, commit, getStatus, diff)
2. Build diff2html integration with caching layer
3. Create mock staging state management
4. Proof-of-concept: file-level staging UI (VSCode pattern)
5. Performance test with 50MB+ test repo
