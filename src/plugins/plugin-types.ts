import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";

export interface PluginShortcut {
  /** Key value (e.g. "4" for Ctrl+4) */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  /** Display label for status bar hints */
  label: string;
  action: () => void;
}

export interface PluginDescriptor {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** View ID used in AppStore — must be unique across all plugins */
  viewId: string;
  /** Lazy-loaded view component rendered when plugin view is active */
  ViewComponent: LazyExoticComponent<ComponentType>;
  /** Keyboard shortcuts registered when plugin is enabled */
  shortcuts?: PluginShortcut[];
  /** Sidebar position — lower number = higher in list (default: 99) */
  sidebarOrder?: number;
}
