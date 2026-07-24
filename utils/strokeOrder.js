// ponytail: per-stroke order checking from SVG animation paths.
// Ceiling: direction-based matching, not full curve similarity. Upgrade: DTW on point sequences.

import { getSvgText } from './svgLoader';

// Parse SVG path d attribute into array of [x,y] points
function parsePath(d) {
  const points = [];
  // Match all coordinate pairs after M, L, Q commands
  const re = /[MLQ]\s*([\d.-]+)\s+([\d.-]+)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    points.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return points;
}

// Resample a stroke to exactly n equally-spaced points
function resample(stroke, n) {
  if (stroke.length < 2) return stroke;
  // Compute cumulative arc lengths
  const dists = [0];
  for (let i = 1; i < stroke.length; i++) {
    const dx = stroke[i][0] - stroke[i-1][0];
    const dy = stroke[i][1] - stroke[i-1][1];
    dists.push(dists[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const totalLen = dists[dists.length - 1];
  if (totalLen === 0) return Array(n).fill(stroke[0]);
  const result = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * totalLen;
    while (j < dists.length - 2 && dists[j+1] < target) j++;
    if (j >= dists.length - 1) {
      result.push(stroke[stroke.length - 1]);
    } else {
      const t = (target - dists[j]) / (dists[j+1] - dists[j]);
      result.push([
        stroke[j][0] + t * (stroke[j+1][0] - stroke[j][0]),
        stroke[j][1] + t * (stroke[j+1][1] - stroke[j][1])
      ]);
    }
  }
  return result;
}

// Convert SVG coords (0-1024, Y-flipped) to 0-255 canvas coords
function svgToCanvas(points) {
  return points.map(([x, y]) => {
    // SVG transform: scale(1,-1) translate(0,-900) means y_svg = -y_orig + 900
    // So y_orig = 900 - y_svg
    const yOrig = 900 - y;
    return [
      Math.round((x / 1024) * 255),
      Math.round((yOrig / 1024) * 255)
    ];
  });
}

// Compute direction angles (in degrees) for each segment of a stroke
function directions(stroke) {
  const angles = [];
  for (let i = 1; i < stroke.length; i++) {
    const dx = stroke[i][0] - stroke[i-1][0];
    const dy = stroke[i][1] - stroke[i-1][1];
    angles.push(Math.atan2(dy, dx) * 180 / Math.PI);
  }
  return angles;
}

// Average angular difference between two angle sequences (handles wrap-around)
function angleDiff(a1, a2) {
  let total = 0;
  const n = Math.min(a1.length, a2.length);
  for (let i = 0; i < n; i++) {
    let diff = Math.abs(a1[i] - a2[i]);
    if (diff > 180) diff = 360 - diff;
    total += diff;
  }
  return total / n;
}

// Fetch and parse reference strokes for a character
const svgCache = new Map();
export async function getReferenceStrokes(char) {
  if (svgCache.has(char)) return svgCache.get(char);
  const text = await getSvgText(char);
  if (!text) return null;
  // Extract all animation paths in order
  const paths = [];
  const re = /id="make-me-a-hanzi-animation-(\d+)"[^>]*d="([^"]+)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const idx = parseInt(m[1]);
    const raw = parsePath(m[2]);
    const canvas = svgToCanvas(raw);
    const resampled = resample(canvas, 20);
    const dirs = directions(resampled);
    paths.push({ index: idx, points: resampled, directions: dirs });
  }
  paths.sort((a, b) => a.index - b.index);
  svgCache.set(char, paths);
  return paths;
}

// Compare user strokes to reference strokes
// Returns { match: boolean, perStroke: [{index, ok, error}], score: number }
export function checkStrokeOrder(userStrokes, refStrokes) {
  if (refStrokes.length === 0) return { match: false, perStroke: [], score: 0 };

  const THRESHOLD = 75; // degrees — lenient for freehand drawing
  const perStroke = [];
  let correctCount = 0;

  const n = Math.min(userStrokes.length, refStrokes.length);
  for (let i = 0; i < n; i++) {
    const userResampled = resample(userStrokes[i], 20);
    const userDirs = directions(userResampled);
    const refDirs = refStrokes[i].directions;
    const err = angleDiff(userDirs, refDirs);
    const ok = err <= THRESHOLD;
    if (ok) correctCount++;
    perStroke.push({ index: i, ok, error: Math.round(err) });
  }

  // Extra user strokes (drew too many)
  for (let i = n; i < userStrokes.length; i++) {
    perStroke.push({ index: i, ok: false, error: 999, extra: true });
  }

  // Missing reference strokes (didn't draw enough)
  for (let i = n; i < refStrokes.length; i++) {
    perStroke.push({ index: i, ok: false, error: 999, missing: true });
  }

  const total = Math.max(userStrokes.length, refStrokes.length);
  const score = total > 0 ? correctCount / total : 0;
  const match = score >= 0.6; // 60% strokes correct = good enough for freehand

  return { match, perStroke, score };
}