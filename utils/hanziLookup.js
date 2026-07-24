// ponytail: Platform-aware HanziLookup.
// Web: real Web Worker (importScripts + WASM). Native: hidden WebView bridge.

import { Platform } from 'react-native';

// ---- Web: original Web Worker implementation ----
const webPending = {};
let webNextId = 0;
let webWorker = null;
let webLoadPromise = null;

async function loadWeb() {
  if (webLoadPromise) return webLoadPromise;
  webLoadPromise = new Promise((resolve) => {
    const code = `
      onmessage = (e) => {
        if ("wasm_uri" in e.data) {
          importScripts(e.data.jsUrl);
          wasm_bindgen({ module_or_path: e.data.wasm_uri }).then(() => postMessage({ what: "loaded" }));
        } else if ("strokes" in e.data) {
          const json = wasm_bindgen.lookup(e.data.strokes, e.data.limit);
          const matches = JSON.parse(json);
          postMessage({ what: "lookup", id: e.data.id, matches: matches });
        }
      };
    `;
    webWorker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    webWorker.onmessage = (e) => {
      if (e.data.what === 'loaded') {
        resolve();
      } else if (e.data.what === 'lookup') {
        const cb = webPending[e.data.id];
        if (cb) { delete webPending[e.data.id]; cb(e.data.matches); }
      }
    };
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    webWorker.postMessage({
      wasm_uri: origin + '/hanzi_lookup/hanzi_lookup_bg.wasm',
      jsUrl: origin + '/hanzi_lookup/hanzi_lookup.js',
    });
  });
  return webLoadPromise;
}

function lookupWeb(strokes, limit = 8) {
  return new Promise((resolve) => {
    const id = webNextId++;
    webPending[id] = resolve;
    webWorker.postMessage({ strokes, limit, id });
  });
}

// ---- Native: WebView bridge ----
let webViewRef = null;
let loadResolve = null;
let loadPromise = null;
let nextId = 0;
const pending = {};

function setWebViewRef(ref) {
  webViewRef = ref;
}

function loadNative() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    loadResolve = resolve;
  });
  return loadPromise;
}

function lookupNative(strokes, limit = 8) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending[id] = resolve;
    if (webViewRef) {
      webViewRef.postMessage({ strokes, limit, id });
    }
  });
}

function handleMessage(data) {
  if (data.what === 'loaded') {
    if (loadResolve) { loadResolve(); loadResolve = null; }
  } else if (data.what === 'lookup') {
    const cb = pending[data.id];
    if (cb) { delete pending[data.id]; cb(data.matches); }
  }
}

// ---- Exports: platform-dispatched ----
let loaded = false;
let loadPromiseWeb = null;

async function load() {
  if (loaded) return;
  if (Platform.OS === 'web') {
    if (!loadPromiseWeb) loadPromiseWeb = loadWeb();
    await loadPromiseWeb;
  } else {
    await loadNative();
  }
  loaded = true;
}

function lookup(strokes, limit = 8) {
  if (Platform.OS === 'web') {
    return lookupWeb(strokes, limit);
  }
  return lookupNative(strokes, limit);
}

export { load, lookup, setWebViewRef, handleMessage };

// WebView HTML for native bridge
export function getWebViewHtml() {
  return `
<!DOCTYPE html>
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
      '    wasm_bindgen({ module_or_path: e.data.wasm_uri }).then(function() { postMessage({ what: "loaded" }); });',
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
  getWorker().postMessage({
    wasm_uri: 'hanzi_lookup_bg.wasm',
    jsUrl: 'hanzi_lookup.js'
  });
</script>
</body>
</html>`;
}