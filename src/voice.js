// Voice input via the Web Speech API (SpeechRecognition). Lets the player speak
// answers instead of typing. Chrome/Edge only; callers must feature-detect.

const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export function isVoiceSupported() {
  return !!Recognition;
}

// --- spoken-number parsing --------------------------------------------------

const ONES = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  // common recognizer homophones (the player is only ever saying numbers here)
  won: 1, to: 2, too: 2, for: 4, ate: 8,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Convert a spoken phrase to an integer, or null if none found.
// Handles digits ("56"), words ("fifty six"), and mixes ("twelve hundred",
// "one hundred twenty", "a hundred").
//
// If the phrase contains SEVERAL separate numbers — e.g. the player restates
// their answer, "fifty four ... sixty four" or "54 64" — the numbers are NOT
// summed. They are split into groups and the LAST spoken number is returned
// (that's the player's final answer).
export function wordsToNumber(text) {
  if (text == null) return null;
  const tokens = String(text)
    .toLowerCase()
    .replace(/[-,]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const groups = [];
  let total = 0;       // thousands and above for the current group
  let current = 0;     // sub-group being built
  let prevMag = null;  // magnitude of the previous non-scale word (2=tens, 1=ones/teens)
  let hasContent = false;

  const flush = () => {
    if (hasContent) groups.push(total + current);
    total = 0; current = 0; prevMag = null; hasContent = false;
  };

  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      // A spoken digit-run (e.g. "54") is a complete number on its own — a new
      // one starts a new group.
      if (hasContent) flush();
      current += parseInt(tok, 10);
      prevMag = 0;
      hasContent = true;
    } else if (tok === 'hundred') {
      current = (current || 1) * 100;
      prevMag = null; // a smaller word may follow ("hundred twenty")
      hasContent = true;
    } else if (tok === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      prevMag = null;
      hasContent = true;
    } else {
      const val = tok in ONES ? ONES[tok] : tok in TENS ? TENS[tok] : null;
      if (val == null) continue; // 'a', 'and', filler
      const mag = tok in TENS ? 2 : 1; // tens vs ones/teens
      // Within one number, magnitudes strictly decrease (tens then ones). If
      // this word can't extend the current number, it begins a new one.
      if (prevMag !== null && mag >= prevMag) flush();
      current += val;
      prevMag = mag;
      hasContent = true;
    }
  }
  flush();

  if (!groups.length) return null;
  const value = groups[groups.length - 1];
  return Number.isFinite(value) ? value : null;
}

// --- recognizer wrapper -----------------------------------------------------

// Creates a continuous recognizer. Calls onNumber(value, transcript) for each
// finalized utterance that parses to a number, and onStatus(state) for UI.
// Returns { start, stop, supported }.
export function createVoiceRecognizer({ onNumber, onStatus = () => {} }) {
  if (!Recognition) return { start() {}, stop() {}, supported: false };

  const rec = new Recognition();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = false; // final results only, to avoid premature matches
  rec.maxAlternatives = 1;

  let active = false;

  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const transcript = result[0].transcript.trim();
      const num = wordsToNumber(transcript);
      if (num != null) onNumber(num, transcript);
    }
  };

  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      active = false;
      onStatus('denied');
    } else if (e.error === 'no-speech' || e.error === 'aborted') {
      // transient — onend will restart if still active
    } else {
      onStatus('error');
    }
  };

  // Chrome stops recognition after silence; restart while the game is running.
  rec.onend = () => {
    if (!active) return;
    try { rec.start(); } catch { /* already starting */ }
  };

  return {
    supported: true,
    start() {
      if (active) return;
      active = true;
      try { rec.start(); onStatus('listening'); } catch { /* already started */ }
    },
    stop() {
      active = false;
      try { rec.stop(); } catch { /* not running */ }
      onStatus('off');
    },
  };
}
