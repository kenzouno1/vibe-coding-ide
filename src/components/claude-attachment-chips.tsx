import { memo, useCallback } from "react";
import { X, Image, FileText, File } from "lucide-react";
import type { Attachment } from "@/stores/claude-store";

interface ClaudeAttachmentChipsProps {
  attachments: Attachment[];
  onRemove: (path: string) => void;
}

/** Icon based on MIME type */
function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image size={12} className="text-ctp-green" />;
  if (mimeType === "application/pdf") return <FileText size={12} className="text-ctp-red" />;
  return <File size={12} className="text-ctp-blue" />;
}

export const ClaudeAttachmentChips = memo(function ClaudeAttachmentChips({
  attachments,
  onRemove,
}: ClaudeAttachmentChipsProps) {
  const handleRemove = useCallback(
    (path: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(path);
    },
    [onRemove],
  );

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 px-3 pb-1">
      {attachments.map((att) => (
        <div
          key={att.path}
          className="flex items-center gap-1 bg-ctp-surface0 border border-ctp-surface1 rounded px-2 py-0.5 text-xs text-ctp-subtext0"
        >
          <AttachmentIcon mimeType={att.mimeType} />
          <span className="max-w-[120px] truncate">{att.name}</span>
          <button
            onClick={handleRemove(att.path)}
            className="ml-0.5 text-ctp-overlay0 hover:text-ctp-red transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
});
