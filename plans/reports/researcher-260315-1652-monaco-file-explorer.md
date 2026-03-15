# Monaco Editor + File Explorer Integration Research
**Date:** 2026-03-15 | **Time:** 16:52
**Status:** Complete | **Scope:** Tauri 2 + React 19 Desktop Devtools

---

## Executive Summary

Integration of Monaco Editor and File Explorer tree into your Tauri 2 + React 19 devtools is viable and well-supported. Key findings:
- Use `@monaco-editor/react@next` (v4.7.0-rc.0) for React 19 compatibility
- Multi-tab pattern uses single editor instance + Monaco models switchable via `editorInstance.setModel()`
- Tauri `@tauri-apps/plugin-fs` provides complete file CRUD via commands
- File explorer requires recursive React component (no single library fits all use cases)
- Dirty state tracking uses `onDidChangeContent` event + custom flag management

---

## 1. Monaco Editor + React 19 Integration

### Version & Compatibility
- **Current:** `@monaco-editor/react` stable (v4.6.x) does NOT guarantee React 19 support
- **Recommended:** Install pre-release version:
  ```bash
  npm install @monaco-editor/react@next
  # or
  npm install @monaco-editor/react@4.7.0-rc.0
  ```
- **Status:** RC version actively tested by community; production use possible but monitor for issues
- **Reference:** [npm @monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react)

### Basic Setup Pattern
```tsx
import Editor from '@monaco-editor/react';

// Single editor instance for all files
<Editor
  height="100%"
  defaultLanguage="typescript"
  theme="vs-dark"
  options={{
    minimap: { enabled: false },
    wordWrap: 'on',
  }}
  onMount={(editor) => {
    // Store editor ref for model switching
    editorRef.current = editor;
  }}
/>
```

### Worker Loading (Critical for Tauri)
Problem: Monaco uses Web Workers to syntax highlight. In Tauri's `tauri://` protocol context, workers may fail to load.

**Solution 1 - Bundle Monaco (Recommended):**
```tsx
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

loader.config({ monaco });
```

**Solution 2 - Custom Worker Path:**
```tsx
loader.config({
  paths: { vs: 'app-asset://zui/node_modules/monaco-editor/min/vs' }
});
```

**Practical approach for Tauri:** Copy Monaco files to Tauri resources during build, configure asset serving via `tauri.conf.json`.

---

## 2. Multi-Tab Editor Pattern (Core Architecture)

### Model-Based Switching (Recommended)
Create one editor instance + multiple models (one per file):

```tsx
import * as monaco from 'monaco-editor';

// Store models in a Map
const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map());

// Switch tabs
function switchTab(filePath: string) {
  let model = modelsRef.current.get(filePath);
  if (!model) {
    // Create new model for this file
    model = monaco.editor.createModel(
      fileContent,
      detectLanguage(filePath),
      monaco.Uri.parse(`file://${filePath}`)
    );
    modelsRef.current.set(filePath, model);
  }

  // Apply to editor
  editorRef.current?.setModel(model);

  // Restore previous cursor/scroll position
  if (viewStateRef.current[filePath]) {
    editorRef.current?.restoreViewState(viewStateRef.current[filePath]);
  }
}

// Save view state before switching
function saveViewState(filePath: string) {
  const state = editorRef.current?.saveViewState();
  if (state) viewStateRef.current[filePath] = state;
}
```

### Tab State Management (with Zustand)
```tsx
// stores/editor-store.ts
export const useEditorStore = create((set) => ({
  openFiles: new Map(), // filepath -> { content, isDirty, language }
  activeFilePath: null,

  openFile: (path, content) => set((state) => ({
    openFiles: new Map([...state.openFiles, [path, { content, isDirty: false }]])
  })),

  closeFile: (path) => set((state) => {
    const next = new Map(state.openFiles);
    next.delete(path);
    return { openFiles: next };
  }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateContent: (path, content) => set((state) => ({
    openFiles: new Map(state.openFiles, [path, { ...state.openFiles.get(path), content }])
  })),

  markDirty: (path, isDirty) => set((state) => ({
    openFiles: new Map(state.openFiles, [path, { ...state.openFiles.get(path), isDirty }])
  })),
}));
```

### Key Properties to Know
- **`defaultValue`, `defaultLanguage`, `defaultPath`** — only used on model creation
- **`value`, `language`, `path`** — persist throughout editor lifetime; directly switch models instead of using `value` prop
- **Avoid `value` prop** — causes unnecessary re-renders; interact with Monaco API directly via `editorRef`

---

## 3. Dirty State Tracking (Unsaved Changes)

### Implementation Pattern
```tsx
function useEditorDirtyState(filePath: string) {
  const editorRef = useRef(null);
  const isDirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    // Listen for content changes
    const disposable = model.onDidChangeContent(() => {
      isDirtyRef.current = true;
      setIsDirty(true);
    });

    return () => disposable.dispose();
  }, [filePath, editorRef.current]);

  const markClean = () => {
    isDirtyRef.current = false;
    setIsDirty(false);
  };

  return { isDirty, markClean };
}
```

### Limitations & Workarounds
- **Problem:** No built-in tracking of undo/redo — if user changes code then undoes, still marked as dirty
- **Workaround:** Store original content hash on file open; compare current model content hash on save attempt
  ```tsx
  const originalHashRef = useRef(hashFunction(fileContent));

  const isDirty = () => {
    const currentContent = editorRef.current?.getModel()?.getValue();
    return hashFunction(currentContent) !== originalHashRef.current;
  };
  ```

### Tab UI Indicators
```tsx
// In tab bar
<span className={isDirty ? 'font-bold after:content-["*"]' : ''}>
  {fileName}
</span>
```

---

## 4. File Explorer Tree View (React Pattern)

### Recommended Approach
Use **recursive component** pattern (no external lib needed for simple use case):

```tsx
// types/file-tree.ts
export interface FileNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: FileNode[];
}

// components/file-tree-item.tsx
interface FileTreeItemProps {
  node: FileNode;
  onFileSelect: (path: string) => void;
  expanded?: Record<string, boolean>;
  onToggleExpanded: (path: string) => void;
}

export function FileTreeItem({
  node,
  onFileSelect,
  expanded,
  onToggleExpanded,
}: FileTreeItemProps) {
  const isExpanded = expanded?.[node.path] ?? false;

  return (
    <div>
      <div
        onClick={() => {
          if (node.isDirectory) {
            onToggleExpanded(node.path);
          } else {
            onFileSelect(node.path);
          }
        }}
        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-ctp-surface0"
      >
        {node.isDirectory && (
          <ChevronRight
            size={16}
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        )}
        <FileIcon isDirectory={node.isDirectory} name={node.name} />
        <span className="text-xs">{node.name}</span>
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div style={{ paddingLeft: '16px' }}>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              onFileSelect={onFileSelect}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// components/file-explorer.tsx
export function FileExplorer({ rootPath }: { rootPath: string }) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadDirectoryTree(rootPath).then(setTree);
  }, [rootPath]);

  return (
    <div className="h-full overflow-y-auto bg-ctp-mantle p-2">
      {tree && (
        <FileTreeItem
          node={tree}
          onFileSelect={(path) => {
            // Dispatch to editor store to open file
            useEditorStore.setState({ activeFilePath: path });
          }}
          expanded={expanded}
          onToggleExpanded={(path) => {
            setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
          }}
        />
      )}
    </div>
  );
}
```

### Alternative: Use Pre-Built Library
If complex features needed (drag-drop, context menus, icons):
- **MUI TreeView** — [Tree View component](https://v6.mui.com/x/react-tree-view/) (integrates with MUI ecosystem)
- **react-fs-treeview** — npm package for filesystem trees with lazy loading
- **Magic UI** — [File Tree component](https://magicui.design/docs/components/file-tree)

### Load Directory Tree from Tauri
```tsx
// utils/file-system.ts
export async function loadDirectoryTree(dirPath: string): Promise<FileNode> {
  const entries = await invoke('read_directory', { path: dirPath });

  return {
    path: dirPath,
    name: dirPath.split('/').pop() || dirPath,
    isDirectory: true,
    children: entries
      .sort((a, b) => (b.isDirectory ? 1 : -1)) // Dirs first
      .map((entry) => ({
        path: entry.path,
        name: entry.name,
        isDirectory: entry.isDirectory,
        children: entry.isDirectory ? undefined : undefined,
      })),
  };
}
```

---

## 5. File CRUD via Tauri Commands

### Installation
```bash
npm install @tauri-apps/plugin-fs
# In Cargo.toml: tauri-plugin-fs = "2.0.0"
```

### Core TypeScript API

#### Read File
```tsx
import { readTextFile } from '@tauri-apps/plugin-fs';

const content = await readTextFile('/path/to/file.txt');
```

#### Write File
```tsx
import { writeTextFile, create } from '@tauri-apps/plugin-fs';

// Simple write (creates or overwrites)
await writeTextFile('/path/to/file.txt', 'Hello world');

// Advanced: open handle, seek, append
const file = await create('/path/to/file.txt');
await file.write(new TextEncoder().encode('Hello'));
await file.close();
```

#### Create Directory
```tsx
import { mkdir } from '@tauri-apps/plugin-fs';

await mkdir('/path/to/new/dir', { recursive: true });
```

#### List Directory
```tsx
import { readDir } from '@tauri-apps/plugin-fs';

const entries = await readDir('/path/to/dir');
// Returns: { name, path, isDirectory, isSymlink }[]
```

#### Rename/Move
```tsx
import { rename } from '@tauri-apps/plugin-fs';

await rename('/old/path', '/new/path');
```

#### Delete
```tsx
import { remove } from '@tauri-apps/plugin-fs';

await remove('/path/to/file');
// For directories: await remove('/path', { recursive: true });
```

#### Check File Metadata
```tsx
import { stat } from '@tauri-apps/plugin-fs';

const metadata = await stat('/path/to/file');
// { isDirectory, isFile, isSymlink, isReadonly, size, modified, created, accessed }
```

### File Handle API (for streaming)
```tsx
import { open, create } from '@tauri-apps/plugin-fs';

const file = await open('/path/to/large-file.bin', { read: true });
const buffer = new Uint8Array(1024);
await file.read(buffer); // Read up to 1024 bytes
await file.seek(100); // Seek to byte 100
await file.close();
```

### Base Directory Support
All APIs support `baseDir` to scope operations:
```tsx
import { writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

await writeTextFile(
  'relative/path.txt',
  'content',
  { baseDir: BaseDirectory.AppData }
);
```

### Security & Permissions
File operations require capabilities in `src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-read-dir",
    "fs:allow-create",
    "fs:allow-remove",
    "fs:allow-rename"
  ]
}
```

---

## 6. Editor ↔ Terminal Integration Pattern

### Problem
Terminal emulator (xterm.js) output shows file paths; need clickable links to open files in editor.

### Solution Architecture
```tsx
// 1. Hook xterm output for file paths
const terminalRef = useRef<Terminal>();

useEffect(() => {
  const terminal = terminalRef.current;
  if (!terminal) return;

  // Parse output for file:line patterns
  terminal.registerLinkMatcher(
    /(\S+\.tsx?):(\d+):(\d+)?/g,
    (event, match) => {
      const filePath = match[1];
      const lineNumber = parseInt(match[2], 10);

      // Dispatch to editor
      openFileInEditor(filePath, lineNumber);
    }
  );
}, []);

// 2. Open file + jump to line
async function openFileInEditor(filePath: string, lineNumber?: number) {
  const content = await readTextFile(filePath);

  // Add to editor store
  useEditorStore.setState((state) => ({
    openFiles: new Map(state.openFiles, [filePath, { content, isDirty: false }]),
    activeFilePath: filePath,
  }));

  // Jump to line in editor
  if (lineNumber && editorRef.current) {
    editorRef.current.revealLineInCenter(lineNumber);
    editorRef.current.setPosition({ lineNumber, column: 1 });
  }
}
```

### xterm.js Link Detection
```tsx
import { Terminal } from '@xterm/xterm';
import { WebLinksAddon } from '@xterm/addon-web-links';

const webLinksAddon = new WebLinksAddon(
  (event, uri) => {
    // Intercept clicks on detected URIs
    console.log('Clicked URI:', uri);

    // Handle file:// URLs
    if (uri.startsWith('file://')) {
      const filePath = uri.replace('file://', '');
      openFileInEditor(filePath);
    }
  }
);

terminal.loadAddon(webLinksAddon);
```

---

## 7. Architecture Summary for Implementation

### Directory Structure (Proposed)
```
src/
├── components/
│   ├── editor-pane.tsx           # Monaco editor wrapper
│   ├── file-explorer.tsx         # Tree view sidebar
│   ├── file-tree-item.tsx        # Recursive tree node
│   └── editor-tab-bar.tsx        # Open files tabs
├── stores/
│   ├── editor-store.ts           # Zustand: open files, active tab, dirty state
│   └── file-explorer-store.ts    # Zustand: tree expansion state
├── hooks/
│   ├── use-editor-dirty-state.ts
│   ├── use-monaco-model-cache.ts
│   └── use-file-system.ts        # Tauri file ops wrapper
├── utils/
│   ├── file-system.ts            # loadDirectoryTree, etc
│   └── syntax-highlighter.ts     # Language detection
└── types/
    └── file-tree.ts
```

### Data Flow
```
FileExplorer (sidebar)
  └─> onClick file
    └─> openFileInEditor()
      └─> EditorStore.openFile()
        └─> EditorPane switches model
          └─> Monaco editor displays file

EditorPane
  └─> onChange content
    └─> EditorStore.markDirty()
    └─> Tab indicator updates

Save button
  └─> writeTextFile() via Tauri
  └─> EditorStore.markClean()
```

### Component Coupling
- **EditorPane:** Manages Monaco instance + models
- **FileExplorer:** Reads filesystem via Tauri, manages expand/collapse state
- **EditorStore:** Centralizes tab state (open files, active file, dirty flags)
- **FileExplorerStore:** Manages UI state (which folders expanded)

---

## 8. Code Snippets & Patterns

### Detect Language from Extension
```tsx
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    json: 'json',
    html: 'html',
    css: 'css',
  };
  return languageMap[ext] || 'plaintext';
}
```

### Save All Modified Files
```tsx
async function saveAllDirtyFiles() {
  const { openFiles } = useEditorStore.getState();

  for (const [filePath, fileData] of openFiles) {
    if (fileData.isDirty) {
      const content = editorRef.current?.getModel()?.getValue();
      if (content) {
        await writeTextFile(filePath, content);
        useEditorStore.getState().markClean(filePath);
      }
    }
  }
}
```

### Keyboard Shortcut: Save Current File
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();

      const { activeFilePath, openFiles } = useEditorStore.getState();
      if (!activeFilePath) return;

      const content = editorRef.current?.getModel()?.getValue();
      if (content) {
        writeTextFile(activeFilePath, content).then(() => {
          useEditorStore.getState().markClean(activeFilePath);
        });
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## 9. Known Limitations & Workarounds

| Issue | Impact | Workaround |
|-------|--------|-----------|
| Monaco Web Worker loading in Tauri `tauri://` protocol | Syntax highlighting breaks | Bundle Monaco files + configure worker path in loader config |
| React 19 stable support pending | Risk of version incompatibilities | Use `@next` tag (RC version); monitor releases |
| Dirty state doesn't track undo/redo accurately | False positives on save | Hash original content; compare on save |
| Large file loading (>10MB) | UI freeze/memory spike | Implement chunked reading + lazy loading |
| File system watching (hot reload) | Manual refresh needed | Use `fs::watch()` in Rust backend + emit events to frontend |

---

## 10. Reference Sources

- **Monaco Editor React:** [npm @monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react)
- **Monaco Editor GitHub:** [suren-atoyan/monaco-react](https://github.com/suren-atoyan/monaco-react)
- **Tauri File System Plugin:** [v2.tauri.app/reference/javascript/fs/](https://v2.tauri.app/reference/javascript/fs/)
- **Tauri File System Guide:** [v2.tauri.app/plugin/file-system/](https://v2.tauri.app/plugin/file-system/)
- **React File Explorer Pattern:** [Medium: Building Recursive Components](https://medium.com/@jaswanth_270602/building-a-recursive-component-in-react-folder-explorer-react-series-part-12-0e952893af7c)
- **MUI TreeView:** [v6.mui.com/x/react-tree-view/](https://v6.mui.com/x/react-tree-view/)
- **Montauri Editor (Reference):** [github.com/TimSusa/montauri-editor](https://github.com/TimSusa/montauri-editor)
- **Offline Monaco in Electron:** [jameskerr.blog/posts/offline-monaco-editor-in-electron/](https://www.jameskerr.blog/posts/offline-monaco-editor-in-electron/)

---

## Unresolved Questions

1. **Large File Performance:** No testing done on handling files >10MB. Need benchmark before implementation.
2. **xterm.js Link Pattern Matching:** Need to define exact regex for file:line:col pattern to avoid false positives.
3. **Monaco Autocomplete/IntelliSense:** Research needed on enabling TypeScript IntelliSense (requires language server integration).
4. **File Watcher Backend:** Rust implementation for filesystem watching + event emitting to frontend not yet designed.
5. **Project-Scoped File Browser:** Should file explorer be limited to project root or allow arbitrary paths? Security implications.

---

**Report ready for handoff to planner agent.**
