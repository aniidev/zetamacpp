import { h, clear, fmtClock } from './dom.js';
import { generateQuestion, formatQuestion } from './questions.js';
import { extractCorrections } from './telemetry.js';
import { saveSession, newSessionId } from './storage.js';
import { createVoiceRecognizer, isVoiceSupported } from './voice.js';

// Runs one game session. On completion, saves to localStorage and calls
// onDone(session).
export function startGame(root, cfg, onDone) {
  const session = {
    id: newSessionId(),
    timestamp: Date.now(),
    config: cfg,
    score: 0,
    questions: [],
  };

  // --- UI ---------------------------------------------------------------
  const timerEl = h('div', { class: 'game-timer' }, fmtClock(cfg.duration));
  const scoreEl = h('div', { class: 'game-score' }, 'Score: 0');
  const questionEl = h('div', { class: 'game-question' }, '');
  const input = h('input', {
    class: 'game-input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    'aria-label': 'answer',
  });

  const voiceOn = cfg.voiceInput && isVoiceSupported();
  const voiceStatus = h('div', { class: 'voice-status' }, voiceOn ? '🎤 starting…' : '');

  const screen = h('div', { class: 'screen game-screen' }, [
    h('div', { class: 'game-hud' }, [
      h('div', { class: 'hud-block' }, [h('div', { class: 'hud-caption' }, 'Seconds left'), timerEl]),
      h('div', { class: 'hud-block hud-score' }, [scoreEl]),
    ]),
    h('div', { class: 'game-play' }, [
      h('div', { class: 'game-eq' }, [questionEl, h('span', { class: 'game-eq-sep' }, '='), input]),
      h('div', { class: 'game-hint' }, voiceOn
        ? 'Speak your answer — or type it. Advances automatically, no Enter needed.'
        : 'Type the answer — it advances automatically. No Enter needed.'),
      voiceOn ? voiceStatus : null,
      h('button', { class: 'btn btn-ghost btn-end', onclick: () => finish() }, 'End early'),
    ]),
  ]);
  clear(root).append(screen);
  input.focus();

  // --- Per-question state ----------------------------------------------
  let current = null;      // { operand1, operand2, operator, answer }
  let shownAt = 0;         // performance.now() when question rendered
  let firstKeyAt = null;   // performance.now() of first keystroke / spoken word
  let keystrokes = [];     // [{ key, t, fieldAfter }]
  let voiceResults = [];   // [{ value, transcript, t }] when answered by voice

  function nextQuestion() {
    current = generateQuestion(cfg);
    keystrokes = [];
    voiceResults = [];
    firstKeyAt = null;
    input.value = '';
    questionEl.textContent = formatQuestion(current);
    shownAt = performance.now();
    input.focus();
  }

  function commitQuestion() {
    const now = performance.now();
    const ctx = {
      answer: current.answer,
      operand1: current.operand1,
      operand2: current.operand2,
      operator: current.operator,
    };
    const record = {
      index: session.questions.length,
      operand1: current.operand1,
      operand2: current.operand2,
      operator: current.operator,
      answer: current.answer,
      shownAt,
      thinkTime: firstKeyAt != null ? firstKeyAt - shownAt : now - shownAt,
      totalTime: now - shownAt,
      keystrokes,
      voiceResults: voiceResults.slice(),
      inputMode: voiceResults.length ? 'voice' : 'keyboard',
      corrections: extractCorrections(keystrokes, ctx),
    };
    session.questions.push(record);
    session.score += 1;
    scoreEl.textContent = `Score: ${session.score}`;
    nextQuestion();
  }

  // --- Input capture (uses the `input` event so fieldAfter is post-mutation) ---
  input.addEventListener('input', (e) => {
    const t = performance.now();
    if (firstKeyAt == null) firstKeyAt = t;

    let key;
    switch (e.inputType) {
      case 'insertText': key = e.data; break;
      case 'insertFromPaste': key = e.data; break;
      case 'deleteContentBackward': key = 'Backspace'; break;
      case 'deleteContentForward': key = 'Delete'; break;
      default: key = e.inputType || 'unknown';
    }

    // Keep the field numeric-only; if a non-digit slipped in, strip it and
    // reflect that in the snapshot.
    if (/[^0-9]/.test(input.value)) {
      input.value = input.value.replace(/[^0-9]/g, '');
    }

    keystrokes.push({ key, t, fieldAfter: input.value });

    // Auto-advance the instant the field equals the answer.
    if (input.value !== '' && Number(input.value) === current.answer) {
      commitQuestion();
    }
  });

  // Block Enter (there is no submit) and prevent accidental form behavior.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  // --- Voice input ------------------------------------------------------
  // A recognized spoken number is shown in the field and, if it equals the
  // answer, advances the question. It bypasses the keystroke handler, so voice
  // answers carry a voiceResults trace instead of keystrokes/corrections.
  function handleVoiceNumber(num, transcript) {
    if (finished || current == null) return;
    const t = performance.now();
    if (firstKeyAt == null) firstKeyAt = t;
    voiceResults.push({ value: num, transcript, t });
    input.value = String(num);
    if (num === current.answer) {
      voiceStatus.textContent = `🎤 “${transcript}” ✓`;
      commitQuestion();
    } else {
      voiceStatus.textContent = `🎤 heard “${transcript}” → ${num}`;
    }
  }

  let voice = null;
  if (voiceOn) {
    voice = createVoiceRecognizer({
      onNumber: handleVoiceNumber,
      onStatus: (state) => {
        if (state === 'listening') voiceStatus.textContent = '🎤 listening…';
        else if (state === 'denied') voiceStatus.textContent = '🎤 mic blocked — type your answers';
        else if (state === 'error') voiceStatus.textContent = '🎤 voice error — type your answers';
      },
    });
    voice.start();
  }

  // --- Countdown --------------------------------------------------------
  const startTime = performance.now();
  const durationMs = cfg.duration * 1000;
  let finished = false;
  const tick = setInterval(() => {
    const remaining = (durationMs - (performance.now() - startTime)) / 1000;
    timerEl.textContent = fmtClock(remaining);
    if (remaining <= 0) finish();
  }, 100);

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(tick);
    if (voice) voice.stop();
    timerEl.textContent = '0:00';
    saveSession(session);
    onDone(session);
  }

  nextQuestion();
}
