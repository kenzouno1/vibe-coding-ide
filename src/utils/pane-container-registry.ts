/**
 * Module-level registry of pane container DOM elements.
 * Used for on-demand dimension measurement (auto-split direction).
 */
const registry = new Map<string, HTMLDivElement>();

export function registerPaneContainer(id: string, el: HTMLDivElement) {
  registry.set(id, el);
}

export function unregisterPaneContainer(id: string) {
  registry.delete(id);
}

/** Get the bounding rect of a pane container, or null if not mounted */
export function getPaneRect(id: string): DOMRect | null {
  return registry.get(id)?.getBoundingClientRect() ?? null;
}
