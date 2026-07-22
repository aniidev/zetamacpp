import { CLASSES } from './classifier.js';
import { OP_SYMBOL } from './questions.js';

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// percentile (0..100) using nearest-rank on a sorted copy
function percentile(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * s.length);
  return s[Math.min(rank, s.length) - 1];
}

const OPERATORS = ['+', '-', '*', '/'];

// A question "had an error" if it recorded >=1 correction event.
function hadError(q) {
  return q.corrections && q.corrections.length > 0;
}

// Per-operation breakdown: count, mean time, error rate.
function perOperation(questions) {
  const out = {};
  for (const op of OPERATORS) {
    const qs = questions.filter((q) => q.operator === op);
    out[op] = {
      symbol: OP_SYMBOL[op],
      count: qs.length,
      meanTime: mean(qs.map((q) => q.totalTime)),
      errorRate: qs.length ? qs.filter(hadError).length / qs.length : 0,
      errorCount: qs.filter(hadError).length,
    };
  }
  return out;
}

// Slowest fact patterns, bucketed by operand pair, ranked by mean total time.
function slowestFacts(questions, topN = 12) {
  const buckets = new Map();
  for (const q of questions) {
    const key = `${q.operand1} ${OP_SYMBOL[q.operator]} ${q.operand2}`;
    if (!buckets.has(key)) {
      buckets.set(key, { key, operator: q.operator, times: [], errors: 0 });
    }
    const b = buckets.get(key);
    b.times.push(q.totalTime);
    if (hadError(q)) b.errors++;
  }
  return [...buckets.values()]
    .map((b) => ({
      key: b.key,
      operator: b.operator,
      count: b.times.length,
      meanTime: mean(b.times),
      maxTime: Math.max(...b.times),
      errors: b.errors,
    }))
    .sort((a, b) => b.meanTime - a.meanTime)
    .slice(0, topN);
}

// Think time (to first keystroke) vs type time (first keystroke -> advance).
function thinkVsType(questions) {
  const think = questions.map((q) => q.thinkTime);
  const type = questions.map((q) => Math.max(0, q.totalTime - q.thinkTime));
  return {
    meanThink: mean(think),
    meanType: mean(type),
    totalThink: think.reduce((a, b) => a + b, 0),
    totalType: type.reduce((a, b) => a + b, 0),
  };
}

// Latency distribution over per-question total time (worst-freeze focus).
function latencyDistribution(questions) {
  const times = questions.map((q) => q.totalTime);
  return {
    mean: mean(times),
    median: median(times),
    p90: percentile(times, 90),
    p95: percentile(times, 95),
    max: times.length ? Math.max(...times) : 0,
  };
}

// Fatigue curve: split questions (in answer order) into first/middle/last third.
function fatigueCurve(questions) {
  const n = questions.length;
  if (n === 0) return { first: null, middle: null, last: null };
  const third = Math.ceil(n / 3);
  const slice = (arr) => ({
    count: arr.length,
    meanTime: mean(arr.map((q) => q.totalTime)),
    errorRate: arr.length ? arr.filter(hadError).length / arr.length : 0,
  });
  return {
    first: slice(questions.slice(0, third)),
    middle: slice(questions.slice(third, 2 * third)),
    last: slice(questions.slice(2 * third)),
  };
}

// Error-type distribution across all correction events.
function errorTypeDistribution(questions) {
  const dist = {
    [CLASSES.TYPO]: 0,
    [CLASSES.COMPUTATION]: 0,
    [CLASSES.BORROW_CARRY]: 0,
    [CLASSES.TRANSPOSITION]: 0,
    [CLASSES.OPERATOR_CONFUSION]: 0,
    [CLASSES.UNCLASSIFIED]: 0,
  };
  let total = 0;
  for (const q of questions) {
    for (const c of q.corrections || []) {
      dist[c.classifiedType] = (dist[c.classifiedType] || 0) + 1;
      total++;
    }
  }
  return { dist, total };
}

// Build the full summary for a completed session.
export function computeSummary(session) {
  const questions = session.questions;
  const questionsWithErrors = questions.filter(hadError).length;
  const totalCorrections = questions.reduce(
    (a, q) => a + (q.corrections ? q.corrections.length : 0),
    0
  );
  return {
    score: session.score,
    answered: questions.length,
    duration: session.config.duration,
    questionsWithErrors,
    totalCorrections,
    perOperation: perOperation(questions),
    slowestFacts: slowestFacts(questions),
    thinkVsType: thinkVsType(questions),
    latency: latencyDistribution(questions),
    fatigue: fatigueCurve(questions),
    errorTypes: errorTypeDistribution(questions),
  };
}

// Aggregate stats across MANY sessions, for the history view.
// - perOperation is pooled over every question of all sessions (weighted by count).
// - fatigue is averaged across sessions: each session's within-drill first/middle/
//   last-third curve is computed, then averaged, so the shape reflects per-drill
//   degradation rather than the concatenation of drills.
// - errorTypes and thinkVsType are pooled over all questions.
export function aggregateSessions(sessions) {
  const allQuestions = sessions.flatMap((s) => s.questions);

  const perSessionFatigue = sessions
    .map((s) => fatigueCurve(s.questions))
    .filter((f) => f.first || f.middle || f.last);

  const avgPhase = (key) => {
    const vals = perSessionFatigue.map((f) => f[key]).filter((v) => v && v.count);
    if (!vals.length) return null;
    return {
      meanTime: mean(vals.map((v) => v.meanTime)),
      errorRate: mean(vals.map((v) => v.errorRate)),
      sessions: vals.length,
    };
  };

  return {
    sessionCount: sessions.length,
    totalAnswered: allQuestions.length,
    perOperation: perOperation(allQuestions),
    fatigue: { first: avgPhase('first'), middle: avgPhase('middle'), last: avgPhase('last') },
    thinkVsType: thinkVsType(allQuestions),
    errorTypes: errorTypeDistribution(allQuestions),
  };
}

export { mean, median, percentile };
