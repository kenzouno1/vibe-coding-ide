/** Map file extensions to Monaco editor language IDs */
const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  mdx: "markdown",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  xml: "xml",
  svg: "xml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  dockerfile: "dockerfile",
  graphql: "graphql",
  lua: "lua",
};

/** Map file extensions to Catppuccin CSS variable color values for visual indicators */
const EXTENSION_COLOR_MAP: Record<string, string> = {
  ts: "var(--color-ctp-blue)",
  tsx: "var(--color-ctp-sky)",
  js: "var(--color-ctp-yellow)",
  jsx: "var(--color-ctp-sky)",
  html: "var(--color-ctp-peach)",
  htm: "var(--color-ctp-peach)",
  css: "var(--color-ctp-sapphire)",
  py: "var(--color-ctp-green)",
};

/** Get Catppuccin color value for a file path (empty string if unmapped) */
export function getLanguageColor(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_COLOR_MAP[ext] ?? "";
}

/** Detect Monaco language ID from a file path */
export function detectLanguage(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? "";

  // Handle special filenames
  const lowerName = fileName.toLowerCase();
  if (lowerName === "dockerfile") return "dockerfile";
  if (lowerName === "makefile") return "makefile";

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? "plaintext";
}
