import { useCallback, useRef } from "react";
import type { SplitDirection } from "@/stores/pane-store";

interface SplitHandleProps {
  direction: SplitDirection;
  onResize: (ratio: number) => void;
}

export function SplitHandle({ direction, onResize }: SplitHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const parent = handleRef.current?.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();

      const onMouseMove = (ev: MouseEvent) => {
        const ratio =
          direction === "horizontal"
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height;
        onResize(ratio);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, onResize],
  );

  return (
    <div
      ref={handleRef}
      onMouseDown={onMouseDown}
      className={`flex-shrink-0 bg-ctp-surface0 hover:bg-ctp-mauve transition-colors ${
        direction === "horizontal"
          ? "w-1 cursor-col-resize"
          : "h-1 cursor-row-resize"
      }`}
    />
  );
}
