import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

const STROKE_COLOR = '#111';
const STROKE_WIDTH = 18;

// ponytail: minimal drawing surface. hintChar renders a faint reference overlay.
// Ceiling: no pressure sensitivity. Upgrade: replace with Pointer Events API.

const DrawCanvas = forwardRef(function DrawCanvas({ width = 300, height = 300, disabled = false, hintChar = null }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);
  const hintImageRef = useRef(null);
  const [strokeCount, setStrokeCount] = useState(0);

  // Load the handwritten SVG as an image for the hint overlay
  useEffect(() => {
    if (!hintChar) { hintImageRef.current = null; return; }
    const cp = hintChar.charCodeAt(0);
    fetch(`/svgs/${cp}.svg`)
      .then(r => r.text())
      .then(svgText => {
        // Strip grid lines for cleaner look
        const cleaned = svgText.replace(/<g stroke="lightgray".*?<\/g>/, '');
        const blob = new Blob([cleaned], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          hintImageRef.current = img;
          URL.revokeObjectURL(url);
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            drawHintImage(ctx, canvasRef.current.width, canvasRef.current.height);
          }
        };
        img.src = url;
      })
      .catch(() => { hintImageRef.current = null; });
  }, [hintChar]);

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawingRef.current = false;
      strokesRef.current = [];
      currentStrokeRef.current = [];
      setStrokeCount(0);
      // Re-draw hint if set
      drawHintImage(ctx, canvas.width, canvas.height);
    },
    isEmpty() {
      return strokesRef.current.length === 0;
    },
    // Returns strokes as array of arrays of [x,y] points, normalized to 0-255
    getStrokes() {
      const scale = 255 / Math.max(width, height);
      return strokesRef.current.map(stroke =>
        stroke.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)])
      );
    },
    undoStroke() {
      if (strokesRef.current.length === 0) return;
      strokesRef.current.pop();
      redrawAll(canvasRef.current, strokesRef.current, hintChar);
    }
  }));

  function drawHintImage(ctx, w, h) {
    const img = hintImageRef.current;
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = 0.12;
    // Scale to fit canvas with padding
    const pad = w * 0.08;
    const scale = Math.min((w - pad * 2) / img.width, (h - pad * 2) / img.height);
    const dx = (w - img.width * scale) / 2;
    const dy = (h - img.height * scale) / 2;
    ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
    ctx.restore();
  }

  function redrawAll(canvas, strokes, hint) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw hint first (behind strokes)
    if (hint) drawHintImage(ctx, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0][0], stroke[0][1]);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i][0], stroke[i][1]);
      }
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const startDraw = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    const pos = getPos(e);
    currentStrokeRef.current = [[pos.x, pos.y]];
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos, disabled]);

  const moveDraw = useCallback((e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const pos = getPos(e);
    currentStrokeRef.current.push([pos.x, pos.y]);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [getPos, disabled]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    drawingRef.current = false;
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = [];
      setStrokeCount(c => c + 1);
    }
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setStrokeCount(c => c - 1);
    redrawAll(canvas, strokesRef.current, hintChar);
  }, [hintChar]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = false;
    strokesRef.current = [];
    currentStrokeRef.current = [];
    setStrokeCount(0);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHintImage(ctx, canvas.width, canvas.height);
  }, [hintChar]);

  return (
    <div className="draw-canvas-wrapper">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          touchAction: 'none',
          background: '#f5f0e6',
          border: '2px solid #cbbfa0',
          borderRadius: 8,
          cursor: disabled ? 'default' : 'crosshair',
          width: '100%',
          height: 'auto',
          maxWidth: 400,
          opacity: disabled ? 0.6 : 1,
        }}
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={moveDraw}
        onTouchEnd={endDraw}
      />
      <div className="draw-canvas-toolbar">
        <button
          onClick={handleUndo}
          disabled={disabled || strokeCount === 0}
          className="draw-tool-btn"
          title="Undo last stroke"
        >
          ↩ Undo
        </button>
        <button
          onClick={handleClear}
          disabled={disabled || strokeCount === 0}
          className="draw-tool-btn"
          title="Erase all"
        >
          🗑 Erase
        </button>
      </div>
    </div>
  );
});

export default DrawCanvas;