# Phase 1: Refactor Stores for Multi-Project

## Priority: High | Status: ✅

## Overview
Restructure stores so each open project has isolated pane tree + git state. No more `window.location.reload()` on project switch.

## Key Insights
- Backend already supports multiple PTYs (keyed by session ID) and git ops take `cwd` param — no Rust changes needed
- Current `pane-store.ts` manages a single tree; needs to become per-project
- Current `git-store.ts` has single branch/files/diff state; needs per-project isolation
- `project-store.ts` currently does reload on switch — must remove that

## Related Code Files

### Modify
- `src/stores/project-store.ts` — add `openProjects[]`, `activeProjectId`, remove reload
- `src/stores/pane-store.ts` — store pane trees per project ID
- `src/stores/git-store.ts` — store git state per project ID
- `src/stores/app-store.ts` — no changes needed (view is global: terminal/git)

## Implementation Steps

### 1. Refactor `project-store.ts`
```ts
interface ProjectTab {
  path: string;        // full path
  displayName: string; // last folder segment
}

interface ProjectStore {
  projects: string[];       // all known projects (persisted)
  openTabs: ProjectTab[];   // currently open tabs
  activeTabPath: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  addProject: () => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
}
```
- `openTab`: adds to `openTabs` if not already open, sets as active
- `closeTab`: removes from `openTabs`, cleans up pane store + git store for that project
- `setActiveTab`: switches active without reload
- `addProject`: opens folder dialog, adds to `projects[]`, opens as tab
- On startup: restore last open tabs from localStorage

### 2. Refactor `pane-store.ts`
```ts
interface PaneStore {
  trees: Record<string, PaneNode>;  // projectPath → pane tree
  activeIds: Record<string, string>; // projectPath → active pane id

  getTree: (projectPath: string) => PaneNode;
  setActive: (projectPath: string, paneId: string) => void;
  split: (projectPath: string, targetId: string, direction: SplitDirection) => void;
  closePane: (projectPath: string, targetId: string) => void;
  setRatio: (projectPath: string, splitId: string, ratio: number) => void;
  removeProject: (projectPath: string) => void;
}
```
- `getTree`: returns existing tree or creates default single-leaf tree
- All operations now scoped by `projectPath`
- `removeProject`: deletes tree + activeId entry

### 3. Refactor `git-store.ts`
```ts
interface ProjectGitState {
  branch: string;
  files: GitFile[];
  selectedFile: string | null;
  diff: string;
  loading: boolean;
}

interface GitStore {
  states: Record<string, ProjectGitState>; // projectPath → git state
  getState: (projectPath: string) => ProjectGitState;
  refresh: (projectPath: string) => Promise<void>;
  stageFile: (projectPath: string, filePath: string) => Promise<void>;
  unstageFile: (projectPath: string, filePath: string) => Promise<void>;
  selectFile: (projectPath: string, filePath: string, staged: boolean) => Promise<void>;
  commit: (projectPath: string, message: string) => Promise<void>;
  removeProject: (projectPath: string) => void;
}
```
- All git operations now take `projectPath` as first param
- `removeProject`: clears state for closed tab

## Todo List
- [ ] Refactor `project-store.ts` with tab management
- [ ] Refactor `pane-store.ts` to per-project pane trees
- [ ] Refactor `git-store.ts` to per-project git state
- [ ] Update localStorage persistence for open tabs
- [ ] Remove `window.location.reload()` calls

## Success Criteria
- Can open multiple project tabs without page reload
- Each tab has isolated pane tree and git state
- Closing a tab cleans up its resources
- Open tabs persist across app restarts (localStorage)

## Risk Assessment
- **PTY lifecycle**: Closing a tab must kill all PTYs for that project's panes. Terminal components need cleanup via useEffect.
- **Memory**: Many open projects = many PTY processes. Acceptable for desktop app.
