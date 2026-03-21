import { memo, useState, useCallback } from "react";
import { Send, Check, PenLine } from "lucide-react";

export interface ValidationQuestion {
  label: string;
  fullText: string;
  choices: string[];
}

/** Split text by commas and "hay"/"or" connectors */
function splitChoices(text: string): string[] {
  return text
    .split(/\s+(?:hay|or)\s+/)
    .flatMap((seg) => seg.split(/,\s*/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length < 50);
}

/** Fallback: extract "A hay/or B" choices from end of text (no dash separator) */
function extractFallbackChoices(text: string): string[] {
  const hayIdx = text.lastIndexOf(" hay ");
  const orIdx = text.lastIndexOf(" or ");
  const idx = Math.max(hayIdx, orIdx);
  if (idx < 0) return [];

  const splitLen = idx === hayIdx ? 5 : 4;
  const after = text.slice(idx + splitLen).trim();
  const before = text.slice(0, idx).trim();

  // "A, B hay C" pattern
  if (before.includes(",")) {
    const parts = [...before.split(/,\s*/), after]
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length < 40);
    if (parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 5)) {
      return parts;
    }
  }

  // Simple "...X hay Y": take last few words before splitter
  const words = before.split(/\s+/);
  const choiceA = words
    .slice(-3)
    .join(" ")
    .replace(/^(ở|in|at|with|using)\s+/i, "")
    .trim();

  if (choiceA.length >= 2 && choiceA.length < 30 && after.length >= 2 && after.length < 30) {
    return [choiceA, after];
  }
  return [];
}

/** Extract clickable choices from a question's text */
function extractChoices(rawText: string): string[] {
  const text = rawText
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[?？]\s*$/, "")
    .trim();

  const dashIdx = text.lastIndexOf("—");
  if (dashIdx >= 0) {
    const choices = splitChoices(text.slice(dashIdx + 1).trim());
    if (choices.length >= 2) return choices;
  }

  return extractFallbackChoices(text);
}

/** Parse validation questions with embedded choices from message content */
export function parseValidationQuestions(content: string): ValidationQuestion[] {
  if (!/validation\s*questions/i.test(content)) return [];

  const questions: ValidationQuestion[] = [];
  const questionRegex = /\*\*([^*]+?)\*\*[:：]\s*(.+)/g;

  let match;
  while ((match = questionRegex.exec(content)) !== null) {
    const label = match[1].trim();
    const fullText = match[2].trim();
    if (/validation/i.test(label)) continue;

    const choices = extractChoices(fullText);
    questions.push({ label, fullText, choices });
  }
  return questions.length >= 1 ? questions : [];
}

interface Props {
  questions: ValidationQuestion[];
  onSend: (response: string) => void;
}

export const ClaudeValidationButtons = memo(function ClaudeValidationButtons({
  questions,
  onSend,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const getAnswer = useCallback(
    (label: string) => customInputs[label] || answers[label] || "",
    [customInputs, answers],
  );

  /** Select a radio choice and auto-advance to next tab */
  const selectChoice = useCallback((label: string, choice: string) => {
    setAnswers((prev) => {
      const isDeselect = prev[label] === choice;
      const next = { ...prev, [label]: isDeselect ? "" : choice };
      // Auto-advance to next unanswered tab after selecting
      if (!isDeselect) {
        const currentIdx = questions.findIndex((q) => q.label === label);
        if (currentIdx < questions.length - 1) {
          setTimeout(() => setActiveTab(currentIdx + 1), 150);
        }
      }
      return next;
    });
    setCustomInputs((prev) => ({ ...prev, [label]: "" }));
  }, [questions]);

  const handleCustomChange = useCallback((label: string, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [label]: value }));
    if (value) setAnswers((prev) => ({ ...prev, [label]: "" }));
  }, []);

  const answeredCount = questions.filter((q) => getAnswer(q.label)).length;

  const handleSend = useCallback(() => {
    const parts = questions
      .map((q, i) => {
        const a = customInputs[q.label] || answers[q.label];
        return a ? `${i + 1}. ${a}` : null;
      })
      .filter(Boolean);
    if (parts.length > 0) onSend(parts.join("\n"));
  }, [questions, answers, customInputs, onSend]);

  const currentQ = questions[activeTab];

  return (
    <div className="mt-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle/50 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-ctp-surface1 overflow-x-auto scrollbar-none">
        {questions.map((q, i) => {
          const answered = !!getAnswer(q.label);
          const active = i === activeTab;
          return (
            <button
              key={q.label}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium
                whitespace-nowrap transition-colors cursor-pointer border-b-2
                ${active
                  ? "border-ctp-mauve text-ctp-mauve bg-ctp-surface0/50"
                  : "border-transparent text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0/30"
                }`}
            >
              {answered && <Check size={10} className="text-ctp-green shrink-0" />}
              <span>{q.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      {currentQ && (
        <div className="p-3 space-y-2">
          {/* Question text */}
          <p className="text-xs text-ctp-subtext0 leading-relaxed">{currentQ.fullText}</p>

          {/* Radio choices (when choices were extracted) */}
          {currentQ.choices.length > 0 && (
            <div className="space-y-1">
              {currentQ.choices.map((choice) => {
                const selected =
                  answers[currentQ.label] === choice && !customInputs[currentQ.label];
                return (
                  <button
                    key={choice}
                    onClick={() => selectChoice(currentQ.label, choice)}
                    className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-md
                      text-xs cursor-pointer transition-colors
                      ${selected
                        ? "bg-ctp-mauve/15 text-ctp-text border border-ctp-mauve/50"
                        : "hover:bg-ctp-surface0 text-ctp-subtext1 border border-transparent"
                      }`}
                  >
                    <span
                      className={`shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center
                      ${selected ? "border-ctp-mauve" : "border-ctp-overlay0"}`}
                    >
                      {selected && <span className="w-1.5 h-1.5 rounded-full bg-ctp-mauve" />}
                    </span>
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Custom text input */}
          <div className="flex items-center gap-2">
            <PenLine size={10} className="text-ctp-overlay0 shrink-0" />
            <input
              type="text"
              placeholder="Other..."
              value={customInputs[currentQ.label] || ""}
              onChange={(e) => handleCustomChange(currentQ.label, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (activeTab < questions.length - 1) {
                    setActiveTab(activeTab + 1);
                  } else if (answeredCount > 0) {
                    handleSend();
                  }
                }
              }}
              className="flex-1 bg-ctp-surface0 border border-ctp-surface1 rounded-md px-2.5 py-1
                text-xs text-ctp-text placeholder:text-ctp-overlay0
                focus:outline-none focus:border-ctp-mauve"
            />
          </div>

          {/* Send button — only on last tab */}
          {activeTab === questions.length - 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-ctp-overlay0">
                {answeredCount}/{questions.length} answered
              </span>
              <button
                onClick={handleSend}
                disabled={answeredCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium
                  bg-ctp-mauve text-ctp-base hover:bg-ctp-mauve/80 transition-colors cursor-pointer
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={10} />
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
