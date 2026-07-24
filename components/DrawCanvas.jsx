import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';

// ponytail: Platform-aware drawing surface.
// Native: Skia. Web: plain <canvas> (same as original Vite app).

const STROKE_WIDTH = 6;
const CANVAS_SIZE = 300;

// ---- Web: Canvas2D implementation ----
const WebCanvas = forwardRef(function WebCanvas({ disabled = false, hintChar = null }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);
  const [strokeCount, setStrokeCount] = useState(0);
  const hintImgRef = useRef(null);

  useEffect(() => {
    if (!hintChar) return;
    const cp = hintChar.charCodeAt(0);
    fetch(`/svgs/${cp}.svg`)
      .then(r => r.text())
      .then(svgText => {
        const cleaned = svgText.replace(/<g stroke="lightgray".*?<\/g>/, '');
        const blob = new Blob([cleaned], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          hintImgRef.current = img;
          URL.revokeObjectURL(url);
          drawHint();
        };
        img.src = url;
      })
      .catch(() => {});
  }, [hintChar]);

  function drawHint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = hintImgRef.current;
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = 0.12;
    const pad = canvas.width * 0.08;
    const scale = Math.min((canvas.width - pad * 2) / img.width, (canvas.height - pad * 2) / img.height);
    const dx = (canvas.width - img.width * scale) / 2;
    const dy = (canvas.height - img.height * scale) / 2;
    ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
    ctx.restore();
  }

  function redrawAll() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHint();
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0][0], stroke[0][1]);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i][0], stroke[i][1]);
      }
      ctx.strokeStyle = '#111';
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  useImperativeHandle(ref, () => ({
    clear() {
      strokesRef.current = [];
      currentStrokeRef.current = [];
      setStrokeCount(0);
      redrawAll();
    },
    isEmpty() { return strokesRef.current.length === 0; },
    getStrokes() {
      const scale = 255 / CANVAS_SIZE;
      return strokesRef.current.map(stroke =>
        stroke.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)])
      );
    },
    undoStroke() {
      strokesRef.current.pop();
      setStrokeCount(c => c - 1);
      redrawAll();
    },
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
    ctx.strokeStyle = '#111';
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [getPos, disabled]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    drawingRef.current = false;
    if (currentStrokeRef.current.length > 1) {
      strokesRef.current.push(currentStrokeRef.current);
      setStrokeCount(c => c + 1);
    }
    currentStrokeRef.current = [];
  }, []);

  return (
    <View style={styles.wrapper}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          touchAction: 'none',
          background: '#f5f0e6',
          border: '2px solid #cbbfa0',
          borderRadius: 8,
          cursor: disabled ? 'default' : 'crosshair',
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
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={() => { strokesRef.current.pop(); setStrokeCount(c => c - 1); redrawAll(); }}
          disabled={disabled || strokeCount === 0}
          style={[styles.toolBtn, (disabled || strokeCount === 0) && styles.toolBtnDisabled]}
        >
          <Text style={styles.toolBtnText}>↩ Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { strokesRef.current = []; setStrokeCount(0); redrawAll(); }}
          disabled={disabled || strokeCount === 0}
          style={[styles.toolBtn, (disabled || strokeCount === 0) && styles.toolBtnDisabled]}
        >
          <Text style={styles.toolBtnText}>🗑 Erase</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ---- Native: Skia implementation (lazy-required) ----
let NativeCanvas = null;

if (Platform.OS !== 'web') {
  const { Canvas, Path, Skia, GestureDetector, Gesture } = require('@shopify/react-native-skia');
  const { getSvgPathData } = require('../utils/svgLoader');

  NativeCanvas = forwardRef(function NativeCanvas({ disabled = false, hintChar = null }, ref) {
    const [paths, setPaths] = useState([]);
    const currentPathRef = useRef(null);
    const allStrokesRef = useRef([]);
    const [strokeCount, setStrokeCount] = useState(0);
    const [hintPathData, setHintPathData] = useState(null);

    useEffect(() => {
      if (!hintChar) return;
      getSvgPathData(hintChar).then(data => { if (data) setHintPathData(data); }).catch(() => {});
    }, [hintChar]);

    function rebuildPaths(strokes) {
      const newPaths = [];
      for (const stroke of strokes) {
        if (stroke.length < 2) continue;
        const skPath = Skia.Path.Make();
        skPath.moveTo(stroke[0][0], stroke[0][1]);
        for (let i = 1; i < stroke.length; i++) skPath.lineTo(stroke[i][0], stroke[i][1]);
        newPaths.push(skPath);
      }
      setPaths(newPaths);
    }

    useImperativeHandle(ref, () => ({
      clear() { setPaths([]); currentPathRef.current = null; allStrokesRef.current = []; setStrokeCount(0); },
      isEmpty() { return allStrokesRef.current.length === 0; },
      getStrokes() {
        const scale = 255 / CANVAS_SIZE;
        return allStrokesRef.current.map(stroke => stroke.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]));
      },
      undoStroke() { allStrokesRef.current.pop(); setStrokeCount(c => c - 1); rebuildPaths(allStrokesRef.current); },
    }));

    const gesture = Gesture.Pan()
      .onBegin((g) => {
        if (disabled) return;
        currentPathRef.current = [[g.x, g.y]];
        const skPath = Skia.Path.Make();
        skPath.moveTo(g.x, g.y);
        setPaths(prev => [...prev, skPath]);
      })
      .onUpdate((g) => {
        if (disabled || !currentPathRef.current) return;
        currentPathRef.current.push([g.x, g.y]);
        const pts = currentPathRef.current;
        const skPath = Skia.Path.Make();
        skPath.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) skPath.lineTo(pts[i][0], pts[i][1]);
        setPaths(prev => { const c = [...prev]; c[c.length - 1] = skPath; return c; });
      })
      .onEnd(() => {
        if (disabled || !currentPathRef.current) return;
        if (currentPathRef.current.length > 1) { allStrokesRef.current.push(currentPathRef.current); setStrokeCount(c => c + 1); }
        currentPathRef.current = null;
      })
      .minDistance(0);

    return (
      <View style={styles.wrapper}>
        <View style={styles.nativeCanvas}>
          <GestureDetector gesture={gesture}>
            <Canvas style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
              {hintPathData && <Path path={hintPathData} color="rgba(0,0,0,0.12)" style="fill" />}
              {paths.map((path, i) => (
                <Path key={i} path={path} color="#111" style="stroke" strokeWidth={STROKE_WIDTH} strokeCap="round" strokeJoin="round" />
              ))}
            </Canvas>
          </GestureDetector>
        </View>
        <View style={styles.toolbar}>
          <TouchableOpacity onPress={() => { allStrokesRef.current.pop(); setStrokeCount(c => c - 1); rebuildPaths(allStrokesRef.current); }}
            disabled={disabled || strokeCount === 0} style={[styles.toolBtn, (disabled || strokeCount === 0) && styles.toolBtnDisabled]}>
            <Text style={styles.toolBtnText}>↩ Undo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setPaths([]); allStrokesRef.current = []; setStrokeCount(0); }}
            disabled={disabled || strokeCount === 0} style={[styles.toolBtn, (disabled || strokeCount === 0) && styles.toolBtnDisabled]}>
            <Text style={styles.toolBtnText}>🗑 Erase</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  });
}

// ---- Exports ----
const DrawCanvas = forwardRef(function DrawCanvas(props, ref) {
  if (Platform.OS === 'web') {
    return <WebCanvas {...props} ref={ref} />;
  }
  if (!NativeCanvas) {
    return <View style={styles.wrapper}><Text>Canvas not available</Text></View>;
  }
  return <NativeCanvas {...props} ref={ref} />;
});

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8, width: '100%' },
  nativeCanvas: { width: CANVAS_SIZE, height: CANVAS_SIZE, backgroundColor: '#f5f0e6', borderWidth: 2, borderColor: '#cbbfa0', borderRadius: 8, overflow: 'hidden' },
  toolbar: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  toolBtn: { paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 6, backgroundColor: '#fff' },
  toolBtnDisabled: { opacity: 0.4 },
  toolBtnText: { fontSize: 13, color: '#333' },
});

export default DrawCanvas;