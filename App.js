import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { store, selectView, setView } from './store';
import Session from './components/Session';
import Words from './components/Words';

function AppContent() {
  const view = useSelector(selectView);
  const dispatch = useDispatch();

  return (
    <View style={styles.app}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Fuzhu Learn</Text>
        <View style={styles.nav}>
          <TouchableOpacity
            style={[styles.navBtn, view === 'learn' && styles.navBtnActive]}
            onPress={() => dispatch(setView('learn'))}
          >
            <Text style={[styles.navBtnText, view === 'learn' && styles.navBtnTextActive]}>Practice</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, view === 'words' && styles.navBtnActive]}
            onPress={() => dispatch(setView('words'))}
          >
            <Text style={[styles.navBtnText, view === 'words' && styles.navBtnTextActive]}>Words</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.main}>
        {view === 'learn' && <Session />}
        {view === 'words' && <Words />}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#fafaf5',
    paddingTop: 50,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0d8c8',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4a6fa5',
  },
  nav: {
    flexDirection: 'row',
    gap: 4,
  },
  navBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e0d8c8',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  navBtnActive: {
    backgroundColor: '#4a6fa5',
    borderColor: '#4a6fa5',
  },
  navBtnText: {
    fontSize: 13,
    color: '#777',
  },
  navBtnTextActive: {
    color: '#fff',
  },
  main: {
    flex: 1,
  },
});