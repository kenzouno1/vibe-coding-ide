import { memo } from "react";
import {
  Pencil, Highlighter, Square, Circle, ArrowRight,
  Type, MousePointer, Undo2, Redo2, X, Save, Copy,
} from "lucide-react";
import { useBrowserStore, type AnnotationTool } from "@/stores/browser-store";

const TOOLS: { tool: AnnotationTool; icon: typeof Pencil; label: string }[] = [
  { tool: "select", icon: MousePointer, label: "Select" },
  { tool: "pen", icon: Pencil, label: "Pen" },
  { tool: "highlighter", icon: Highlighter, label: "Highlighter" },
  { tool: "rect", icon: Square, label: "Rectangle" },
  { tool: "circle", icon: Circle, label: "Circle" },
  { tool: "arrow", icon: ArrowRight, label: "Arrow" },
  { tool: "text", icon: Type, label: "Text" },
];

const COLORS = [
  "#f38ba8", "#fab387", "#f9e2af", "#a6e3a1",
  "#89b4fa", "#cba6f7", "#cdd6f4", "#1e1e2e",
];

const STROKE_WIDTHS = [2, 4, 8];

interface AnnotationToolbarProps {
  paneId: string;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onCopy: () => void;
  onClose: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const AnnotationToolbar = memo(function AnnotationToolbar({
  paneId,
  onUndo,
  onRedo,
  onSave,
  onCopy,
  onClose,
  canUndo,
  canRedo,
}: AnnotationToolbarProps) {
  const browserState = useBrowserStore((s) => s.getState(paneId));
  const setTool = useBrowserStore((s) => s.setAnnotationTool);
  const setColor = useBrowserStore((s) => s.setAnnotationColor);
  const setStrokeWidth = useBrowserStore((s) => s.setAnnotationStrokeWidth);

  const { annotationTool, annotationColor, annotationStrokeWidth } = browserState;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-ctp-mantle border-b border-ctp-surface0">
      {/* Drawing tools */}
      <div className="flex gap-0.5">
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            onClick={() => setTool(paneId, tool)}
            title={label}
            className={`p-1.5 rounded transition-colors ${
              annotationTool === tool
                ? "bg-ctp-mauve text-ctp-base"
                : "text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0"
            }`}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-ctp-surface0" />

      {/* Color palette */}
      <div className="flex gap-0.5">
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setColor(paneId, color)}
            title={color}
            className={`w-5 h-5 rounded-sm border transition-all ${
              annotationColor === color
                ? "border-ctp-mauve scale-110"
                : "border-ctp-surface1 hover:border-ctp-overlay0"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div className="w-px h-5 bg-ctp-surface0" />

      {/* Stroke width */}
      <div className="flex gap-0.5">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setStrokeWidth(paneId, w)}
            title={`${w}px`}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              annotationStrokeWidth === w
                ? "bg-ctp-surface1 text-ctp-text"
                : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"
            }`}
          >
            {w}px
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 disabled:opacity-30 transition-colors"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 disabled:opacity-30 transition-colors"
      >
        <Redo2 size={14} />
      </button>

      <div className="w-px h-5 bg-ctp-surface0" />

      {/* Actions */}
      <button
        onClick={onSave}
        title="Save screenshot"
        className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-green hover:bg-ctp-surface0 transition-colors"
      >
        <Save size={14} />
      </button>
      <button
        onClick={onCopy}
        title="Copy to clipboard"
        className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-blue hover:bg-ctp-surface0 transition-colors"
      >
        <Copy size={14} />
      </button>
      <button
        onClick={onClose}
        title="Close (Escape)"
        className="p-1.5 rounded text-ctp-overlay1 hover:text-ctp-red hover:bg-ctp-surface0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
});
