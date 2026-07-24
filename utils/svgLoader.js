// ponytail: Cross-platform SVG text loader.
// Files served from public/ on web, read from bundle on native via expo-file-system.

import { Platform } from 'react-native';

let FileSystem = null;

function getFS() {
  if (!FileSystem && Platform.OS !== 'web') {
    FileSystem = require('expo-file-system');
  }
  return FileSystem;
}

const svgTextCache = {};

export async function getSvgText(char) {
  const cp = char.charCodeAt(0);
  if (svgTextCache[cp]) return svgTextCache[cp];

  if (Platform.OS === 'web') {
    try {
      const resp = await fetch(`/svgs/${cp}.svg`);
      if (resp.ok) {
        const text = await resp.text();
        svgTextCache[cp] = text;
        return text;
      }
    } catch {}
    return null;
  }

  // Native: read from bundle (Expo copies public/ contents into the bundle)
  const fs = getFS();
  const paths = [
    `${fs.bundleDirectory}svgs/${cp}.svg`,
    `${fs.documentDirectory}svgs/${cp}.svg`,
    `${fs.cacheDirectory}svgs/${cp}.svg`,
  ];
  for (const path of paths) {
    try {
      const info = await fs.getInfoAsync(path);
      if (info.exists) {
        const text = await fs.readAsStringAsync(path);
        svgTextCache[cp] = text;
        return text;
      }
    } catch {}
  }
  return null;
}

export async function getSvgPathData(char) {
  const text = await getSvgText(char);
  if (!text) return null;
  const cleaned = text.replace(/<g stroke="lightgray".*?<\/g>/, '');
  const pathRe = /d="([^"]+)"/g;
  const paths = [];
  let m;
  while ((m = pathRe.exec(cleaned)) !== null) {
    paths.push(m[1]);
  }
  return paths.length > 0 ? paths.join(' ') : null;
}

export function preloadSvg(char) {
  getSvgText(char).catch(() => {});
}