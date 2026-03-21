/** Frontend mirror of ~/.devtools/agent-workspace/ssh-skills.js for risk badge display. */

export type RiskLevel = "low" | "medium" | "high" | "critical";

interface SkillDef {
  name: string;
  risk: RiskLevel;
}

const SKILLS: SkillDef[] = [
  // System
  { name: "system.info", risk: "low" },
  { name: "system.disk", risk: "low" },
  { name: "system.memory", risk: "low" },
  { name: "system.processes", risk: "low" },
  { name: "system.ports", risk: "low" },
  // File
  { name: "file.read", risk: "low" },
  { name: "file.list", risk: "low" },
  { name: "file.stat", risk: "low" },
  { name: "file.grep", risk: "low" },
  { name: "file.write", risk: "high" },
  { name: "file.delete", risk: "high" },
  // Service
  { name: "service.list", risk: "low" },
  { name: "service.status", risk: "low" },
  { name: "service.start", risk: "critical" },
  { name: "service.stop", risk: "critical" },
  { name: "service.restart", risk: "critical" },
  // Logs
  { name: "logs.tail", risk: "medium" },
  { name: "logs.journal", risk: "medium" },
  // Git
  { name: "git.status", risk: "low" },
  { name: "git.log", risk: "low" },
  { name: "git.pull", risk: "high" },
  // Network
  { name: "net.ping", risk: "low" },
  { name: "net.check_port", risk: "low" },
  // Process
  { name: "process.list", risk: "low" },
  { name: "process.kill", risk: "high" },
];

const SKILL_MAP = new Map(SKILLS.map((s) => [s.name, s.risk]));

const SKILL_REGEX = /ssh-exec\.js\s+skill\s+\S+\s+([\w.]+)/;

/** Extract risk level from a Bash tool input string if it's a skill call. */
export function getSkillRisk(toolInput: string): RiskLevel | null {
  const match = SKILL_REGEX.exec(toolInput);
  if (!match) return null;
  return SKILL_MAP.get(match[1]) ?? null;
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "bg-ctp-green",
  medium: "bg-ctp-yellow",
  high: "bg-ctp-red",
  critical: "bg-ctp-maroon",
};

export const RISK_TEXT_COLORS: Record<RiskLevel, string> = {
  low: "text-ctp-green",
  medium: "text-ctp-yellow",
  high: "text-ctp-red",
  critical: "text-ctp-maroon",
};
