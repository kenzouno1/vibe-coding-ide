import { memo, useMemo } from "react";
import { Wrench, Check, Loader2, AlertCircle } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import type { ChatMessage, ToolUseBlock, ToolStatus } from "@/stores/claude-store";
import { getSkillRisk, RISK_COLORS, RISK_TEXT_COLORS } from "@/data/ssh-skills";
import { parseValidationQuestions, ClaudeValidationButtons } from "@/components/claude-validation-buttons";

interface ValidationOption {
  number: string;
  label: string;
}

/** Detect numbered option patterns at the end of a message (e.g., "1. Option A\n2. Option B") */
function parseValidationOptions(content: string): ValidationOption[] {
  const lines = content.trimEnd().split("\n");
  const optionRegex = /^\s*(\d+)[.)]\s+(.+)/;

  const options: ValidationOption[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(optionRegex);
    if (match) {
      options.unshift({
        number: match[1],
        label: match[2].replace(/\*\*/g, "").trim(),
      });
    } else {
      break;
    }
  }
  return options.length >= 2 ? options : [];
}

/** Status icon and color for tool use blocks */
const TOOL_STATUS: Record<ToolStatus, { icon: typeof Check; color: string; animate?: boolean }> = {
  pending: { icon: Loader2, color: "text-ctp-overlay0", animate: true },
  running: { icon: Loader2, color: "text-ctp-yellow", animate: true },
  complete: { icon: Check, color: "text-ctp-green" },
  error: { icon: AlertCircle, color: "text-ctp-red" },
};

function ToolBlock({ tool }: { tool: ToolUseBlock }) {
  const status = TOOL_STATUS[tool.status ?? "complete"];
  const StatusIcon = status.icon;
  const risk = tool.name === "Bash" && tool.input ? getSkillRisk(tool.input) : null;
  return (
    <div className="mt-2 rounded-md border border-ctp-surface1 bg-ctp-mantle p-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        <StatusIcon
          size={12}
          className={`${status.color} ${status.animate ? "animate-spin" : ""}`}
        />
        <Wrench size={10} className="text-ctp-overlay0" />
        <span className="text-ctp-subtext0">{tool.name}</span>
        {risk && (
          <span className={`flex items-center gap-0.5 text-[9px] ${RISK_TEXT_COLORS[risk]}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${RISK_COLORS[risk]}`} />
            {risk}
          </span>
        )}
      </div>
      {tool.input && (
        <pre className="mt-1 text-ctp-overlay1 overflow-x-auto whitespace-pre-wrap break-all">
          {tool.input.length > 200 ? tool.input.slice(0, 200) + "..." : tool.input}
        </pre>
      )}
    </div>
  );
}

interface ClaudeMessageItemProps {
  message: ChatMessage;
  /** When provided, renders clickable buttons for numbered options */
  onOptionSelect?: (value: string) => void;
}

export const ClaudeMessageItem = memo(function ClaudeMessageItem({
  message,
  onOptionSelect,
}: ClaudeMessageItemProps) {
  const isUser = message.role === "user";
  const options = useMemo(
    () => (onOptionSelect && !isUser ? parseValidationOptions(message.content) : []),
    [onOptionSelect, isUser, message.content],
  );
  const validationQuestions = useMemo(
    () => (onOptionSelect && !isUser ? parseValidationQuestions(message.content) : []),
    [onOptionSelect, isUser, message.content],
  );

  return (
    <div className={`px-3 py-1.5 ${isUser ? "bg-ctp-surface0/50" : ""}`}>
      <div className="max-w-full">
        <div className="min-w-0 overflow-hidden">
          {isUser ? (
            <p className="text-sm text-ctp-text whitespace-pre-wrap break-words">
              {message.content}
            </p>
          ) : (
            <>
              {message.content ? (
                <div className="text-sm prose-sm max-w-none">
                  <MarkdownPreview content={message.content} />
                </div>
              ) : (
                <span className="text-ctp-overlay0 text-sm animate-pulse">
                  Thinking...
                </span>
              )}

              {/* Validation question buttons (multi-select form) */}
              {validationQuestions.length > 0 ? (
                <ClaudeValidationButtons
                  questions={validationQuestions}
                  onSend={onOptionSelect!}
                />
              ) : options.length > 0 ? (
                /* Numbered option buttons (single-click send) */
                <div className="mt-3 flex flex-wrap gap-2">
                  {options.map((opt) => (
                    <button
                      key={opt.number}
                      onClick={() => onOptionSelect!(opt.number)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                                 bg-ctp-surface0 border border-ctp-surface1 text-ctp-text
                                 hover:bg-ctp-surface1 hover:border-ctp-mauve transition-colors
                                 cursor-pointer"
                    >
                      <span className="bg-ctp-mauve text-ctp-base rounded px-1.5 py-0.5 text-[10px] font-bold leading-none">
                        {opt.number}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Tool use blocks with status */}
              {message.toolUse?.map((tool) => (
                <ToolBlock key={tool.id} tool={tool} />
              ))}

            </>
          )}
        </div>
      </div>
    </div>
  );
});
