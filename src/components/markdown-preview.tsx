import MarkdownPreviewComponent from "@uiw/react-markdown-preview";
import { MermaidBlock } from "@/components/mermaid-block";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="flex-1 overflow-auto bg-ctp-base" data-color-mode="dark">
      <div className="max-w-4xl mx-auto p-6">
        <MarkdownPreviewComponent
          source={content}
          style={{ background: "transparent" }}
          components={{
            code({ className, children }) {
              const match = /language-mermaid/.test(className || "");
              if (match) {
                return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
              }
              return <code className={className}>{children}</code>;
            },
          }}
        />
      </div>
    </div>
  );
}
