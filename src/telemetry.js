import { classifyCorrection } from './classifier.js';

// A keystroke is a deletion if it removed characters from the field.
function isDelete(k) {
  return k.key === 'Backspace' || k.key === 'Delete';
}

// Reconstruct correction events for one question from its keystroke trace.
//
// Key insight: because the game auto-advances only when the field equals the
// answer, every stream ends on the correct value, so any backspace is an
// unambiguous retraction of a wrong entry (prefixes of the answer never need a
// backspace -> no false positives).
//
// A "correction event" is a maximal run of one or more consecutive deletions.
// The committed wrong value is the field content immediately BEFORE that run,
// read from the field-value SNAPSHOTS (fieldAfter) — not by replaying keys —
// so partial-delete-and-retype is handled correctly.
//
// keystrokes: [{ key, t, fieldAfter }]
// ctx:        { answer, operand1, operand2, operator }
export function extractCorrections(keystrokes, ctx) {
  const events = [];
  const n = keystrokes.length;
  let i = 0;

  while (i < n) {
    if (!isDelete(keystrokes[i])) {
      i++;
      continue;
    }

    // Start of a deletion run at index i.
    const runStart = i;
    const wrongValue = runStart > 0 ? keystrokes[runStart - 1].fieldAfter : '';
    const commitT = runStart > 0 ? keystrokes[runStart - 1].t : keystrokes[runStart].t;
    const firstBackspaceT = keystrokes[runStart].t;

    // Consume the rest of the run.
    let j = runStart + 1;
    while (j < n && isDelete(keystrokes[j])) j++;
    i = j;

    // Ignore degenerate runs (nothing committed before the delete).
    if (wrongValue === '' || !Number.isFinite(Number(wrongValue))) continue;

    const latencyBeforeBackspace = firstBackspaceT - commitT;
    const diff = Number(wrongValue) - ctx.answer;
    const evt = { wrongValue, diff, latencyBeforeBackspace };
    evt.classifiedType = classifyCorrection(evt, ctx);
    events.push(evt);
  }

  return events;
}

// Re-run the classifier over an already-recorded session (e.g. after adding a
// new rule). Returns a fresh session object; does not mutate the input.
export function reclassifySession(session) {
  const questions = session.questions.map((q) => {
    const ctx = {
      answer: q.answer,
      operand1: q.operand1,
      operand2: q.operand2,
      operator: q.operator,
    };
    return { ...q, corrections: extractCorrections(q.keystrokes, ctx) };
  });
  return { ...session, questions };
}
