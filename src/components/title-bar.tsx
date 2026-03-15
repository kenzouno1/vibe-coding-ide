import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

const appWindow = getCurrentWindow();

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="h-8 flex items-center justify-between bg-ctp-crust px-3 select-none"
    >
      <span className="text-xs font-semibold text-ctp-subtext0 pointer-events-none">
        DevTools
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => appWindow.minimize()}
          className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="p-1.5 rounded hover:bg-ctp-surface0 text-ctp-overlay1"
        >
          <Square size={10} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="p-1.5 rounded hover:bg-ctp-red text-ctp-overlay1 hover:text-ctp-base"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
