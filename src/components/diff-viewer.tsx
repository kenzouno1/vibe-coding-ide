interface DiffViewerProps {
  diff: string;
}

/** Lightweight diff renderer — no heavy dependencies */
export function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff) return null;

  const lines = diff.split("\n");

  return (
    <div className="font-mono text-xs leading-5 p-2 overflow-auto h-full">
      {lines.map((line, i) => {
        let bg = "";
        let color = "text-ctp-text";

        if (line.startsWith("+++") || line.startsWith("---")) {
          color = "text-ctp-overlay1";
          bg = "bg-ctp-surface0";
        } else if (line.startsWith("@@")) {
          color = "text-ctp-blue";
          bg = "bg-ctp-blue/10";
        } else if (line.startsWith("+")) {
          color = "text-ctp-green";
          bg = "bg-ctp-green/10";
        } else if (line.startsWith("-")) {
          color = "text-ctp-red";
          bg = "bg-ctp-red/10";
        }

        return (
          <div key={i} className={`px-2 whitespace-pre ${bg} ${color}`}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
