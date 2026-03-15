import { useEffect, useRef, useState, useId } from "react";
import mermaid from "mermaid";

// GitHub-like neutral theme
mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

interface MermaidBlockProps {
  code: string;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const { svg: rendered } = await mermaid.render(`mermaid${uniqueId}`, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setSvg(null);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [code, uniqueId]);

  if (error) {
    return (
      <pre className="bg-ctp-mantle border border-ctp-red/30 rounded-md p-4 text-ctp-red text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div className="my-4 rounded-md border border-ctp-surface0 bg-white p-4 flex justify-center overflow-x-auto">
      {svg ? (
        <div
          ref={containerRef}
          className="[&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span className="text-ctp-overlay0 text-sm">Rendering...</span>
      )}
    </div>
  );
}
