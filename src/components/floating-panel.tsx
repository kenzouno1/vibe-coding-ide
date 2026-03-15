import { useRef, useCallback, memo, type ReactNode } from "react";
import { GripHorizontal, X, Dock } from "lucide-react";

interface FloatingPanelProps {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  title?: string;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onDock: () => void;
  onClose: () => void;
  children: ReactNode;
}

export const FloatingPanel = memo(function FloatingPanel({
  x,
  y,
  width,
  height,
  minWidth = 320,
  minHeight = 240,
  title = "Browser",
  onMove,
  onResize,
  onDock,
  onClose,
  children,
}: FloatingPanelProps) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Drag handler for title bar
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        const newX = Math.max(0, dragRef.current.origX + dx);
        const newY = Math.max(0, dragRef.current.origY + dy);
        onMove(newX, newY);
      };
      const handleUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [x, y, onMove],
  );

  // Resize handler for bottom-right corner
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: width, origH: height };

      const handleMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dw = ev.clientX - resizeRef.current.startX;
        const dh = ev.clientY - resizeRef.current.startY;
        const newW = Math.max(minWidth, resizeRef.current.origW + dw);
        const newH = Math.max(minHeight, resizeRef.current.origH + dh);
        onResize(newW, newH);
      };
      const handleUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width, height, minWidth, minHeight, onResize],
  );

  return (
    <div
      className="fixed z-[10] bg-ctp-base border border-ctp-surface0 rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{ left: x, top: y, width, height }}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-ctp-mantle border-b border-ctp-surface0 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <GripHorizontal size={12} className="text-ctp-overlay0" />
        <span className="text-xs text-ctp-overlay1 flex-1 truncate">{title}</span>
        <button
          onClick={onDock}
          title="Dock to view"
          className="p-0.5 rounded hover:bg-ctp-surface0 text-ctp-overlay0 hover:text-ctp-text"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Dock size={12} />
        </button>
        <button
          onClick={onClose}
          title="Close"
          className="p-0.5 rounded hover:bg-ctp-surface0 text-ctp-overlay0 hover:text-ctp-red"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Resize handle — bottom-right corner */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={handleResizeStart}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="text-ctp-overlay0">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" opacity="0.3" />
        </svg>
      </div>
    </div>
  );
});
