import { invoke } from "@tauri-apps/api/core";

/** Slash command categories */
export type CommandCategory = "local" | "mapped" | "skill" | "global" | "project";

/** Slash command definition */
export interface SlashCommand {
  name: string;
  description: string;
  category: CommandCategory;
  /** Keyboard shortcut hint (optional) */
  shortcut?: string;
}

/** Built-in local commands — handled entirely in the frontend */
const LOCAL_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear conversation", category: "local", shortcut: "Ctrl+L" },
  { name: "new", description: "Start new session", category: "local" },
  { name: "cost", description: "Show session cost", category: "local" },
  { name: "help", description: "Show available commands", category: "local" },
];

/** Mapped commands — converted to CLI flags or special behavior */
const MAPPED_COMMANDS: SlashCommand[] = [
  { name: "model", description: "Switch model (e.g. /model sonnet)", category: "mapped" },
  { name: "compact", description: "Summarize and compact conversation", category: "mapped" },
  { name: "plan", description: "Read-only analysis mode", category: "mapped" },
  { name: "resume", description: "Resume previous session", category: "mapped" },
];

/** Static built-in commands (local + mapped) */
const STATIC_COMMANDS: SlashCommand[] = [...LOCAL_COMMANDS, ...MAPPED_COMMANDS];

/** Cached discovered commands from ~/.claude/commands/ and .claude/commands/ */
let discoveredCommands: SlashCommand[] = [];
let discoveredForProject: string | null = null;

/** Discover commands from global and project .claude/commands/ directories */
export async function discoverCommands(projectPath: string): Promise<void> {
  // Skip if already discovered for this project
  if (discoveredForProject === projectPath) return;

  try {
    const results = await invoke<Array<{ name: string; description: string; scope: string }>>(
      "claude_discover_commands",
      { projectPath },
    );
    discoveredCommands = results.map((cmd) => ({
      name: cmd.name,
      description: cmd.description || `Custom command: ${cmd.name}`,
      category: cmd.scope === "project" ? "project" : "global",
    }));
    discoveredForProject = projectPath;
  } catch {
    discoveredCommands = [];
  }
}

/** All available slash commands (static + discovered, deduplicated) */
export function getAllCommands(): SlashCommand[] {
  const staticNames = new Set(STATIC_COMMANDS.map((c) => c.name));
  // Filter out discovered commands that clash with built-in names
  const unique = discoveredCommands.filter((c) => !staticNames.has(c.name));
  return [...STATIC_COMMANDS, ...unique];
}

/** Filter commands by query string (prefix match on name) */
export function filterCommands(query: string): SlashCommand[] {
  const all = getAllCommands();
  const q = query.toLowerCase();
  if (!q) return all;
  // Match prefix on full name or after colon (e.g. "prog" matches "gsd:progress")
  return all.filter((cmd) => {
    const name = cmd.name.toLowerCase();
    return name.startsWith(q) || name.split(":").some((part) => part.startsWith(q));
  });
}

/** Category display labels */
export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  local: "Built-in",
  mapped: "Config",
  skill: "Skill",
  global: "Global",
  project: "Project",
};
