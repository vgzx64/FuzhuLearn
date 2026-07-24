import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Linking, Platform } from 'react-native';

// ponytail: fetches dictionary usage examples for a character.
// dictionary.txt is in public/ — served as static file on web, read from bundle on native.

const DICT_URL = 'https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=';

let dictTextCache = null;

async function getDictText() {
  if (dictTextCache) return dictTextCache;

  if (Platform.OS === 'web') {
    try {
      const resp = await fetch('/dictionary.txt');
      if (resp.ok) {
        dictTextCache = await resp.text();
        return dictTextCache;
      }
    } catch {}
    return '';
  }

  // Native: read from bundle (Expo copies public/ into the app)
  try {
    const FileSystem = require('expo-file-system');
    const paths = [
      `${FileSystem.bundleDirectory}dictionary.txt`,
      `${FileSystem.documentDirectory}dictionary.txt`,
    ];
    for (const path of paths) {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        dictTextCache = await FileSystem.readAsStringAsync(path);
        return dictTextCache;
      }
    }
  } catch {}
  return '';
}

async function fetchUsage(char) {
  const text = await getDictText();
  if (!text) return [];
  const results = [];
  for (const line of text.split('\n')) {
    if (line.includes(char)) {
      results.push(line.trim());
    }
  }
  return results;
}

export default function UsageInfo({ char }) {
  const [lines, setLines] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!char) return;
    setLines(null);
    setError(false);
    fetchUsage(char).then(setLines).catch(() => setError(true));
  }, [char]);

  if (!char) return null;
  if (error) return null;
  if (!lines) return <Text style={s.loading}>Loading usage...</Text>;
  if (lines.length === 0) return <Text style={s.empty}>No usage examples found.</Text>;

  return (
    <View style={s.container}>
      <Text style={s.label}>Usage:</Text>
      {lines.slice(0, 3).map((line, i) => (
        <Text key={i} style={s.item}>{line}</Text>
      ))}
      <TouchableOpacity onPress={() => Linking.openURL(DICT_URL + encodeURIComponent(char))}>
        <Text style={s.link}>Open in dictionary →</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = {
  container: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e0d8c8' },
  label: { fontWeight: '600', color: '#333', marginBottom: 6, fontSize: 13 },
  item: { paddingVertical: 2, color: '#777', fontSize: 13 },
  loading: { color: '#777', fontStyle: 'italic', paddingVertical: 4, fontSize: 13 },
  empty: { color: '#777', fontStyle: 'italic', paddingVertical: 4, fontSize: 13 },
  link: { color: '#4a6fa5', fontSize: 12, marginTop: 4, textDecorationLine: 'underline' },
};