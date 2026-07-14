import { useState, useEffect } from 'react';
import { getUsageExamples } from '../utils/dictionary';

// ponytail: lightweight component. No external state, no routing.
// Ceiling: no caching. Upgrade: memoize per char.

export default function UsageInfo({ char }) {
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!char) return;
    setLoading(true);
    getUsageExamples(char).then(ex => {
      setExamples(ex.slice(0, 3)); // Show up to 3 examples
      setLoading(false);
    });
  }, [char]);
  // ponytail: no cleanup - getUsageExamples has built-in timeout

  if (!char) return null;

  return (
    <div className="usage-info">
      {loading ? (
        <p className="usage-loading">Loading usage...</p>
      ) : examples.length > 0 ? (
        <>
          <p className="usage-label">Usage:</p>
          <ul className="usage-list">
            {examples.map((ex, i) => (
              <li key={i} className="usage-item">{ex.zh} ({ex.en})</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="usage-empty">No usage examples found.</p>
      )}
      <a 
        href={`https://www.dong-chinese.com/wiki/${encodeURIComponent(char)}`}
        target="_blank" 
        rel="noopener noreferrer" 
        className="usage-dict-link"
      >
        🔗 Look up in dictionary
      </a>
    </div>
  );
}
