import { useRef, useEffect, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor, Uri } from "monaco-editor";
import { useEditorStore } from "@/stores/editor-store";
import { useSettingsStore } from "@/stores/settings-store";
import { CATPPUCCIN_MOCHA_THEME } from "@/utils/monaco-catppuccin-theme";

interface EditorPaneProps {
  projectPath: string;
}

type MonacoInstance = typeof import("monaco-editor");

export function EditorPane({ projectPath }: EditorPaneProps) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);
  const modelsRef = useRef<Map<string, monacoEditor.ITextModel>>(new Map());
  const viewStatesRef = useRef<Map<string, monacoEditor.ICodeEditorViewState | null>>(new Map());
  const prevFileRef = useRef<string | null>(null);
  const disposablesRef = useRef<Map<string, { dispose: () => void }>>(new Map());
  // Ref for original content to avoid stale closures in Monaco event handlers
  const originalContentRef = useRef<Map<string, string>>(new Map());

  const { openFiles, activeFilePath } = useEditorStore((s) => s.getState(projectPath));
  const setDirty = useEditorStore((s) => s.setDirty);
  const saveFile = useEditorStore((s) => s.saveFile);
  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const editorSettings = useSettingsStore((s) => s.editor);

  // Keep original content ref in sync with store
  useEffect(() => {
    for (const file of openFiles) {
      originalContentRef.current.set(file.filePath, file.content);
    }
  }, [openFiles]);

  /** Save the currently active file from Monaco model */
  const saveActiveFile = useCallback(() => {
    const editor = editorRef.current;
    const activePath = useEditorStore.getState().getState(projectPath).activeFilePath;
    if (!editor || !activePath) return;
    const model = editor.getModel();
    if (model) {
      saveFile(projectPath, activePath, model.getValue());
    }
  }, [projectPath, saveFile]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register Catppuccin theme
      monaco.editor.defineTheme("catppuccin-mocha", CATPPUCCIN_MOCHA_THEME);
      monaco.editor.setTheme("catppuccin-mocha");

      // Track cursor position
      editor.onDidChangeCursorPosition((e) => {
        setCursorPosition(projectPath, e.position.lineNumber, e.position.column);
      });

      // Register Ctrl+S once (uses saveActiveFile ref so no stale closure)
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveActiveFile();
      });
    },
    [projectPath, setCursorPosition, saveActiveFile],
  );

  /** Get or create a Monaco model for a file */
  const getOrCreateModel = useCallback(
    (filePath: string, content: string, language: string) => {
      const monaco = monacoRef.current;
      if (!monaco) return null;

      let model = modelsRef.current.get(filePath);
      if (model && !model.isDisposed()) return model;

      const uri = monaco.Uri.file(filePath);

      model = monaco.editor.getModel(uri as Uri) ?? undefined;
      if (!model) {
        model = monaco.editor.createModel(content, language, uri as Uri);

        // Store original content in ref for dirty comparison (avoids stale closure)
        originalContentRef.current.set(filePath, content);

        // Track content changes for dirty state using ref (not closure over openFiles)
        const disposable = model.onDidChangeContent(() => {
          const currentContent = model!.getValue();
          const original = originalContentRef.current.get(filePath) ?? "";
          setDirty(projectPath, filePath, currentContent !== original);
        });
        disposablesRef.current.set(filePath, disposable);
      }

      modelsRef.current.set(filePath, model);
      return model;
    },
    [projectPath, setDirty],
  );

  // Switch model when active file changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFilePath) return;

    const activeFile = openFiles.find((f) => f.filePath === activeFilePath);
    if (!activeFile) return;

    // Save view state for previous file
    const prevFile = prevFileRef.current;
    if (prevFile && prevFile !== activeFilePath) {
      viewStatesRef.current.set(prevFile, editor.saveViewState());
    }

    const model = getOrCreateModel(activeFile.filePath, activeFile.content, activeFile.language);
    if (!model) return;

    editor.setModel(model);
    const savedViewState = viewStatesRef.current.get(activeFilePath);
    if (savedViewState) {
      editor.restoreViewState(savedViewState);
    }

    editor.focus();
    prevFileRef.current = activeFilePath;
  }, [activeFilePath, openFiles, getOrCreateModel]);

  // Dispose models when files are closed
  useEffect(() => {
    const openPaths = new Set(openFiles.map((f) => f.filePath));

    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        disposablesRef.current.get(path)?.dispose();
        disposablesRef.current.delete(path);
        viewStatesRef.current.delete(path);
        originalContentRef.current.delete(path);
        if (!model.isDisposed()) model.dispose();
        modelsRef.current.delete(path);
      }
    }
  }, [openFiles]);

  // Listen for save events from keyboard shortcuts
  useEffect(() => {
    const handleSave = () => saveActiveFile();
    window.addEventListener("devtools:save-active-file", handleSave);
    return () => window.removeEventListener("devtools:save-active-file", handleSave);
  }, [saveActiveFile]);

  // Sync Monaco buffer content to store (for markdown preview to read latest edits)
  useEffect(() => {
    const handleSync = () => {
      const editor = editorRef.current;
      const activePath = useEditorStore.getState().getState(projectPath).activeFilePath;
      if (!editor || !activePath) return;
      const model = editor.getModel();
      if (model) {
        useEditorStore.getState().updateContent(projectPath, activePath, model.getValue());
      }
    };
    window.addEventListener("devtools:sync-editor-content", handleSync);
    return () => window.removeEventListener("devtools:sync-editor-content", handleSync);
  }, [projectPath]);

  // Cleanup all models on unmount
  useEffect(() => {
    return () => {
      for (const [, disposable] of disposablesRef.current) disposable.dispose();
      for (const [, model] of modelsRef.current) {
        if (!model.isDisposed()) model.dispose();
      }
      modelsRef.current.clear();
      viewStatesRef.current.clear();
      disposablesRef.current.clear();
      originalContentRef.current.clear();
    };
  }, []);

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        defaultLanguage="plaintext"
        theme="catppuccin-mocha"
        onMount={handleEditorDidMount}
        options={{
          fontSize: editorSettings.fontSize,
          fontFamily: editorSettings.fontFamily || undefined,
          minimap: { enabled: editorSettings.minimap },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 },
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
          tabSize: editorSettings.tabSize,
          wordWrap: editorSettings.wordWrap ? "on" : "off",
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
}
