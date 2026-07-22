// ---------------------------------------------------------------------------
// Correction-event classification.
//
// The classifier is a single PURE function so new rules can be added later
// without re-collecting data (raw keystroke traces + operands are always
// stored, so any question can be re-classified retroactively).
// ---------------------------------------------------------------------------

// Tunable thresholds — kept here so the rules are easy to extend/adjust.
export const THRESHOLDS = {
  // latency (ms) from committing a wrong value to the first backspace, below
  // which we treat the retraction as a fat-finger typo rather than a real error.
  typoLatencyMs: 350,
  // absolute |wrongValue - answer| still considered a plausible borrow/carry slip
  computationMaxDiff: 5,
  // off-by-a-power-of-ten carry slips (e.g. wrote 118 for 18) up to this magnitude
  carrySlipMax: 20,
};

export const CLASSES = {
  TYPO: 'typo',
  COMPUTATION: 'computation',
  BORROW_CARRY: 'borrow-carry',
  TRANSPOSITION: 'transposition',
  OPERATOR_CONFUSION: 'operator-confusion',
  UNCLASSIFIED: 'unclassified',
};

// Compute the result of applying `op` to (a, b), or null if it is not a
// valid non-negative integer result for that operator.
function computeOp(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b >= 0 ? a - b : null;
    case '*': return a * b;
    case '/': return b !== 0 && a % b === 0 ? a / b : null;
    default: return null;
  }
}

// Reverse the digit string, e.g. 63 -> 36. Returns a number or null.
function reverseDigits(n) {
  const s = String(n);
  const r = s.split('').reverse().join('');
  return Number(r);
}

// Digit-column subtraction bug ("smaller-from-larger"): the classic mistake of
// subtracting per column using |da - db| and ignoring borrows.
// e.g. 80 - 76 -> |8-7||0-6| = "16".
function columnSubtractionBug(a, b) {
  const A = String(Math.abs(a));
  const B = String(Math.abs(b));
  const L = Math.max(A.length, B.length);
  const pa = A.padStart(L, '0');
  const pb = B.padStart(L, '0');
  let out = '';
  for (let i = 0; i < L; i++) {
    out += String(Math.abs(Number(pa[i]) - Number(pb[i])));
  }
  return Number(out);
}

// Digit-column addition bug: adding per column as (da + db) mod 10 and dropping
// every carry. e.g. 47 + 8 -> 4 | (7+8)%10=5 -> "45".
function columnAdditionBug(a, b) {
  const A = String(Math.abs(a));
  const B = String(Math.abs(b));
  const L = Math.max(A.length, B.length);
  const pa = A.padStart(L, '0');
  const pb = B.padStart(L, '0');
  let out = '';
  for (let i = 0; i < L; i++) {
    out += String((Number(pa[i]) + Number(pb[i])) % 10);
  }
  return Number(out);
}

// Determine the arithmetic relationship between a wrong value and the question,
// independent of timing. Returns one of CLASSES.* or null.
export function arithmeticRelationship(wrongValue, ctx) {
  const { answer, operand1, operand2, operator } = ctx;
  const wrong = Number(wrongValue);
  if (!Number.isFinite(wrong)) return null;

  // 1. Operator confusion — the wrong value equals the result of a DIFFERENT
  //    operator applied to the same shown operands (and differs from the answer).
  for (const op of ['+', '-', '*', '/']) {
    if (op === operator) continue;
    const alt = computeOp(operand1, operand2, op);
    if (alt !== null && alt !== answer && alt === wrong) {
      return CLASSES.OPERATOR_CONFUSION;
    }
  }

  // 2. Transposition — digits of the answer reversed (multi-digit, non-palindrome).
  const s = String(answer);
  if (s.length >= 2) {
    const rev = reverseDigits(answer);
    if (rev !== answer && rev === wrong) {
      return CLASSES.TRANSPOSITION;
    }
  }

  // 3. Borrow / carry error — a digit-column mistake that ignores borrows
  //    (subtraction) or carries (addition). Catches large-diff cases that the
  //    small-diff computation rule below misses, e.g. 80 - 76 typed as "16".
  if (operator === '-') {
    const bug = columnSubtractionBug(operand1, operand2);
    if (bug !== answer && bug === wrong) return CLASSES.BORROW_CARRY;
  }
  if (operator === '+') {
    const bug = columnAdditionBug(operand1, operand2);
    if (bug !== answer && bug === wrong) return CLASSES.BORROW_CARRY;
  }

  // 4. Computation slip — small numeric diff (borrow/carry) or off-by-power-of-ten.
  const diff = Math.abs(wrong - answer);
  if (diff !== 0) {
    if (diff <= THRESHOLDS.computationMaxDiff) return CLASSES.COMPUTATION;
    if (diff % 10 === 0 && diff <= THRESHOLDS.carrySlipMax) return CLASSES.COMPUTATION;
  }

  return null;
}

// Main entry point. Classifies one correction event.
//   evt: { wrongValue, latencyBeforeBackspace }
//   ctx: { answer, operand1, operand2, operator }
// Returns a CLASSES.* string.
export function classifyCorrection(evt, ctx) {
  const rel = arithmeticRelationship(evt.wrongValue, ctx);

  // Operator confusion is a conceptual mistake — flag it regardless of timing.
  if (rel === CLASSES.OPERATOR_CONFUSION) return CLASSES.OPERATOR_CONFUSION;

  // Timing axis: a fast retraction is a fat-finger typo, not a math error.
  if (
    evt.latencyBeforeBackspace != null &&
    evt.latencyBeforeBackspace < THRESHOLDS.typoLatencyMs
  ) {
    return CLASSES.TYPO;
  }

  // Slow retraction -> a real error; use the arithmetic relationship to refine.
  if (rel) return rel;
  return CLASSES.UNCLASSIFIED;
}

export const CLASS_LABELS = {
  [CLASSES.TYPO]: 'Typo (fat-finger)',
  [CLASSES.COMPUTATION]: 'Computation error',
  [CLASSES.BORROW_CARRY]: 'Borrow / carry error',
  [CLASSES.TRANSPOSITION]: 'Transposition',
  [CLASSES.OPERATOR_CONFUSION]: 'Operator confusion',
  [CLASSES.UNCLASSIFIED]: 'Unclassified',
};

export const CLASS_COLORS = {
  [CLASSES.TYPO]: '#f0a500',
  [CLASSES.COMPUTATION]: '#e5484d',
  [CLASSES.BORROW_CARRY]: '#e0672e',
  [CLASSES.TRANSPOSITION]: '#8e4ec6',
  [CLASSES.OPERATOR_CONFUSION]: '#d6409f',
  [CLASSES.UNCLASSIFIED]: '#889096',
};
