// ponytail: inline Blob worker for HanziLookup WASM. No extra file needed.
// Ceiling: single worker, no pooling. Upgrade: pool workers if throughput matters.

let worker = null;
let loadResolve = null;
let loadPromise = null;
let nextId = 0;
const pending = {};

function getWorker() {
  if (worker) return worker;
  const code = `
    onmessage = (e) => {
      if ("wasm_uri" in e.data) {
        importScripts(e.data.jsUrl);
        wasm_bindgen(e.data.wasm_uri).then(() => postMessage({ what: "loaded" }));
      } else if ("strokes" in e.data) {
        const json = wasm_bindgen.lookup(e.data.strokes, e.data.limit);
        const matches = JSON.parse(json);
        postMessage({ what: "lookup", id: e.data.id, matches: matches });
      }
    };
  `;
  worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  worker.onmessage = (e) => {
    if (e.data.what === "loaded") {
      if (loadResolve) { loadResolve(); loadResolve = null; }
    } else if (e.data.what === "lookup") {
      const cb = pending[e.data.id];
      if (cb) { delete pending[e.data.id]; cb(e.data.matches); }
    }
  };
  return worker;
}

export function isLoaded() {
  return loadPromise === null || loadPromise === true;
}

export function load() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    loadResolve = resolve;
    const jsUrl = new URL('/hanzi_lookup.js', self.location.origin).href;
    const wasmUrl = new URL('/hanzi_lookup_bg.wasm', self.location.origin).href;
    getWorker().postMessage({ wasm_uri: wasmUrl, jsUrl });
  });
  return loadPromise;
}

export function lookup(strokes, limit = 8) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending[id] = resolve;
    getWorker().postMessage({ strokes, limit, id });
  });
}