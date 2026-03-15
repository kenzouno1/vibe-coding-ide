import { create } from "zustand";

export type SplitDirection = "horizontal" | "vertical";

/** Leaf node = a single terminal pane */
interface LeafNode {
  type: "leaf";
  id: string;
}

/** Split node = two children with a direction and ratio */
interface SplitNode {
  type: "split";
  id: string;
  direction: SplitDirection;
  ratio: number; // 0-1, size of first child
  first: PaneNode;
  second: PaneNode;
}

export type PaneNode = LeafNode | SplitNode;

interface PaneStore {
  /** Per-project pane trees */
  trees: Record<string, PaneNode>;
  /** Per-project active pane IDs */
  activeIds: Record<string, string>;

  getTree: (projectPath: string) => PaneNode;
  getActiveId: (projectPath: string) => string;
  setActive: (projectPath: string, paneId: string) => void;
  split: (projectPath: string, targetId: string, direction: SplitDirection) => void;
  closePane: (projectPath: string, targetId: string) => void;
  setRatio: (projectPath: string, splitId: string, ratio: number) => void;
  removeProject: (projectPath: string) => void;
}

let nextId = 1;
function genId() {
  return `pane-${nextId++}`;
}

/** Create a default single-leaf tree */
function createDefaultTree(): { tree: PaneNode; activeId: string } {
  const id = genId();
  return { tree: { type: "leaf", id }, activeId: id };
}

/** Find and replace a node in the tree */
function replaceNode(
  node: PaneNode,
  targetId: string,
  replacer: (n: PaneNode) => PaneNode | null,
): PaneNode | null {
  if (node.id === targetId) return replacer(node);
  if (node.type === "split") {
    const first = replaceNode(node.first, targetId, replacer);
    const second = replaceNode(node.second, targetId, replacer);
    if (first === null) return second;
    if (second === null) return first;
    return { ...node, first, second };
  }
  return node;
}

/** Collect all leaf IDs */
function collectLeafIds(node: PaneNode): string[] {
  if (node.type === "leaf") return [node.id];
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)];
}

export const usePaneStore = create<PaneStore>((set, get) => ({
  trees: {},
  activeIds: {},

  getTree: (projectPath) => {
    const { trees } = get();
    if (trees[projectPath]) return trees[projectPath];
    // Lazily create default tree
    const { tree, activeId } = createDefaultTree();
    set((s) => ({
      trees: { ...s.trees, [projectPath]: tree },
      activeIds: { ...s.activeIds, [projectPath]: activeId },
    }));
    return tree;
  },

  getActiveId: (projectPath) => {
    const { activeIds, getTree } = get();
    if (activeIds[projectPath]) return activeIds[projectPath];
    // Ensure tree exists (will also set activeId)
    getTree(projectPath);
    return get().activeIds[projectPath];
  },

  setActive: (projectPath, paneId) =>
    set((s) => ({
      activeIds: { ...s.activeIds, [projectPath]: paneId },
    })),

  split: (projectPath, targetId, direction) =>
    set((s) => {
      const tree = s.trees[projectPath];
      if (!tree) return s;
      const newId = genId();
      const splitId = genId();
      const newRoot = replaceNode(tree, targetId, (node) => ({
        type: "split",
        id: splitId,
        direction,
        ratio: 0.5,
        first: node,
        second: { type: "leaf", id: newId },
      }));
      return {
        trees: { ...s.trees, [projectPath]: newRoot || tree },
        activeIds: { ...s.activeIds, [projectPath]: newId },
      };
    }),

  closePane: (projectPath, targetId) =>
    set((s) => {
      const tree = s.trees[projectPath];
      if (!tree) return s;
      const leaves = collectLeafIds(tree);
      if (leaves.length <= 1) return s;

      const newRoot = replaceNode(tree, targetId, () => null);
      const newLeaves = newRoot ? collectLeafIds(newRoot) : [];
      const currentActive = s.activeIds[projectPath];
      const newActive = newLeaves.includes(currentActive)
        ? currentActive
        : newLeaves[0] || currentActive;

      return {
        trees: { ...s.trees, [projectPath]: newRoot || tree },
        activeIds: { ...s.activeIds, [projectPath]: newActive },
      };
    }),

  setRatio: (projectPath, splitId, ratio) =>
    set((s) => {
      const tree = s.trees[projectPath];
      if (!tree) return s;
      const clamped = Math.max(0.1, Math.min(0.9, ratio));
      const newRoot = replaceNode(tree, splitId, (node) => {
        if (node.type === "split") return { ...node, ratio: clamped };
        return node;
      });
      return {
        trees: { ...s.trees, [projectPath]: newRoot || tree },
      };
    }),

  removeProject: (projectPath) =>
    set((s) => {
      const { [projectPath]: _tree, ...restTrees } = s.trees;
      const { [projectPath]: _active, ...restActiveIds } = s.activeIds;
      return { trees: restTrees, activeIds: restActiveIds };
    }),
}));
