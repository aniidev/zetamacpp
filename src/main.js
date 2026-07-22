import './styles.css';
import { defaultConfig } from './config.js';
import { renderConfig } from './configScreen.js';
import { startGame } from './game.js';
import { renderResults } from './results.js';
import { renderHistory } from './history.js';
import { getSession } from './storage.js';

const root = document.getElementById('app');

// Remember the last-used config so "Play again" reuses it.
let lastConfig = defaultConfig();

function showConfig() {
  renderConfig(root, lastConfig, {
    onStart: (cfg) => { lastConfig = cfg; showGame(cfg); },
    onHistory: showHistory,
  });
}

function showGame(cfg) {
  startGame(root, cfg, (session) => showResults(session));
}

function showResults(session) {
  renderResults(root, session, {
    onReplay: () => showGame(lastConfig),
    onConfig: showConfig,
    onHistory: showHistory,
  });
}

function showHistory() {
  renderHistory(root, {
    onConfig: showConfig,
    onOpenSession: (id) => {
      const s = getSession(id);
      if (s) showResults(s);
    },
  });
}

showConfig();
