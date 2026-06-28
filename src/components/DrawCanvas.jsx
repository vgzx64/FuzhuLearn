import { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

const STROKE_COLOR = '#111';
const STROKE_WIDTH = 18;

// ponytail: minimal drawing surface. No gesture recognition, no cloud.
// Ceiling: no pressure sensitivity. Upgrade: replace with Pointer Events API.

const DrawCanvas = forwardRef(function DrawCanvas({ width = 300, height = 300, disabled = false }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);
  
  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawingRef.current = false;
      strokesRef.current = [];
      currentStrokeRef.current = [];
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
      // Redraw everything
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of strokesRef.current) {
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
  }));

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
    }
  }, []);

  return (
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
  );
});

export default DrawCanvas;