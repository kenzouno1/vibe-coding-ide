/** Map file extensions to Monaco editor language IDs */
const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
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
