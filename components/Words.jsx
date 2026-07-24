import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, StyleSheet } from 'react-native';
import hanziData from '../data/hanzi-index.json';
import { getLevelStats, getHanziStatus, markHanziLearned, markHanziWrong, isLevelComplete, markLevelComplete } from '../utils/progress';
import StrokePlayer from './StrokePlayer';

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const FILTERS = ['all', 'new', 'learning', 'learned'];

export default function Words() {
  const [refresh, setRefresh] = useState(0);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [detailChar, setDetailChar] = useState(null);
  const [stats, setStats] = useState({});
  const [levelComplete, setLevelComplete] = useState({});
  const [hanziStatuses, setHanziStatuses] = useState({});

  const rerender = () => setRefresh(r => r + 1);

  // Load all async data on mount and after refresh
  useEffect(() => {
    async function load() {
      const s = {}, lc = {}, hs = {};
      for (const level of LEVELS) {
        s[level] = await getLevelStats(level, hanziData);
        lc[level] = await isLevelComplete(level);
      }
      for (const h of hanziData) {
        hs[h.c] = await getHanziStatus(h.c);
      }
      setStats(s);
      setLevelComplete(lc);
      setHanziStatuses(hs);
    }
    load();
  }, [refresh]);

  function getVisibleChars(level) {
    let list = hanziData.filter(h => h.l === level);
    if (filter !== 'all') {
      list = list.filter(h => hanziStatuses[h.c]?.status === filter);
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

  const toggleLevel = (level) => {
    setExpandedLevel(expandedLevel === level ? null : level);
    setFilter('all');
    setSearch('');
  };

  // Counts for summary
  let totalAll = 0, learnedAll = 0;
  for (const h of hanziData) {
    if (hanziStatuses[h.c]?.status === 'learned') learnedAll++;
    totalAll++;
  }

  return (
    <ScrollView style={styles.words} contentContainerStyle={styles.wordsContent}>
      <Text style={styles.title}>Words</Text>
      <Text style={styles.summary}>{learnedAll} / {totalAll} characters learned</Text>

      {expandedLevel !== null && (
        <View style={styles.toolbar}>
          <TextInput
            style={styles.search}
            placeholder="Search pinyin or meaning..."
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.filters}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.levels}>
        {LEVELS.map(level => {
          const levelStats = stats[level] || { total: 0, learned: 0, pct: 0 };
          const completed = levelComplete[level] || false;
          const chars = getVisibleChars(level);
          const isOpen = expandedLevel === level;

          return (
            <View key={level} style={[styles.level, completed && styles.levelCompleted, isOpen && styles.levelOpen]}>
              <TouchableOpacity style={styles.levelHeader} onPress={() => toggleLevel(level)}>
                <View style={styles.levelTitleRow}>
                  <Text style={styles.levelTitle}>HSK {level} <Text style={styles.expandIcon}>{isOpen ? '▼' : '▶'}</Text></Text>
                  <Text style={styles.levelCount}>{levelStats.learned} / {levelStats.total}</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${levelStats.pct}%` }]} />
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.levelBody}>
                  <View style={styles.levelActions}>
                    <TouchableOpacity style={styles.btnSmall} onPress={async () => {
                      for (const h of chars) await markHanziLearned(h.c);
                      rerender();
                    }}>
                      <Text style={styles.btnSmallText}>Mark all visible as learned</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSmall, completed && styles.btnSmallDisabled]}
                      onPress={async () => { await markLevelComplete(level); rerender(); }}
                      disabled={completed}
                    >
                      <Text style={styles.btnSmallText}>{completed ? '✓ Complete' : 'Mark level complete'}</Text>
                    </TouchableOpacity>
                  </View>

                  {chars.length === 0 ? (
                    <Text style={styles.empty}>No characters match this filter.</Text>
                  ) : (
                    <View style={styles.grid}>
                      {chars.map(h => {
                        const s = hanziStatuses[h.c] || { status: 'new' };
                        return (
                          <TouchableOpacity
                            key={h.c}
                            style={[styles.charCard, s.status === 'learned' && styles.charCardLearned, s.status === 'learning' && styles.charCardLearning]}
                            onPress={() => setDetailChar(h)}
                          >
                            <Text style={styles.charText}>{h.c}</Text>
                            <Text style={styles.charPinyin}>{h.p}</Text>
                            <Text style={styles.charStatus}>
                              {s.status === 'learned' ? '✓' : s.status === 'learning' ? '○' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Character detail modal */}
      <Modal visible={!!detailChar} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setDetailChar(null)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetailChar(null)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
            {detailChar && (
              <>
                <Text style={styles.modalChar}>{detailChar.c}</Text>
                <StrokePlayer char={detailChar.c} playing={true} width={160} height={160} />
                <Text style={styles.pinyin}>{detailChar.p}</Text>
                <Text style={styles.meaning}>{detailChar.m}</Text>
                <View style={styles.modalActions}>
                  {(hanziStatuses[detailChar.c]?.status) === 'learned' ? (
                    <TouchableOpacity style={styles.btnCorrect} onPress={async () => { await markHanziWrong(detailChar.c); rerender(); }}>
                      <Text style={styles.btnCorrectText}>✓ Learned (tap to unlearn)</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.btnPrimary} onPress={async () => { await markHanziLearned(detailChar.c); rerender(); }}>
                      <Text style={styles.btnPrimaryText}>Mark learned</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  words: { flex: 1 },
  wordsContent: { paddingBottom: 40 },
  title: { fontSize: 17, marginBottom: 8 },
  summary: { color: '#4a6fa5', fontSize: 16, marginBottom: 16 },
  toolbar: { marginBottom: 12 },
  search: { borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 8, padding: 8, fontSize: 14, backgroundColor: '#fff', marginBottom: 8 },
  filters: { flexDirection: 'row', gap: 4 },
  filterBtn: { paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 14, backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: '#4a6fa5', borderColor: '#4a6fa5' },
  filterBtnText: { fontSize: 12, color: '#777' },
  filterBtnTextActive: { color: '#fff' },
  levels: { gap: 12 },
  level: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 10, padding: 12 },
  levelCompleted: { borderColor: '#4caf50', backgroundColor: '#f0faf0' },
  levelOpen: { shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  levelHeader: {},
  levelTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  levelTitle: { fontSize: 15, fontWeight: '600' },
  expandIcon: { fontSize: 10, color: '#777', marginLeft: 6 },
  levelCount: { fontSize: 13, color: '#777' },
  progressBar: { height: 8, backgroundColor: '#eeeae0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#4a6fa5', borderRadius: 4 },
  levelBody: { marginTop: 8 },
  levelActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e8d5b7', borderRadius: 8 },
  btnSmallDisabled: { opacity: 0.5 },
  btnSmallText: { fontSize: 12, color: '#333' },
  empty: { textAlign: 'center', color: '#777', fontSize: 13, padding: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  charCard: { alignItems: 'center', padding: 8, borderWidth: 1, borderColor: '#e0d8c8', borderRadius: 8, backgroundColor: '#fff', minWidth: 80 },
  charCardLearned: { borderColor: '#4caf50', backgroundColor: '#f0faf0' },
  charCardLearning: { borderColor: '#e8a040' },
  charText: { fontSize: 22, lineHeight: 28 },
  charPinyin: { fontSize: 10, color: '#777', maxWidth: '100%', overflow: 'hidden' },
  charStatus: { fontSize: 11, color: '#777' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, padding: 24, maxWidth: 340, width: '100%', alignItems: 'center', gap: 10 },
  modalClose: { position: 'absolute', top: 8, right: 10, padding: 4 },
  modalCloseText: { fontSize: 19, color: '#777' },
  modalChar: { fontSize: 64, lineHeight: 76 },
  pinyin: { fontSize: 19, color: '#4a6fa5', fontStyle: 'italic', marginBottom: 4 },
  meaning: { fontSize: 15, color: '#777' },
  modalActions: { marginTop: 4 },
  btnPrimary: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#4a6fa5', borderRadius: 8, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  btnCorrect: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#4caf50', borderRadius: 8, alignItems: 'center' },
  btnCorrectText: { color: '#fff', fontSize: 15 },
});