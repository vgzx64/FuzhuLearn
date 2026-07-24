import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

// ponytail: dev-only debug panel. Same as web version but with RN components.

export default function DebugPanel({ currentChar, strokes, lookupResult, strokeCheck, sm2Status }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <View style={s.bar}>
        <TouchableOpacity onPress={() => setOpen(true)} style={s.toggle}>
          <Text style={s.toggleText}>🐛 Debug</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.panel}>
      <View style={s.header}>
        <Text style={s.title}>Debug Panel</Text>
        <TouchableOpacity onPress={() => setOpen(false)}>
          <Text style={s.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ maxHeight: 300 }}>
        <View style={s.section}>
          <Text style={s.label}>Current Character</Text>
          <Text style={s.row}>{currentChar ? JSON.stringify(currentChar) : 'null'}</Text>
        </View>

        {strokes && (
          <View style={s.section}>
            <Text style={s.label}>Raw Strokes ({strokes.length})</Text>
            <Text style={s.pre}>{JSON.stringify(strokes).slice(0, 500)}</Text>
          </View>
        )}

        {lookupResult && (
          <View style={s.section}>
            <Text style={s.label}>Lookup Result</Text>
            <Text style={s.row}>Score: {lookupResult.score}</Text>
            <Text style={s.row}>Correct index: {lookupResult.correctIndex}</Text>
            <Text style={s.label}>Matches:</Text>
            {lookupResult.matches.slice(0, 5).map((m, i) => (
              <Text key={i} style={[s.row, m.hanzi === currentChar?.c ? { backgroundColor: '#f0faf0' } : null]}>
                {m.hanzi} — {Math.round(m.score * 100)}%
              </Text>
            ))}
          </View>
        )}

        {strokeCheck && (
          <View style={s.section}>
            <Text style={s.label}>Stroke Check</Text>
            <Text style={s.row}>Match: {strokeCheck.match ? '✓' : '✗'}</Text>
            <Text style={s.row}>Score: {Math.round(strokeCheck.score * 100)}%</Text>
            {strokeCheck.perStroke.map((ps, i) => (
              <Text key={i} style={[s.row, ps.ok ? { color: '#4caf50' } : { color: '#e74c3c' }]}>
                Stroke {ps.index + 1}: {ps.ok ? '✓' : '✗'} {ps.extra ? '(extra)' : ps.missing ? '(missing)' : `${ps.error}°`}
              </Text>
            ))}
          </View>
        )}

        {sm2Status && (
          <View style={s.section}>
            <Text style={s.label}>SM-2 Status</Text>
            <Text style={s.row}>Status: {sm2Status.status}</Text>
            <Text style={s.row}>EF: {sm2Status.ef}</Text>
            <Text style={s.row}>Interval: {sm2Status.interval}</Text>
            <Text style={s.row}>Reps: {sm2Status.reps}</Text>
            <Text style={s.row}>Next review: {sm2Status.nextReview || 'now'}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = {
  bar: { marginBottom: 8 },
  toggle: { paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0d8c8', borderStyle: 'dashed', borderRadius: 6, alignSelf: 'flex-start' },
  toggleText: { fontSize: 12, color: '#777' },
  panel: { marginBottom: 12, padding: 10, borderWidth: 1, borderColor: '#e0a0a0', borderStyle: 'dashed', borderRadius: 8, backgroundColor: '#fff8f8' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontWeight: '600', fontSize: 13, color: '#333' },
  close: { fontSize: 16, color: '#777', paddingHorizontal: 4 },
  section: { marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f0e0e0' },
  label: { fontWeight: '600', color: '#333', marginBottom: 3, fontSize: 12 },
  row: { color: '#777', fontSize: 11, marginVertical: 1 },
  pre: { backgroundColor: '#f5f0f0', padding: 6, borderRadius: 4, fontSize: 11, maxHeight: 120, color: '#333', overflow: 'hidden' },
};