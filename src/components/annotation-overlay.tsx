import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Stage, Layer, Line, Rect, Ellipse, Arrow, Text, Image as KonvaImage } from "react-konva";
import { invoke } from "@tauri-apps/api/core";
import { useBrowserStore, DEFAULT_BROWSER_STATE, type AnnotationTool } from "@/stores/browser-store";
import { AnnotationToolbar } from "@/components/annotation-toolbar";

interface ShapeData {
  type: AnnotationTool;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
}

interface AnnotationOverlayProps {
  paneId: string;
  projectPath: string;
}

export const AnnotationOverlay = memo(function AnnotationOverlay({
  paneId,
  projectPath,
}: AnnotationOverlayProps) {
  const browserState = useBrowserStore((s) => s.states[paneId] ?? DEFAULT_BROWSER_STATE);
  const closeAnnotation = useBrowserStore((s) => s.closeAnnotation);

  const stageRef = useRef<any>(null);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [history, setHistory] = useState<ShapeData[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<ShapeData | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  // Text input state (replaces prompt() which blocks/crashes)
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const { screenshotData, annotationTool, annotationColor, annotationStrokeWidth } = browserState;

  // Load screenshot as background image
  useEffect(() => {
    if (!screenshotData) return;
    const img = new window.Image();
    img.onload = () => {
      setBgImage(img);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scale = Math.min(rect.width / img.width, rect.height / img.height, 1);
        setStageSize({
          width: Math.round(img.width * scale),
          height: Math.round(img.height * scale),
        });
      }
    };
    img.src = screenshotData;
  }, [screenshotData]);

  // Focus text input when shown
  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  const pushHistory = useCallback((newShapes: ShapeData[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const next = [...trimmed, newShapes].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
    setShapes(newShapes);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setShapes(history[newIndex]);
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setShapes(history[newIndex]);
  }, [historyIndex, history]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (textInput) return; // don't handle while typing
      if (e.key === "Escape") {
        closeAnnotation(paneId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);

    // Paste image from clipboard (Ctrl+V or Win+Shift+S → paste)
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const blob = items[i].getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const img = new window.Image();
            img.onload = () => {
              setBgImage(img);
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const scale = Math.min(rect.width / img.width, rect.height / img.height, 1);
                setStageSize({
                  width: Math.round(img.width * scale),
                  height: Math.round(img.height * scale),
                });
              }
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("paste", handlePaste);
    };
  }, [undo, redo, closeAnnotation, paneId, textInput]);

  // Commit text input
  const commitTextInput = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue("");
      return;
    }
    const newShape: ShapeData = {
      type: "text",
      x: textInput.x,
      y: textInput.y,
      text: textValue,
      color: annotationColor,
      strokeWidth: annotationStrokeWidth,
      opacity: 1,
    };
    pushHistory([...shapes, newShape]);
    setTextInput(null);
    setTextValue("");
  }, [textInput, textValue, annotationColor, annotationStrokeWidth, shapes, pushHistory]);

  const handleMouseDown = useCallback((e: any) => {
    // Commit any pending text input first
    if (textInput) {
      commitTextInput();
      return;
    }
    if (annotationTool === "select") return;
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;

    const baseShape: ShapeData = {
      type: annotationTool,
      color: annotationColor,
      strokeWidth: annotationStrokeWidth,
      opacity: annotationTool === "highlighter" ? 0.35 : 1,
    };

    if (annotationTool === "text") {
      // Show inline text input instead of prompt()
      setTextInput({ x: pos.x, y: pos.y });
      setTextValue("");
      return;
    }

    setIsDrawing(true);
    if (annotationTool === "pen" || annotationTool === "highlighter") {
      setCurrentShape({ ...baseShape, points: [pos.x, pos.y] });
    } else if (annotationTool === "rect" || annotationTool === "circle") {
      setCurrentShape({ ...baseShape, x: pos.x, y: pos.y, width: 0, height: 0 });
    } else if (annotationTool === "arrow") {
      setCurrentShape({ ...baseShape, points: [pos.x, pos.y, pos.x, pos.y] });
    }
  }, [annotationTool, annotationColor, annotationStrokeWidth, shapes, pushHistory, textInput, commitTextInput]);

  const handleMouseMove = useCallback((e: any) => {
    if (!isDrawing || !currentShape) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    if (currentShape.type === "pen" || currentShape.type === "highlighter") {
      setCurrentShape({
        ...currentShape,
        points: [...(currentShape.points || []), pos.x, pos.y],
      });
    } else if (currentShape.type === "rect" || currentShape.type === "circle") {
      setCurrentShape({
        ...currentShape,
        width: pos.x - (currentShape.x || 0),
        height: pos.y - (currentShape.y || 0),
      });
    } else if (currentShape.type === "arrow") {
      const pts = currentShape.points || [0, 0, 0, 0];
      setCurrentShape({
        ...currentShape,
        points: [pts[0], pts[1], pos.x, pos.y],
      });
    }
  }, [isDrawing, currentShape]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !currentShape) return;
    setIsDrawing(false);
    if (currentShape.type === "rect" || currentShape.type === "circle") {
      if (Math.abs(currentShape.width || 0) < 3 && Math.abs(currentShape.height || 0) < 3) {
        setCurrentShape(null);
        return;
      }
    }
    pushHistory([...shapes, currentShape]);
    setCurrentShape(null);
  }, [isDrawing, currentShape, shapes, pushHistory]);

  const exportImage = useCallback(() => {
    if (!stageRef.current) return null;
    return stageRef.current.toDataURL({ pixelRatio: 2 });
  }, []);

  const handleSave = useCallback(async () => {
    const dataUrl = exportImage();
    if (!dataUrl) return;
    const base64 = dataUrl.split(",")[1];
    const filename = `screenshot-${Date.now()}.png`;
    try {
      await invoke<string>("write_screenshot", { projectPath, filename, data: base64 });
    } catch (err) {
      console.error("Failed to save screenshot:", err);
    }
  }, [exportImage, projectPath]);

  const handleCopy = useCallback(async () => {
    const dataUrl = exportImage();
    if (!dataUrl) return;
    try {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [exportImage]);

  const renderShape = (shape: ShapeData, key: string) => {
    const common = { opacity: shape.opacity ?? 1 };
    switch (shape.type) {
      case "pen":
      case "highlighter":
        return (
          <Line
            key={key}
            points={shape.points || []}
            stroke={shape.color}
            strokeWidth={shape.type === "highlighter" ? shape.strokeWidth * 3 : shape.strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
            {...common}
          />
        );
      case "rect":
        return (
          <Rect
            key={key}
            x={shape.x || 0}
            y={shape.y || 0}
            width={shape.width || 0}
            height={shape.height || 0}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            {...common}
          />
        );
      case "circle":
        return (
          <Ellipse
            key={key}
            x={(shape.x || 0) + (shape.width || 0) / 2}
            y={(shape.y || 0) + (shape.height || 0) / 2}
            radiusX={Math.abs((shape.width || 0) / 2)}
            radiusY={Math.abs((shape.height || 0) / 2)}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            {...common}
          />
        );
      case "arrow":
        return (
          <Arrow
            key={key}
            points={shape.points || []}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            fill={shape.color}
            pointerLength={10}
            pointerWidth={8}
            {...common}
          />
        );
      case "text":
        return (
          <Text
            key={key}
            x={shape.x || 0}
            y={shape.y || 0}
            text={shape.text || ""}
            fontSize={16}
            fill={shape.color}
            {...common}
          />
        );
      default:
        return null;
    }
  };

  // If no screenshot data, show a placeholder to test drawing without screenshot
  const hasScreenshot = !!bgImage;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ctp-crust">
      <AnnotationToolbar
        paneId={paneId}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        onCopy={handleCopy}
        onClose={() => closeAnnotation(paneId)}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
      />
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden bg-ctp-crust relative"
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="border border-ctp-surface0"
          style={{ cursor: annotationTool === "select" ? "default" : "crosshair" }}
        >
          <Layer>
            {hasScreenshot && (
              <KonvaImage image={bgImage} width={stageSize.width} height={stageSize.height} />
            )}
            {!hasScreenshot && (
              <Rect x={0} y={0} width={stageSize.width} height={stageSize.height} fill="#313244" />
            )}
            {shapes.map((s, i) => renderShape(s, `shape-${i}`))}
            {currentShape && renderShape(currentShape, "current")}
          </Layer>
        </Stage>

        {/* Inline text input overlay (replaces prompt() dialog) */}
        {textInput && (
          <input
            ref={textInputRef}
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTextInput();
              if (e.key === "Escape") { setTextInput(null); setTextValue(""); }
            }}
            onBlur={commitTextInput}
            className="absolute px-1 py-0.5 text-sm bg-ctp-base border border-ctp-mauve text-ctp-text focus:outline-none"
            style={{
              left: textInput.x,
              top: textInput.y + 40, // offset for toolbar height
              minWidth: 100,
            }}
            placeholder="Type text..."
          />
        )}
      </div>
    </div>
  );
});
