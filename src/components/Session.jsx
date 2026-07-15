import { useState, useRef, useCallback, useEffect } from 'react';
import hanziData from '../data/hanzi-index.json';
import StrokePlayer from './StrokePlayer';
import DrawCanvas from './DrawCanvas';
import UsageInfo from './UsageInfo';
import { markHanziReviewed, markHanziForgotten, getHanziStatus, getSessionCards } from '../utils/progress';
import { load as loadHanziLookup, lookup as hanziLookup } from '../utils/hanziLookup';
import { getReferenceStrokes, checkStrokeOrder } from '../utils/strokeOrder';

// ponytail: single-file session controller. No routing library, no complex state machine.
// Ceiling: no spaced repetition algorithm. Upgrade: add SM-2 when needed.

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

export default function Session() {
  const [mode, setMode] = useState('learn');
  const [phase, setPhase] = useState('show'); // 'show' | 'draw' | 'result'
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentChar, setCurrentChar] = useState(null);
  const [message, setMessage] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [hlReady, setHlReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sessionQueue, setSessionQueue] = useState([]);
  const canvasRef = useRef(null);

  // Load HanziLookup WASM on mount
  useEffect(() => {
    loadHanziLookup().then(() => setHlReady(true));
  }, []);

  const popFromQueue = useCallback((queue) => {
    if (!queue || queue.length === 0) return { char: null, remaining: [] };
    return { char: queue[0], remaining: queue.slice(1) };
  }, []);

  const startLearn = useCallback(() => {
    const { queue } = getSessionCards(currentLevel, hanziData);
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
    // If it's a new card (never seen), show animation first
    const status = getHanziStatus(char.c);
    if (status.status === 'new') {
      setPhase('show');
    } else {
      // Already learned/due card → go straight to draw phase, no hint
      setPhase('draw');
      setTimeout(() => canvasRef.current?.clear(), 50);
    }
  }, [currentLevel, popFromQueue]);

  const startReview = useCallback(() => {
    const { queue } = getSessionCards(currentLevel, hanziData);
    // In review mode, only show due cards (skip new ones)
    const dueChars = queue.filter(c => {
      const s = getHanziStatus(c.c);
      return s.status !== 'new';
    });
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
        score = (strokeCheck && strokeCheck.match) ? 1.0 : 0.7;
      } else if (correctIndex > 0) {
        score = 0.5;
      }

      setLookupResult({ matches, correctIndex, score, strokeCheck });
      setPhase('result');

      // Use SM-2 review instead of old markHanziLearned/markHanziWrong
      markHanziReviewed(correctChar, score);
    } catch (err) {
      setMessage('Lookup failed: ' + err.message);
    } finally {
      setChecking(false);
    }
  }, [currentChar]);

  const handleNext = useCallback(() => {
    // Try next from remaining queue first
    const { char, remaining } = popFromQueue(sessionQueue);
    if (char) {
      setSessionQueue(remaining);
      setCurrentChar(char);
      setMessage('');
      setLookupResult(null);
      const status = getHanziStatus(char.c);
      if (status.status === 'new') {
        setPhase('show');
      } else {
        setPhase('draw');
        setTimeout(() => canvasRef.current?.clear(), 50);
      }
      return;
    }
    // Queue exhausted, refill
    if (mode === 'learn') startLearn();
    else startReview();
  }, [mode, sessionQueue, startLearn, startReview, popFromQueue]);

  const handleForgot = useCallback(() => {
    if (!currentChar) return;
    markHanziForgotten(currentChar.c);
    // Next character
    const { char, remaining } = popFromQueue(sessionQueue);
    if (char) {
      setSessionQueue(remaining);
      setCurrentChar(char);
      setMessage('');
      setLookupResult(null);
      const status = getHanziStatus(char.c);
      if (status.status === 'new') {
        setPhase('show');
      } else {
        setPhase('draw');
        setTimeout(() => canvasRef.current?.clear(), 50);
      }
    } else {
      if (mode === 'learn') startLearn();
      else startReview();
    }
  }, [currentChar, sessionQueue, mode, startLearn, startReview, popFromQueue]);

  const handleShowAnswer = useCallback(() => {
    setPhase('show');
  }, []);

  const handleLevelChange = useCallback((e) => {
    setCurrentLevel(Number(e.target.value));
    setCurrentChar(null);
    setMessage('');
    setLookupResult(null);
    setSessionQueue([]);
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

  const status = currentChar ? getHanziStatus(currentChar.c) : null;
  const isNewCard = currentChar && status && status.status === 'new';

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

          {/* Show phase: stroke animation (only for new cards) */}
          {phase === 'show' && (
            <div className="session-show">
              <div className="session-char-large">{currentChar.c}</div>
              <StrokePlayer 
                char={currentChar.c} 
                playing={true} 
              />
              <div className="session-info">
                <p className="session-pinyin">{currentChar.p}</p>
                <p className="session-meaning">{currentChar.m}</p>
                <UsageInfo char={currentChar.c} />
              </div>
              <button onClick={handleShowDone} className="btn-primary">
                Now you try!
              </button>
            </div>
          )}

          {/* Draw phase */}
          {phase === 'draw' && (
            <div className="session-draw">
              <div className="session-prompt">
                {mode === 'review' ? (
                  <>
                    <p className="session-pinyin">{currentChar.p}</p>
                    <p className="session-meaning">{currentChar.m}</p>
                  </>
                ) : isNewCard ? (
                  <>
                    <p className="session-pinyin">{currentChar.p}</p>
                    <p className="session-meaning">{currentChar.m}</p>
                  </>
                ) : (
                  <p className="session-hint">Write the character below</p>
                )}
              </div>
              {isNewCard ? (
                <DrawCanvas ref={canvasRef} hintChar={currentChar.c} />
              ) : (
                <DrawCanvas ref={canvasRef} />
              )}
              <div className="session-actions">
                <button 
                  onClick={handleCheck} 
                  className="btn-primary"
                  disabled={checking || !hlReady}
                >
                  {checking ? 'Checking...' : hlReady ? '✓ Check' : 'Loading...'}
                </button>
                {/* Show "Forgot" button for review/due cards, not for new cards */}
                {!isNewCard && (
                  <button onClick={handleForgot} className="btn-secondary" title="Mark as forgotten and move to next">
                    Forgot
                  </button>
                )}
                {mode === 'review' && (
                  <button onClick={handleShowAnswer} className="btn-small">
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
              Next review: {status.nextReview || 'soon'} | EF: {status.ef || '2.5'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}