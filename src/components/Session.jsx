import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import hanziData from '../data/hanzi-index.json';
import StrokePlayer from './StrokePlayer';
import DrawCanvas from './DrawCanvas';
import UsageInfo from './UsageInfo';
import { markHanziLearned, markHanziWrong, getHanziStatus } from '../utils/progress';
import { load as loadHanziLookup, lookup as hanziLookup } from '../utils/hanziLookup';
import { getReferenceStrokes, checkStrokeOrder } from '../utils/strokeOrder';
import { getUsageExamples } from '../utils/dictionary';

// ponytail: single-file session controller. No routing library, no complex state machine.
// Ceiling: no spaced repetition algorithm. Upgrade: add SM-2 when needed.

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

function pickNext(level, exclude) {
  const pool = hanziData.filter(h => h.l === level && !exclude.has(h.c));
  if (pool.length === 0) return null;
  const unlearned = pool.filter(h => getHanziStatus(h.c).status === 'new');
  const target = unlearned.length > 0 ? unlearned : pool;
  return target[Math.floor(Math.random() * target.length)];
}

function pickReview(level) {
  const pool = hanziData.filter(h => h.l === level);
  const learned = pool.filter(h => getHanziStatus(h.c).status === 'learned');
  if (learned.length === 0) return null;
  return learned[Math.floor(Math.random() * learned.length)];
}

export default function Session() {
  const [mode, setMode] = useState('learn');
  const [phase, setPhase] = useState('show'); // 'show' | 'draw' | 'result'
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentChar, setCurrentChar] = useState(null);
  const [animationEnded, setAnimationEnded] = useState(false);
  const [message, setMessage] = useState('');
  const [lookupResult, setLookupResult] = useState(null); // { matches, correctIndex, score, strokeCheck }
  const [hlReady, setHlReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const canvasRef = useRef(null);

  // Load HanziLookup WASM on mount
  useEffect(() => {
    loadHanziLookup().then(() => setHlReady(true));
  }, []);

  const startLearn = useCallback(() => {
    const seen = new Set();
    const char = pickNext(currentLevel, seen);
    if (!char) {
      setMessage('All characters in this level are learned! Try review mode.');
      return;
    }
    setCurrentChar(char);
    setPhase('show');
    setAnimationEnded(false);
    setMessage('');
    setLookupResult(null);
  }, [currentLevel]);

  const startReview = useCallback(() => {
    const char = pickReview(currentLevel);
    if (!char) {
      setMessage('No characters to review yet. Learn some first!');
      return;
    }
    setCurrentChar(char);
    setPhase('draw');
    setAnimationEnded(false);
    setMessage('');
    setLookupResult(null);
    setTimeout(() => canvasRef.current?.clear(), 50);
  }, [currentLevel]);

  const handleAnimEnd = useCallback(() => {
    setAnimationEnded(true);
  }, []);

  const handleShowDone = useCallback(() => {
    setPhase('draw');
    setAnimationEnded(false);
    setLookupResult(null);
    canvasRef.current?.clear();
  }, []);

  // Check the drawn character with HanziLookup + stroke order
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
      // Run HanziLookup and stroke order check in parallel
      const [matches, refStrokes] = await Promise.all([
        hanziLookup(strokes, 8),
        getReferenceStrokes(currentChar.c)
      ]);

      const correctChar = currentChar.c;
      const correctIndex = matches.findIndex(m => m.hanzi === correctChar);

      // Stroke order check
      let strokeCheck = null;
      if (refStrokes && refStrokes.length > 0) {
        strokeCheck = checkStrokeOrder(strokes, refStrokes);
      }

      // Combined scoring:
      // - Correct char #1 + all strokes correct → 1.0
      // - Correct char #1 + some strokes wrong → 0.7
      // - Correct char found but not #1 → 0.5
      // - Not found → 0
      let score = 0;
      if (correctIndex === 0) {
        score = (strokeCheck && strokeCheck.match) ? 1.0 : 0.7;
      } else if (correctIndex > 0) {
        score = 0.5;
      }

      setLookupResult({ matches, correctIndex, score, strokeCheck });
      setPhase('result');

      if (score > 0) {
        markHanziLearned(correctChar, score);
      } else {
        markHanziWrong(correctChar);
      }
    } catch (err) {
      setMessage('Lookup failed: ' + err.message);
    } finally {
      setChecking(false);
    }
  }, [currentChar]);

  // Continue to next character after result
  const handleNext = useCallback(() => {
    if (mode === 'learn') startLearn();
    else startReview();
  }, [mode, startLearn, startReview]);

  // Show answer in review mode (skip drawing)
  const handleShowAnswer = useCallback(() => {
    setPhase('show');
    setAnimationEnded(false);
  }, []);

  const handleLevelChange = useCallback((e) => {
    setCurrentLevel(Number(e.target.value));
    setCurrentChar(null);
    setMessage('');
    setLookupResult(null);
  }, []);

  const toggleMode = useCallback(() => {
    const newMode = mode === 'learn' ? 'review' : 'learn';
    setMode(newMode);
    setCurrentChar(null);
    setMessage('');
    setLookupResult(null);
  }, [mode]);

  useEffect(() => {
    if (!currentChar) {
      if (mode === 'learn') startLearn();
      else startReview();
    }
  }, [mode, currentLevel, currentChar, startLearn, startReview]);

  const status = currentChar ? getHanziStatus(currentChar.c) : null;

  return (
    <div className="session">
      <div className="session-controls">
        <select value={currentLevel} onChange={handleLevelChange}>
          {LEVELS.map(l => (
            <option key={l} value={l}>HSK Level {l}</option>
          ))}
        </select>
        <button onClick={toggleMode} className="mode-btn">
          {mode === 'learn' ? 'Switch to Review' : 'Switch to Learn'}
        </button>
      </div>

      {message && <div className="session-message">{message}</div>}

      {currentChar && (
        <div className="session-card">
          <div className="session-header">
            <span className="session-mode-label">
              {mode === 'learn' ? '📖 Learning' : '✏️ Review'}
            </span>
            <span className="session-level">HSK {currentChar.l}</span>
          </div>

          {/* Show phase: stroke animation + info */}
          {phase === 'show' && (
            <div className="session-show">
              <div className="session-char-large">{currentChar.c}</div>
              <StrokePlayer 
                char={currentChar.c} 
                playing={true} 
                onEnd={handleAnimEnd} 
              />
              <div className="session-info">
                <p className="session-pinyin">{currentChar.p}</p>
                <p className="session-meaning">{currentChar.m}</p>
                <UsageInfo char={currentChar.c} />
              </div>
              {animationEnded && (
                <button onClick={handleShowDone} className="btn-primary">
                  {mode === 'learn' ? 'Now you try!' : 'Continue'}
                </button>
              )}
            </div>
          )}

          {/* Draw phase: user writes */}
          {phase === 'draw' && (
            <div className="session-draw">
              {mode === 'review' ? (
                <div className="session-prompt">
                  <p className="session-pinyin">{currentChar.p}</p>
                  <p className="session-meaning">{currentChar.m}</p>
                </div>
              ) : (
                <p className="session-hint">Write the character below</p>
              )}
              <DrawCanvas ref={canvasRef} />
              <div className="session-actions">
                <button 
                  onClick={handleCheck} 
                  className="btn-primary"
                  disabled={checking || !hlReady}
                >
                  {checking ? 'Checking...' : hlReady ? '✓ Check' : 'Loading...'}
                </button>
                {mode === 'review' && (
                  <button onClick={handleShowAnswer} className="btn-secondary">
                    Show answer
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Result phase: show HanziLookup results + stroke order feedback */}
          {phase === 'result' && lookupResult && (
            <div className="session-result">
              {lookupResult.score > 0 ? (
                <div className="result-success">
                  {lookupResult.score >= 1 ? '✓ Perfect!' : lookupResult.score >= 0.7 ? '✓ Good (stroke order off)' : '✓ Close enough!'}
                  <span className="result-points">+{lookupResult.score}</span>
                </div>
              ) : (
                <div className="result-failure">
                  ✗ Not quite
                </div>
              )}

              {/* Per-stroke feedback */}
              {lookupResult.strokeCheck && (
                <div className="result-strokes">
                  <p className="result-label">Stroke order:</p>
                  <div className="result-stroke-list">
                    {lookupResult.strokeCheck.perStroke.map((s, i) => (
                      <div key={i} className={`result-stroke ${s.ok ? 'stroke-ok' : 'stroke-bad'}`}
                           title={s.extra ? 'Extra stroke' : s.missing ? 'Missing stroke' : `Error: ${s.error}°`}>
                        <span className="stroke-num">{s.index + 1}</span>
                        <span className="stroke-icon">{s.ok ? '✓' : '✗'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="result-matches">
                <p className="result-label">
                  {lookupResult.score > 0
                    ? 'HanziLookup found:'
                    : 'HanziLookup found these similar characters:'}
                </p>
                <div className="result-match-list">
                  {lookupResult.matches.slice(0, 5).map((m, i) => (
                    <div 
                      key={i} 
                      className={`result-match-item ${m.hanzi === currentChar.c ? 'result-match-correct' : ''}`}
                    >
                      <span className="result-match-char">{m.hanzi}</span>
                      <span className="result-match-score">{Math.round(m.score * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {lookupResult.score === 0 && (
                <div className="result-correct-answer">
                  Correct: <span className="result-correct-char">{currentChar.c}</span>
                </div>
              )}

              <button onClick={handleNext} className="btn-primary">
                Next
              </button>
            </div>
          )}

          {/* Status indicator */}
          {status && status.status !== 'new' && (
            <div className="session-status">
              Points: {status.correct}
            </div>
          )}
        </div>
      )}
    </div>
  );
}