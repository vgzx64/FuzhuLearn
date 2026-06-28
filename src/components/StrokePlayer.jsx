import { useState, useEffect, useRef } from 'react';

// ponytail: fetches SVG text, injects inline with animation controls.
// Ceiling: no stroke-by-stroke stepping. Upgrade: parse keyframes per stroke.

export default function StrokePlayer({ char, playing = true, onEnd }) {
  const [svgContent, setSvgContent] = useState(null);
  const [error, setError] = useState(false);
  const containerRef = useRef(null);
  const animIdRef = useRef(null);

  useEffect(() => {
    if (!char) return;
    setSvgContent(null);
    setError(false);
    const cp = char.charCodeAt(0);
    fetch(`/svgs/${cp}.svg`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.text();
      })
      .then(text => {
        // Inject the SVG but remove the grid lines for cleaner display
        const cleaned = text.replace(/<g stroke="lightgray".*?<\/g>/, '');
        setSvgContent(cleaned);
      })
      .catch(() => setError(true));
  }, [char]);

  // Detect animation end
  useEffect(() => {
    if (!svgContent || !containerRef.current || !onEnd) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;
    const paths = svg.querySelectorAll('[id^="make-me-a-hanzi-animation-"]');
    if (paths.length === 0) return;
    let finished = 0;
    const check = () => {
      finished++;
      if (finished >= paths.length) onEnd();
    };
    paths.forEach(p => {
      p.addEventListener('animationend', check, { once: true });
    });
    return () => {
      paths.forEach(p => p.removeEventListener('animationend', check));
    };
  }, [svgContent, onEnd]);

  // Pause/resume all animations
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;
    const style = svg.querySelector('style');
    if (!style) return;
    // Toggle animation-play-state via CSS
    svg.style.animationPlayState = playing ? 'running' : 'paused';
    const anims = svg.querySelectorAll('[id^="make-me-a-hanzi-animation-"]');
    anims.forEach(el => {
      el.style.animationPlayState = playing ? 'running' : 'paused';
    });
  }, [playing]);

  if (!char) return null;
  if (error) return <div className="stroke-error">No stroke data</div>;

  return (
    <div className="stroke-player" ref={containerRef}>
      {svgContent ? (
        <div dangerouslySetInnerHTML={{ __html: svgContent }} />
      ) : (
        <div className="stroke-loading">Loading...</div>
      )}
    </div>
  );
}