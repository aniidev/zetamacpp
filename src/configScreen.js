import { h, clear } from './dom.js';
import { defaultConfig, DURATIONS, enabledOperators } from './config.js';
import { isVoiceSupported } from './voice.js';

// Renders the pre-game config screen. Calls onStart(cfg) and onHistory().
export function renderConfig(root, initialCfg, { onStart, onHistory }) {
  const cfg = structuredClone(initialCfg || defaultConfig());

  function numField(getVal, setVal, min = 0) {
    const inp = h('input', {
      class: 'range-input', type: 'number', min: String(min), value: String(getVal()),
    });
    inp.addEventListener('input', () => {
      const v = parseInt(inp.value, 10);
      if (Number.isFinite(v)) setVal(v);
    });
    return inp;
  }

  function toggle(getVal, setVal, label) {
    const cb = h('input', { type: 'checkbox', class: 'op-toggle', checked: getVal() });
    cb.addEventListener('change', () => { setVal(cb.checked); refreshStartState(); });
    return h('label', { class: 'op-enable' }, [cb, h('span', {}, label)]);
  }

  // Addition row
  const addRow = h('div', { class: 'op-row' }, [
    toggle(() => cfg.addition.enabled, (v) => (cfg.addition.enabled = v), 'Addition'),
    h('div', { class: 'op-ranges' }, [
      numField(() => cfg.addition.a, (v) => (cfg.addition.a = v)),
      h('span', { class: 'op-to' }, 'to'),
      numField(() => cfg.addition.b, (v) => (cfg.addition.b = v)),
      h('span', { class: 'op-plus' }, '+'),
      numField(() => cfg.addition.c, (v) => (cfg.addition.c = v)),
      h('span', { class: 'op-to' }, 'to'),
      numField(() => cfg.addition.d, (v) => (cfg.addition.d = v)),
    ]),
  ]);

  // Subtraction row (derived from addition)
  const subRow = h('div', { class: 'op-row' }, [
    toggle(() => cfg.subtraction.enabled, (v) => (cfg.subtraction.enabled = v), 'Subtraction'),
    h('div', { class: 'op-ranges op-derived' }, [
      h('span', { class: 'derived-note' }, 'Addition problems in reverse (results stay ≥ 0, integer)'),
    ]),
  ]);

  // Multiplication row
  const mulRow = h('div', { class: 'op-row' }, [
    toggle(() => cfg.multiplication.enabled, (v) => (cfg.multiplication.enabled = v), 'Multiplication'),
    h('div', { class: 'op-ranges' }, [
      numField(() => cfg.multiplication.a, (v) => (cfg.multiplication.a = v)),
      h('span', { class: 'op-to' }, 'to'),
      numField(() => cfg.multiplication.b, (v) => (cfg.multiplication.b = v)),
      h('span', { class: 'op-plus' }, '×'),
      numField(() => cfg.multiplication.c, (v) => (cfg.multiplication.c = v)),
      h('span', { class: 'op-to' }, 'to'),
      numField(() => cfg.multiplication.d, (v) => (cfg.multiplication.d = v)),
    ]),
  ]);

  // Division row (derived from multiplication)
  const divRow = h('div', { class: 'op-row' }, [
    toggle(() => cfg.division.enabled, (v) => (cfg.division.enabled = v), 'Division'),
    h('div', { class: 'op-ranges op-derived' }, [
      h('span', { class: 'derived-note' }, 'Multiplication problems in reverse (exact integer quotients)'),
    ]),
  ]);

  // Duration selector
  const durSelect = h('select', { class: 'duration-select' },
    DURATIONS.map((d) => h('option', { value: String(d), selected: d === cfg.duration }, `${d} seconds`)));
  durSelect.addEventListener('change', () => { cfg.duration = parseInt(durSelect.value, 10); });

  const startBtn = h('button', { class: 'btn btn-primary btn-start' }, 'Start');
  startBtn.addEventListener('click', () => {
    if (!enabledOperators(cfg).length) return;
    onStart(structuredClone(cfg));
  });

  function refreshStartState() {
    const ok = enabledOperators(cfg).length > 0;
    startBtn.disabled = !ok;
    startBtn.textContent = ok ? 'Start' : 'Enable an operation';
  }

  // Voice input toggle — only offered where the Web Speech API exists.
  const voiceSupported = isVoiceSupported();
  const voiceCb = h('input', {
    type: 'checkbox', class: 'op-toggle', checked: cfg.voiceInput && voiceSupported,
    disabled: !voiceSupported,
  });
  voiceCb.addEventListener('change', () => { cfg.voiceInput = voiceCb.checked; });
  const voiceRow = h('div', { class: 'op-row voice-row' }, [
    h('label', { class: 'op-enable' }, [
      voiceCb,
      h('span', {}, '🎤 Voice answers'),
    ]),
    h('span', { class: 'derived-note' },
      voiceSupported
        ? 'Speak your answer instead of typing (you can still type as a fallback)'
        : 'Not supported in this browser — use Chrome or Edge'),
  ]);

  const screen = h('div', { class: 'screen config-screen' }, [
    h('header', { class: 'app-header' }, [
      h('h1', { class: 'app-title' }, 'Zetamac++'),
      h('p', { class: 'app-subtitle' }, 'Arithmetic speed drill with keystroke-level error & timing telemetry'),
    ]),
    h('div', { class: 'config-card' }, [
      addRow, subRow, mulRow, divRow,
      h('div', { class: 'op-row duration-row' }, [
        h('span', { class: 'op-enable-label' }, 'Duration'),
        durSelect,
      ]),
      voiceRow,
    ]),
    h('div', { class: 'config-actions' }, [
      startBtn,
      h('button', { class: 'btn', onclick: onHistory }, 'History'),
    ]),
    h('p', { class: 'config-foot muted' }, 'No submit button — the question advances the instant your answer is correct.'),
  ]);

  refreshStartState();
  clear(root).append(screen);
  durSelect.value = String(cfg.duration);
}
