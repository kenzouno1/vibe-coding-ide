import { create } from "zustand";

export type SplitDirection = "horizontal" | "vertical";
export type PaneType = "terminal" | "claude";

/** Leaf node = a single terminal pane or claude chat pane */
interface LeafNode {
  type: "leaf";
  id: string;
  paneType: PaneType;
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
  /** Map pane IDs to PTY session IDs (set when PTY spawns) */
  ptySessionIds: Record<string, string>;
  /** Track which PTY sessions are running AI CLIs (claude, codex, etc.) */
  aiSessionIds: Set<string>;

  getTree: (projectPath: string) => PaneNode;
  getActiveId: (projectPath: string) => string;
  setActive: (projectPath: string, paneId: string) => void;
  split: (projectPath: string, targetId: string, direction: SplitDirection, paneType?: PaneType) => void;
  /** Get the pane type for a leaf node */
  getPaneType: (projectPath: string, leafId: string) => PaneType;
  closePane: (projectPath: string, targetId: string) => void;
  setRatio: (projectPath: string, splitId: string, ratio: number) => void;
  /** Toggle split direction (H↔V) of the parent split containing a leaf */
  toggleDirection: (projectPath: string, leafId: string) => void;
  setPtySessionId: (paneId: string, sessionId: string) => void;
  markAiSession: (sessionId: string) => void;
  unmarkAiSession: (sessionId: string) => void;
  getActivePtySessionId: (projectPath: string) => string | null;
  /** Find PTY session running AI CLI (claude/codex) for this project */
  getAiPtySessionId: (projectPath: string) => string | null;
  removeProject: (projectPath: string) => void;
  /** Initialize a single-leaf tree (used by SSH connections) */
  initSingleLeaf: (projectPath: string) => string;
}

let nextId = 1;
function genId() {
  return `pane-${nextId++}`;
}

/** Create default tree: 1 terminal + 1 AI agent side by side */
function createDefaultTree(): { tree: PaneNode; activeId: string } {
  const terminalId = genId();
  const claudeId = genId();
  const splitId = genId();
  return {
    tree: {
      type: "split",
      id: splitId,
      direction: "horizontal",
      ratio: 0.5,
      first: { type: "leaf", id: terminalId, paneType: "terminal" },
      second: { type: "leaf", id: claudeId, paneType: "claude" },
    },
    activeId: terminalId,
  };
}

/** Find a leaf node's pane type by walking the tree */
function findPaneType(node: PaneNode, leafId: string): PaneType | null {
  if (node.type === "leaf") return node.id === leafId ? node.paneType ?? "terminal" : null;
  return findPaneType(node.first, leafId) ?? findPaneType(node.second, leafId);
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

/** Pick split direction based on pane dimensions: wider → horizontal, taller → vertical */
export function autoDirection(width: number, height: number): SplitDirection {
  return width >= height ? "horizontal" : "vertical";
}

/** Find the ID of the parent SplitNode that directly contains a given leaf */
function findParentSplit(node: PaneNode, leafId: string, parentId: string | null = null): string | null {
  if (node.type === "leaf") return node.id === leafId ? parentId : null;
  return (
    findParentSplit(node.first, leafId, node.id) ??
    findParentSplit(node.second, leafId, node.id)
  );
}

/** Collect all leaf IDs */
export function collectLeafIds(node: PaneNode): string[] {
  if (node.type === "leaf") return [node.id];
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)];
}

export const usePaneStore = create<PaneStore>((set, get) => ({
  trees: {},
  activeIds: {},
  ptySessionIds: {},
  aiSessionIds: new Set(),

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

  getPaneType: (projectPath, leafId) => {
    const { trees } = get();
    const tree = trees[projectPath];
    if (!tree) return "terminal";
    return findPaneType(tree, leafId) ?? "terminal";
  },

  split: (projectPath, targetId, direction, paneType = "terminal") =>
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
        second: { type: "leaf", id: newId, paneType },
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

  toggleDirection: (projectPath, leafId) =>
    set((s) => {
      const tree = s.trees[projectPath];
      if (!tree) return s;
      const parentId = findParentSplit(tree, leafId);
      if (!parentId) return s;
      const newRoot = replaceNode(tree, parentId, (node) => {
        if (node.type === "split") {
          return { ...node, direction: node.direction === "horizontal" ? "vertical" : "horizontal" };
        }
        return node;
      });
      return { trees: { ...s.trees, [projectPath]: newRoot || tree } };
    }),

  setPtySessionId: (paneId, sessionId) =>
    set((s) => ({
      ptySessionIds: { ...s.ptySessionIds, [paneId]: sessionId },
    })),

  markAiSession: (sessionId) =>
    set((s) => {
      const next = new Set(s.aiSessionIds);
      next.add(sessionId);
      return { aiSessionIds: next };
    }),

  unmarkAiSession: (sessionId) =>
    set((s) => {
      const next = new Set(s.aiSessionIds);
      next.delete(sessionId);
      return { aiSessionIds: next };
    }),

  getActivePtySessionId: (projectPath) => {
    const { activeIds, ptySessionIds } = get();
    const activePaneId = activeIds[projectPath];
    if (!activePaneId) return null;
    return ptySessionIds[activePaneId] ?? null;
  },

  getAiPtySessionId: (projectPath) => {
    const { trees, ptySessionIds, aiSessionIds } = get();
    const tree = trees[projectPath];
    if (!tree) return null;
    // Find first leaf whose PTY session is marked as AI
    const leafIds = collectLeafIds(tree);
    for (const paneId of leafIds) {
      const sessionId = ptySessionIds[paneId];
      if (sessionId && aiSessionIds.has(sessionId)) {
        return sessionId;
      }
    }
    return null;
  },

  removeProject: (projectPath) =>
    set((s) => {
      const { [projectPath]: _tree, ...restTrees } = s.trees;
      const { [projectPath]: _active, ...restActiveIds } = s.activeIds;
      return { trees: restTrees, activeIds: restActiveIds };
    }),

  initSingleLeaf: (projectPath) => {
    const leafId = genId();
    const tree: PaneNode = { type: "leaf", id: leafId, paneType: "terminal" };
    set((s) => ({
      trees: { ...s.trees, [projectPath]: tree },
      activeIds: { ...s.activeIds, [projectPath]: leafId },
    }));
    return leafId;
  },
}));
