import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { getSvgText } from '../utils/svgLoader';

// ponytail: SVG stroke animation player.
// Web: inline SVG (CSS keyframes work natively). Native: WebView.

export default function StrokePlayer({ char, playing = true, onEnd, width = 200, height = 200 }) {
  const [svgContent, setSvgContent] = useState(null);
  const [error, setError] = useState(false);
  const containerRef = useRef(null);
  const animIdRef = useRef(null);

  useEffect(() => {
    if (!char) return;
    setSvgContent(null);
    setError(false);
    getSvgText(char).then(text => {
      if (text) {
        const cleaned = text.replace(/<g stroke="lightgray".*?<\/g>/, '');
        setSvgContent(cleaned);
      } else {
        setError(true);
      }
    }).catch(() => setError(true));
  }, [char]);

  // Detect animation end (web only — native uses WebView's onMessage)
  useEffect(() => {
    if (!svgContent || !onEnd || Platform.OS !== 'web') return;
    const el = containerRef.current;
    if (!el) return;
    const paths = el.querySelectorAll('[id^="make-me-a-hanzi-animation-"]');
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

  // Pause/resume on web
  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;
    const el = containerRef.current;
    const svg = el.querySelector('svg');
    if (!svg) return;
    const style = svg.querySelector('style');
    if (!style) return;
    svg.style.animationPlayState = playing ? 'running' : 'paused';
    const anims = svg.querySelectorAll('[id^="make-me-a-hanzi-animation-"]');
    anims.forEach(el => {
      el.style.animationPlayState = playing ? 'running' : 'paused';
    });
  }, [playing]);

  if (!char) return null;
  if (error) return <View style={[s.error, { width, height }]}><Text style={s.errorText}>No stroke data</Text></View>;

  // Web: inline SVG
  if (Platform.OS === 'web') {
    if (!svgContent) return <View style={[s.loading, { width, height }]}><Text style={s.loadingText}>Loading...</Text></View>;
    return (
      <div ref={containerRef} style={{ width, height }} dangerouslySetInnerHTML={{ __html: svgContent }} />
    );
  }

  // Native: WebView
  const WebView = require('react-native-webview').WebView;
  const isPlaying = playing ? 'running' : 'paused';
  const html = svgContent ? `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display: flex; align-items: center; justify-content: center; width: 100vw; height: 100vh; background: transparent; }
  svg { width: ${width}px; height: ${height}px; }
  svg, svg * { animation-play-state: ${isPlaying} !important; }
</style>
</head>
<body>
${svgContent}
<script>
  var paths = document.querySelectorAll('[id^="make-me-a-hanzi-animation-"]');
  var finished = 0;
  function checkEnd() {
    finished++;
    if (finished >= paths.length) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ what: 'animationEnd' }));
    }
  }
  paths.forEach(function(p) {
    p.addEventListener('animationend', checkEnd, { once: true });
  });
</script>
</body>
</html>` : '';

  const handleMessage = (event) => {
    try {
      const d = JSON.parse(event.nativeEvent.data);
      if (d.what === 'animationEnd' && onEnd) onEnd();
    } catch {}
  };

  if (!html) return <View style={[s.loading, { width, height }]}><Text style={s.loadingText}>Loading...</Text></View>;

  return (
    <View style={{ width, height }}>
      <WebView
        source={{ html }}
        style={{ width, height, backgroundColor: 'transparent' }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
      />
    </View>
  );
}

const s = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0ede4', borderRadius: 8 },
  loadingText: { color: '#777', fontSize: 13 },
  error: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0ede4', borderRadius: 8 },
  errorText: { color: '#777', fontSize: 13 },
});