import { File, FileCode, FileJson, FileText, FileType, Image, Cog } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Map file extensions to lucide icon components */
const ICON_MAP: Record<string, LucideIcon> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  rs: FileCode,
  py: FileCode,
  go: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  rb: FileCode,
  php: FileCode,
  json: FileJson,
  jsonc: FileJson,
  md: FileText,
  mdx: FileText,
  txt: FileText,
  html: FileType,
  css: FileType,
  scss: FileType,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  svg: Image,
  webp: Image,
  toml: Cog,
  yaml: Cog,
  yml: Cog,
};

/** Get an appropriate lucide icon for a file extension */
export function getFileIcon(extension: string): LucideIcon {
  return ICON_MAP[extension.toLowerCase()] ?? File;
}
