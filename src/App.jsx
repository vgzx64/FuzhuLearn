import { Provider, useSelector, useDispatch } from 'react-redux';
import { store, selectView, setView } from './store';
import Session from './components/Session';
import Words from './components/Words';
import './App.css';

function AppContent() {
  const view = useSelector(selectView);
  const dispatch = useDispatch();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Fuzhu Learn</h1>
        <nav className="app-nav">
          <button 
            className={view === 'learn' ? 'active' : ''} 
            onClick={() => dispatch(setView('learn'))}
          >
            Practice
          </button>
          <button 
            className={view === 'words' ? 'active' : ''} 
            onClick={() => dispatch(setView('words'))}
          >
            Words
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'learn' && <Session />}
        {view === 'words' && <Words />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}