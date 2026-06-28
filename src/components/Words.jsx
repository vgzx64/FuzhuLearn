import { useState } from 'react';
import hanziData from '../data/hanzi-index.json';
import { getLevelStats, getHanziStatus, markHanziLearned, markHanziWrong, isLevelComplete, markLevelComplete } from '../utils/progress';
import StrokePlayer from './StrokePlayer';

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const FILTERS = ['all', 'new', 'learning', 'learned'];

// ponytail: expandable HSK level browser with inline status toggles and detail modal.
// Ceiling: no pagination for large levels (HSK7 has 415 chars — still manageable).

function getVisibleChars(level, filter, search) {
  let list = hanziData.filter(h => h.l === level);
  if (filter !== 'all') {
    list = list.filter(h => getHanziStatus(h.c).status === filter);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(h =>
      h.p.toLowerCase().includes(q) ||
      h.m.toLowerCase().includes(q)
    );
  }
  return list;
}

export default function Words() {
  const [refresh, setRefresh] = useState(0);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [detailChar, setDetailChar] = useState(null);

  const rerender = () => setRefresh(r => r + 1);

  const toggleLevel = (level) => {
    setExpandedLevel(expandedLevel === level ? null : level);
    setFilter('all');
    setSearch('');
  };

  // Counts for summary
  let totalAll = 0, learnedAll = 0;
  for (const h of hanziData) {
    const s = getHanziStatus(h.c);
    if (s.status === 'learned') learnedAll++;
    totalAll++;
  }

  return (
    <div className="words">
      <h2>Words</h2>
      <p className="progress-summary">{learnedAll} / {totalAll} characters learned</p>

      {expandedLevel !== null && (
        <div className="words-toolbar">
          <input
            className="words-search"
            placeholder="Search pinyin or meaning..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="words-filters">
            {FILTERS.map(f => (
              <button
                key={f}
                className={`words-filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="progress-levels">
        {LEVELS.map(level => {
          const stats = getLevelStats(level, hanziData);
          const completed = isLevelComplete(level);
          const chars = getVisibleChars(level, filter, search);
          const isOpen = expandedLevel === level;

          return (
            <div key={level} className={`progress-level ${completed ? 'completed' : ''} ${isOpen ? 'open' : ''}`}>
              <div className="progress-level-header clickable" onClick={() => toggleLevel(level)}>
                <h3>HSK {level} <span className="expand-icon">{isOpen ? '▼' : '▶'}</span></h3>
                <span className="progress-count">{stats.learned} / {stats.total}</span>
              </div>

              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${stats.pct}%` }} />
              </div>

              {isOpen && (
                <div className="words-level-body">
                  <div className="words-level-actions">
                    <button className="btn-small" onClick={() => {
                      chars.forEach(h => markHanziLearned(h.c));
                      rerender();
                    }}>Mark all visible as learned</button>
                    <button className="btn-small" onClick={() => {
                      markLevelComplete(level);
                      rerender();
                    }} disabled={completed}>
                      {completed ? '✓ Complete' : 'Mark level complete'}
                    </button>
                  </div>

                  {chars.length === 0 ? (
                    <p className="words-empty">No characters match this filter.</p>
                  ) : (
                    <div className="words-grid">
                      {chars.map(h => {
                        const s = getHanziStatus(h.c);
                        return (
                          <div
                            key={h.c}
                            className={`words-char-card status-${s.status}`}
                            onClick={() => setDetailChar(h)}
                          >
                            <span className="words-char">{h.c}</span>
                            <span className="words-char-pinyin">{h.p}</span>
                            <span className="words-char-status">
                              {s.status === 'learned' ? '✓' : s.status === 'learning' ? '○' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Character detail modal */}
      {detailChar && (
        <div className="words-modal-overlay" onClick={() => setDetailChar(null)}>
          <div className="words-modal" onClick={e => e.stopPropagation()}>
            <button className="words-modal-close" onClick={() => setDetailChar(null)}>✕</button>
            <div className="words-modal-char">{detailChar.c}</div>
            <StrokePlayer char={detailChar.c} playing={true} />
            <p className="session-pinyin">{detailChar.p}</p>
            <p className="session-meaning">{detailChar.m}</p>
            <div className="words-modal-actions">
              {getHanziStatus(detailChar.c).status === 'learned' ? (
                <button className="btn-correct" onClick={() => { markHanziWrong(detailChar.c); rerender(); }}>
                  ✓ Learned (click to unlearn)
                </button>
              ) : (
                <button className="btn-primary" onClick={() => { markHanziLearned(detailChar.c); rerender(); }}>
                  Mark learned
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}