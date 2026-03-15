import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Image as KonvaImage } from "react-konva";
import { invoke } from "@tauri-apps/api/core";
import { useBrowserStore, type AnnotationTool } from "@/stores/browser-store";
import { AnnotationToolbar } from "@/components/annotation-toolbar";

/** Shape data stored in undo/redo history */
interface ShapeData {
  type: AnnotationTool;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
}

interface AnnotationOverlayProps {
  projectPath: string;
}

export const AnnotationOverlay = memo(function AnnotationOverlay({
  projectPath,
}: AnnotationOverlayProps) {
  const browserState = useBrowserStore((s) => s.getState(projectPath));
  const closeAnnotation = useBrowserStore((s) => s.closeAnnotation);

  const stageRef = useRef<any>(null);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [history, setHistory] = useState<ShapeData[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<ShapeData | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { screenshotData, annotationTool, annotationColor, annotationStrokeWidth } = browserState;

  // Load screenshot as background image
  useEffect(() => {
    if (!screenshotData) return;
    const img = new window.Image();
    img.onload = () => {
      setBgImage(img);
      // Fit to container
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

  // Fit stage to container on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (bgImage && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scale = Math.min(rect.width / bgImage.width, rect.height / bgImage.height, 1);
        setStageSize({
          width: Math.round(bgImage.width * scale),
          height: Math.round(bgImage.height * scale),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [bgImage]);

  // Push to history
  const pushHistory = useCallback((newShapes: ShapeData[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const next = [...trimmed, newShapes].slice(-50); // max 50 undo steps
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeAnnotation(projectPath);
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
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, closeAnnotation, projectPath]);

  // Mouse handlers for drawing
  const handleMouseDown = useCallback((e: any) => {
    if (annotationTool === "select") return;
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;
    setIsDrawing(true);

    const baseShape: ShapeData = {
      type: annotationTool,
      color: annotationColor,
      strokeWidth: annotationStrokeWidth,
      opacity: annotationTool === "highlighter" ? 0.35 : 1,
    };

    if (annotationTool === "pen" || annotationTool === "highlighter") {
      setCurrentShape({ ...baseShape, points: [pos.x, pos.y] });
    } else if (annotationTool === "rect" || annotationTool === "circle") {
      setCurrentShape({ ...baseShape, x: pos.x, y: pos.y, width: 0, height: 0 });
    } else if (annotationTool === "arrow") {
      setCurrentShape({ ...baseShape, points: [pos.x, pos.y, pos.x, pos.y] });
    } else if (annotationTool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        const newShape: ShapeData = { ...baseShape, x: pos.x, y: pos.y, text };
        pushHistory([...shapes, newShape]);
      }
      setIsDrawing(false);
    }
  }, [annotationTool, annotationColor, annotationStrokeWidth, shapes, pushHistory]);

  const handleMouseMove = useCallback((e: any) => {
    if (!isDrawing || !currentShape) return;
    const pos = e.target.getStage().getPointerPosition();
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
    // Don't add tiny shapes (accidental clicks)
    if (currentShape.type === "rect" || currentShape.type === "circle") {
      if (Math.abs(currentShape.width || 0) < 3 && Math.abs(currentShape.height || 0) < 3) {
        setCurrentShape(null);
        return;
      }
    }
    pushHistory([...shapes, currentShape]);
    setCurrentShape(null);
  }, [isDrawing, currentShape, shapes, pushHistory]);

  // Export as data URL
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
      const path = await invoke<string>("write_screenshot", {
        projectPath,
        filename,
        data: base64,
      });
      console.log("Screenshot saved:", path);
    } catch (err) {
      console.error("Failed to save screenshot:", err);
    }
  }, [exportImage, projectPath]);

  const handleCopy = useCallback(async () => {
    const dataUrl = exportImage();
    if (!dataUrl) return;
    try {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  }, [exportImage]);

  // Render a shape from ShapeData
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
          <Circle
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

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-ctp-crust">
      <AnnotationToolbar
        projectPath={projectPath}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        onCopy={handleCopy}
        onClose={() => closeAnnotation(projectPath)}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
      />
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden bg-ctp-crust"
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
            {/* Background screenshot */}
            {bgImage && (
              <KonvaImage
                image={bgImage}
                width={stageSize.width}
                height={stageSize.height}
              />
            )}
            {/* Committed shapes */}
            {shapes.map((s, i) => renderShape(s, `shape-${i}`))}
            {/* Shape being drawn */}
            {currentShape && renderShape(currentShape, "current")}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});
