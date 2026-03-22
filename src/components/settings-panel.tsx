import { useSettingsStore } from "@/stores/settings-store";
import { usePluginStore } from "@/stores/plugin-store";
import { getPlugins } from "@/plugins/plugin-registry";
import { SettingsSection, SelectField, NumberField, ToggleField } from "@/components/settings-section";
import { RotateCcw } from "lucide-react";

const FONT_OPTIONS = [
  { value: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace", label: "Cascadia Code" },
  { value: "'Fira Code', monospace", label: "Fira Code" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'Cascadia Mono', monospace", label: "Cascadia Mono" },
  { value: "'Source Code Pro', monospace", label: "Source Code Pro" },
  { value: "Consolas, monospace", label: "Consolas" },
];

const CURSOR_STYLE_OPTIONS = [
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
  { value: "bar", label: "Bar" },
];

const TAB_SIZE_OPTIONS = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
];

const PANE_LAYOUT_OPTIONS = [
  { value: "terminal-only", label: "Terminal only" },
  { value: "terminal-claude", label: "Terminal + Claude" },
  { value: "terminal-browser", label: "Terminal + Browser" },
];

const SPLIT_DIR_OPTIONS = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
];

export function SettingsPanel() {
  const terminal = useSettingsStore((s) => s.terminal);
  const editor = useSettingsStore((s) => s.editor);
  const layout = useSettingsStore((s) => s.layout);
  const browser = useSettingsStore((s) => s.browser);
  const setTerminal = useSettingsStore((s) => s.setTerminal);
  const setEditor = useSettingsStore((s) => s.setEditor);
  const setLayout = useSettingsStore((s) => s.setLayout);
  const setBrowser = useSettingsStore((s) => s.setBrowser);
  const reset = useSettingsStore((s) => s.reset);
  const enabledIds = usePluginStore((s) => s.enabledIds);
  const togglePlugin = usePluginStore((s) => s.toggle);
  const plugins = getPlugins();

  return (
    <div className="h-full overflow-y-auto bg-ctp-base">
      <div className="max-w-xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ctp-text">Settings</h2>
          <button
            onClick={reset}
            title="Reset to Defaults"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-subtext1 hover:text-ctp-text transition-colors"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </div>

        {/* Terminal */}
        <SettingsSection title="Terminal">
          <SelectField
            label="Font Family"
            value={terminal.fontFamily}
            options={FONT_OPTIONS}
            onChange={(v) => setTerminal({ fontFamily: v })}
          />
          <NumberField
            label="Font Size"
            value={terminal.fontSize}
            min={10}
            max={24}
            onChange={(v) => setTerminal({ fontSize: v })}
          />
          <ToggleField
            label="Cursor Blink"
            checked={terminal.cursorBlink}
            onChange={(v) => setTerminal({ cursorBlink: v })}
          />
          <SelectField
            label="Cursor Style"
            value={terminal.cursorStyle}
            options={CURSOR_STYLE_OPTIONS}
            onChange={(v) => setTerminal({ cursorStyle: v as "block" | "underline" | "bar" })}
          />
          <NumberField
            label="Scrollback Lines"
            value={terminal.scrollback}
            min={100}
            max={10000}
            step={100}
            onChange={(v) => setTerminal({ scrollback: v })}
          />
        </SettingsSection>

        {/* Editor */}
        <SettingsSection title="Editor">
          <NumberField
            label="Font Size"
            value={editor.fontSize}
            min={10}
            max={24}
            onChange={(v) => setEditor({ fontSize: v })}
          />
          <SelectField
            label="Font Family"
            value={editor.fontFamily}
            options={[{ value: "", label: "Default (Monaco)" }, ...FONT_OPTIONS]}
            onChange={(v) => setEditor({ fontFamily: v })}
          />
          <SelectField
            label="Tab Size"
            value={String(editor.tabSize)}
            options={TAB_SIZE_OPTIONS}
            onChange={(v) => setEditor({ tabSize: Number(v) })}
          />
          <ToggleField
            label="Word Wrap"
            checked={editor.wordWrap}
            onChange={(v) => setEditor({ wordWrap: v })}
          />
          <ToggleField
            label="Minimap"
            checked={editor.minimap}
            onChange={(v) => setEditor({ minimap: v })}
          />
        </SettingsSection>

        {/* Layout */}
        <SettingsSection title="Layout">
          <SelectField
            label="Default Pane Layout"
            value={layout.defaultPaneLayout}
            options={PANE_LAYOUT_OPTIONS}
            onChange={(v) => setLayout({ defaultPaneLayout: v as "terminal-only" | "terminal-claude" | "terminal-browser" })}
          />
          <SelectField
            label="Default Split Direction"
            value={layout.defaultSplitDirection}
            options={SPLIT_DIR_OPTIONS}
            onChange={(v) => setLayout({ defaultSplitDirection: v as "horizontal" | "vertical" })}
          />
        </SettingsSection>

        {/* Browser */}
        <SettingsSection title="Browser">
          <ToggleField
            label="Auto-detect Server URLs"
            checked={browser.autoDetectServerUrls}
            onChange={(v) => setBrowser({ autoDetectServerUrls: v })}
          />
          <ToggleField
            label="Console Panel Open by Default"
            checked={browser.consolePanelOpen}
            onChange={(v) => setBrowser({ consolePanelOpen: v })}
          />
        </SettingsSection>

        {/* Plugins */}
        {plugins.length > 0 && (
          <SettingsSection title="Plugins">
            {plugins.map((plugin) => (
              <ToggleField
                key={plugin.id}
                label={plugin.name}
                description={plugin.description}
                checked={enabledIds.includes(plugin.id)}
                onChange={() => togglePlugin(plugin.id)}
              />
            ))}
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
