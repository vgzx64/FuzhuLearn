import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Platform } from 'react-native';
import hanziData from '../data/hanzi-index.json';
import StrokePlayer from './StrokePlayer';
import DrawCanvas from './DrawCanvas';
import UsageInfo from './UsageInfo';
import { markHanziReviewed, markHanziForgotten, getHanziStatus, getSessionCards } from '../utils/progress';
import { load as loadHanziLookup, lookup as hanziLookup, setWebViewRef, handleMessage } from '../utils/hanziLookup';
import { getReferenceStrokes, checkStrokeOrder } from '../utils/strokeOrder';
import { isDev } from '../utils/env';
import DebugPanel from './DebugPanel';

// ponytail: single-file session controller.

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

export default function Session() {
  const [mode, setMode] = useState('learn');
  const [phase, setPhase] = useState('show');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentChar, setCurrentChar] = useState(null);
  const [message, setMessage] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [hlReady, setHlReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sessionQueue, setSessionQueue] = useState([]);
  const [lastStrokes, setLastStrokes] = useState(null);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const canvasRef = useRef(null);
  const lookupWebViewRef = useRef(null);

  // Load HanziLookup WASM on mount
  useEffect(() => {
    loadHanziLookup().then(() => setHlReady(true));
  }, []);

  // WebView message handler for hanzi lookup
  const onLookupMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      handleMessage(data);
    } catch {}
  }, []);

  const popFromQueue = useCallback((queue) => {
    if (!queue || queue.length === 0) return { char: null, remaining: [] };
    return { char: queue[0], remaining: queue.slice(1) };
  }, []);

  const startLearn = useCallback(async () => {
    const { queue } = await getSessionCards(currentLevel, hanziData);
    if (queue.length === 0) {
      setMessage('All caught up! No new cards and no reviews due today.');
      return;
    }
    const { char, remaining } = popFromQueue(queue);
    if (!char) {
      setMessage('No cards available.');
      return;
    }
    setSessionQueue(remaining);
    setCurrentChar(char);
    setMessage('');
    setLookupResult(null);
    const status = await getHanziStatus(char.c);
    if (status.status === 'new') {
      setPhase('show');
    } else {
      setPhase('draw');
      setTimeout(() => canvasRef.current?.clear(), 50);
    }
  }, [currentLevel, popFromQueue]);

  const startReview = useCallback(async () => {
    const { queue } = await getSessionCards(currentLevel, hanziData);
    const dueChars = [];
    for (const c of queue) {
      const s = await getHanziStatus(c.c);
      if (s.status !== 'new') dueChars.push(c);
    }
    if (dueChars.length === 0) {
      setMessage('No cards to review today. Learn some new ones first!');
      return;
    }
    const { char, remaining } = popFromQueue(dueChars);
    setSessionQueue(dueChars.slice(1));
    setCurrentChar(char);
    setPhase('draw');
    setMessage('');
    setLookupResult(null);
    setTimeout(() => canvasRef.current?.clear(), 50);
  }, [currentLevel, popFromQueue]);

  const handleShowDone = useCallback(() => {
    setPhase('draw');
    setLookupResult(null);
    canvasRef.current?.clear();
  }, []);

  const handleCheck = useCallback(async () => {
    if (!currentChar || !canvasRef.current) return;
    const strokes = canvasRef.current.getStrokes();
    if (strokes.length === 0) {
      setMessage('Draw something first!');
      return;
    }
    setChecking(true);
    setMessage('');
    try {
      const [matches, refStrokes] = await Promise.all([
        hanziLookup(strokes, 8),
        getReferenceStrokes(currentChar.c)
      ]);

      const correctChar = currentChar.c;
      const correctIndex = matches.findIndex(m => m.hanzi === correctChar);

      let strokeCheck = null;
      if (refStrokes && refStrokes.length > 0) {
        strokeCheck = checkStrokeOrder(strokes, refStrokes);
      }

      let score = 0;
      if (correctIndex === 0) {
        score = (strokeCheck === null || strokeCheck.match) ? 1.0 : 0.7;
      } else if (correctIndex > 0) {
        score = 0.5;
      }

      setLookupResult({ matches, correctIndex, score, strokeCheck });
      if (isDev) setLastStrokes(strokes);
      setPhase('result');

      await markHanziReviewed(correctChar, score);
    } catch (err) {
      setMessage('Lookup failed: ' + err.message);
    } finally {
      setChecking(false);
    }
  }, [currentChar]);

  const handleNext = useCallback(async () => {
    const { char, remaining } = popFromQueue(sessionQueue);
    if (char) {
      setSessionQueue(remaining);
      setCurrentChar(char);
      setMessage('');
      setLookupResult(null);
      const status = await getHanziStatus(char.c);
      setPhase(status.status === 'new' ? 'show' : 'draw');
      if (status.status !== 'new') setTimeout(() => canvasRef.current?.clear(), 50);
      return;
    }
    if (mode === 'learn') startLearn();
    else startReview();
  }, [mode, sessionQueue, startLearn, startReview, popFromQueue]);

  const handleForgot = useCallback(async () => {
    if (!currentChar) return;
    await markHanziForgotten(currentChar.c);
    const { char, remaining } = popFromQueue(sessionQueue);
    if (char) {
      setSessionQueue(remaining);
      setCurrentChar(char);
      setMessage('');
      setLookupResult(null);
      const status = await getHanziStatus(char.c);
      setPhase(status.status === 'new' ? 'show' : 'draw');
      if (status.status !== 'new') setTimeout(() => canvasRef.current?.clear(), 50);
    } else {
      if (mode === 'learn') startLearn();
      else startReview();
    }
  }, [currentChar, sessionQueue, mode, startLearn, startReview, popFromQueue]);

  const handleShowAnswer = useCallback(() => {
    setPhase('show');
  }, []);

  const handleLevelChange = useCallback((level) => {
    setCurrentLevel(level);
    setCurrentChar(null);
    setMessage('');
    setLookupResult(null);
    setSessionQueue([]);
    setShowLevelPicker(false);
  }, []);

  const toggleMode = useCallback(() => {
    const newMode = mode === 'learn' ? 'review' : 'learn';
    setMode(newMode);
    setCurrentChar(null);
    setMessage('');
    setLookupResult(null);
    setSessionQueue([]);
  }, [mode]);

  useEffect(() => {
    if (!currentChar) {
      if (mode === 'learn') startLearn();
      else startReview();
    }
  }, [mode, currentLevel, currentChar, startLearn, startReview]);

  const [isNewCard, setIsNewCard] = useState(false);

  useEffect(() => {
    if (currentChar) {
      getHanziStatus(currentChar.c).then(s => setIsNewCard(s.status === 'new'));
    } else {
      setIsNewCard(false);
    }
  }, [currentChar]);

  // Refs for the canvas to receive messages from parent
  const setCanvasRef = useCallback((node) => {
    canvasRef.current = node;
  }, []);

  // Lazy WebView component for native only
  const HlWebView = Platform.OS !== 'web' ? require('react-native-webview').WebView : null;

  return (
    <ScrollView style={styles.session} contentContainerStyle={styles.sessionContent}>
      {/* Hidden WebView for HanziLookup WASM (native only) */}
      {Platform.OS !== 'web' && hlReady === false && (
        <View style={{ height: 0, width: 0, overflow: 'hidden', position: 'absolute', top: -9999 }}>
          <HlWebView
            ref={lookupWebViewRef}
            source={{ html: hnWvHtml }}
            onMessage={onLookupMessage}
            javaScriptEnabled={true}
            onLoad={() => setHlReady(true)}
          />
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity style={styles.levelBtn} onPress={() => setShowLevelPicker(true)}>
          <Text style={styles.levelBtnText}>HSK Level {currentLevel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleMode} style={styles.modeBtn}>
          <Text style={styles.modeBtnText}>{mode === 'learn' ? 'Switch to Review' : 'Switch to Learn'}</Text>
        </TouchableOpacity>
      </View>

      {/* Level picker modal */}
      <Modal visible={showLevelPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowLevelPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select HSK Level</Text>
            {LEVELS.map(l => (
              <TouchableOpacity
                key={l}
                style={[styles.pickerItem, currentLevel === l && styles.pickerItemActive]}
                onPress={() => handleLevelChange(l)}
              >
                <Text style={[styles.pickerItemText, currentLevel === l && styles.pickerItemTextActive]}>
                  HSK Level {l}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {isDev && (
        <DebugPanel
          currentChar={currentChar}
          strokes={lastStrokes}
          lookupResult={lookupResult}
          strokeCheck={lookupResult?.strokeCheck}
        />
      )}

      {currentChar && (
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.modeLabel}>{mode === 'learn' ? '📖 Learning' : '✏️ Review'}</Text>
            <Text style={styles.level}>HSK {currentChar.l}</Text>
          </View>

          {phase === 'show' && (
            <View style={styles.showSection}>
              <Text style={styles.charLarge}>{currentChar.c}</Text>
              <StrokePlayer char={currentChar.c} playing={true} width={200} height={200} />
              <View style={styles.info}>
                <Text style={styles.pinyin}>{currentChar.p}</Text>
                <Text style={styles.meaning}>{currentChar.m}</Text>
                <UsageInfo char={currentChar.c} />
              </View>
              <TouchableOpacity onPress={handleShowDone} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Now you try!</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'draw' && (
            <View style={styles.drawSection}>
              <View style={styles.prompt}>
                <Text style={styles.pinyin}>{currentChar.p}</Text>
                <Text style={styles.meaning}>{currentChar.m}</Text>
              </View>
              <DrawCanvas ref={setCanvasRef} hintChar={isNewCard ? currentChar.c : null} />
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={handleCheck}
                  style={[styles.btnPrimary, (checking || !hlReady) && styles.btnDisabled]}
                  disabled={checking || !hlReady}
                >
                  <Text style={styles.btnPrimaryText}>
                    {checking ? 'Checking...' : hlReady ? '✓ Check' : 'Loading...'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleForgot} style={styles.btnSecondary}>
                  <Text style={styles.btnSecondaryText}>Forgot</Text>
                </TouchableOpacity>
                {mode === 'review' && (
                  <TouchableOpacity onPress={handleShowAnswer} style={styles.btnSmall}>
                    <Text style={styles.btnSmallText}>Show answer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {phase === 'result' && lookupResult && (
            <View style={styles.resultSection}>
              {lookupResult.score > 0 ? (
                <View style={styles.resultSuccess}>
                  <Text style={styles.resultText}>
                    {lookupResult.score >= 1 ? '✓ Perfect!' : lookupResult.score >= 0.7 ? '✓ Good' : '✓ Close enough!'}
                  </Text>
                  <Text style={styles.resultPoints}>+{lookupResult.score}</Text>
                </View>
              ) : (
                <View style={styles.resultFailure}>
                  <Text style={styles.resultText}>✗ Not quite</Text>
                </View>
              )}

              {lookupResult.strokeCheck && (
                <View style={styles.resultStrokes}>
                  <Text style={styles.resultLabel}>Stroke order:</Text>
                  <View style={styles.strokeList}>
                    {lookupResult.strokeCheck.perStroke.map((s, i) => (
                      <View
                        key={i}
                        style={[styles.stroke, s.ok ? styles.strokeOk : styles.strokeBad]}
                      >
                        <Text style={styles.strokeNum}>{s.index + 1}</Text>
                        <Text style={styles.strokeIcon}>{s.ok ? '✓' : '✗'}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.resultMatches}>
                <Text style={styles.resultLabel}>
                  {lookupResult.score > 0 ? 'HanziLookup found:' : 'Similar characters:'}
                </Text>
                <View style={styles.matchList}>
                  {lookupResult.matches.slice(0, 5).map((m, i) => (
                    <View
                      key={i}
                      style={[styles.matchItem, m.hanzi === currentChar.c && styles.matchItemCorrect]}
                    >
                      <Text style={styles.matchChar}>{m.hanzi}</Text>
                      <Text style={styles.matchScore}>{Math.round(m.score * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity onPress={handleNext} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Next</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const hnWvHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
  var worker = null;
  function getWorker() {
    if (worker) return worker;
    var code = [
      'onmessage = function(e) {',
      '  if ("wasm_uri" in e.data) {',
      '    importScripts(e.data.jsUrl);',
      '    wasm_bindgen(e.data.wasm_uri).then(function() { postMessage({ what: "loaded" }); });',
      '  } else if ("strokes" in e.data) {',
      '    var json = wasm_bindgen.lookup(e.data.strokes, e.data.limit);',
      '    var matches = JSON.parse(json);',
      '    postMessage({ what: "lookup", id: e.data.id, matches: matches });',
      '  }',
      '};'
    ].join('\\n');
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify(e.data));
    };
    return worker;
  }
  window.addEventListener('message', function(e) {
    if (e.data && e.data.strokes) {
      getWorker().postMessage(e.data);
    }
  });
  getWorker().postMessage({ wasm_uri: 'hanzi_lookup_bg.wasm', jsUrl: 'hanzi_lookup.js' });
</script>
</body>
</html>`;

const styles = StyleSheet.create({
  session: { flex: 1 },
  sessionContent: { paddingBottom: 40 },
  controls: { flexDirection: 'row', gap: 8, marginBottom: 16, alignItems: 'center' },
  levelBtn: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 6, backgroundColor: '#fff' },
  levelBtnText: { fontSize: 14, color: '#333' },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 6, backgroundColor: '#fff' },
  modeBtnText: { fontSize: 13, color: '#777' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  pickerModal: { backgroundColor: '#fff', borderRadius: 14, padding: 24, minWidth: 200 },
  pickerTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  pickerItem: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginBottom: 4 },
  pickerItemActive: { backgroundColor: '#4a6fa5' },
  pickerItemText: { fontSize: 16, color: '#333', textAlign: 'center' },
  pickerItemTextActive: { color: '#fff' },
  message: { textAlign: 'center', padding: 20, color: '#777', fontSize: 16 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 12, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  modeLabel: { fontSize: 13, color: '#777' },
  level: { fontSize: 13, color: '#777' },
  showSection: { alignItems: 'center', gap: 12 },
  charLarge: { fontSize: 64, fontWeight: '500', color: '#333' },
  info: { alignItems: 'center' },
  pinyin: { fontSize: 19, color: '#4a6fa5', fontStyle: 'italic', marginBottom: 4 },
  meaning: { fontSize: 15, color: '#777' },
  drawSection: { alignItems: 'center', gap: 12 },
  prompt: { alignItems: 'center', padding: 12 },
  hint: { fontSize: 14, color: '#777' },
  actions: { gap: 8, alignItems: 'center', width: '100%' },
  btnPrimary: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#4a6fa5', borderRadius: 8, minWidth: 120, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },
  btnSecondary: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#e8e4da', borderRadius: 8, minWidth: 120, alignItems: 'center' },
  btnSecondaryText: { color: '#333', fontSize: 15 },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e8d5b7', borderRadius: 8 },
  btnSmallText: { color: '#333', fontSize: 12 },
  resultSection: { alignItems: 'center', gap: 14 },
  resultSuccess: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultFailure: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultText: { fontSize: 20, fontWeight: '600', color: '#333' },
  resultPoints: { fontSize: 16, backgroundColor: '#4caf50', color: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  resultStrokes: { width: '100%', alignItems: 'center' },
  resultLabel: { fontSize: 13, color: '#777', marginBottom: 8 },
  strokeList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  stroke: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, minWidth: 36, alignItems: 'center' },
  strokeOk: { backgroundColor: '#f0faf0', borderWidth: 1, borderColor: '#4caf50' },
  strokeBad: { backgroundColor: '#fef0f0', borderWidth: 1, borderColor: '#e74c3c' },
  strokeNum: { fontSize: 11, color: '#777' },
  strokeIcon: { fontSize: 16 },
  resultMatches: { width: '100%', alignItems: 'center' },
  matchList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  matchItem: { alignItems: 'center', padding: 8, borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 8, minWidth: 60, backgroundColor: '#fff' },
  matchItemCorrect: { borderColor: '#4caf50', backgroundColor: '#f0faf0' },
  matchChar: { fontSize: 28, lineHeight: 36 },
  matchScore: { fontSize: 11, color: '#777' },
});