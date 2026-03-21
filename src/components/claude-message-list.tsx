import { memo } from "react";
import { Virtuoso } from "react-virtuoso";
import { ClaudeMessageItem } from "@/components/claude-message-item";
import type { ChatMessage } from "@/stores/claude-store";

interface ClaudeMessageListProps {
  messages: ChatMessage[];
  /** Callback for clickable validation option buttons (only passed when idle) */
  onOptionSelect?: (value: string) => void;
}

export const ClaudeMessageList = memo(function ClaudeMessageList({
  messages,
  onOptionSelect,
}: ClaudeMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-ctp-text">Claude</p>
          <p className="text-sm mt-1 text-ctp-subtext0">Ask anything about your project</p>
        </div>
      </div>
    );
  }

  return (
    <Virtuoso
      className="flex-1 min-h-0"
      data={messages}
      followOutput="smooth"
      initialTopMostItemIndex={messages.length - 1}
      itemContent={(index, message) => (
        <ClaudeMessageItem
          key={message.id}
          message={message}
          onOptionSelect={index === messages.length - 1 ? onOptionSelect : undefined}
        />
      )}
    />
  );
});
