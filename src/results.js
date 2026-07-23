import { h, clear, fmtMs, fmtPct, fmtDate } from './dom.js';
import { computeSummary } from './stats.js';
import { timelineChart, barChart } from './charts.js';
import { CLASS_LABELS, CLASS_COLORS, CLASSES } from './classifier.js';
import { OP_SYMBOL, formatQuestion } from './questions.js';

const OP_NAMES = { '+': 'Addition', '-': 'Subtraction', '*': 'Multiplication', '/': 'Division' };

function statTile(caption, value, sub) {
  return h('div', { class: 'stat-tile' }, [
    h('div', { class: 'stat-value' }, value),
    h('div', { class: 'stat-caption' }, caption),
    sub ? h('div', { class: 'stat-sub' }, sub) : null,
  ]);
}

function section(title, ...body) {
  return h('section', { class: 'results-section' }, [
    h('h3', { class: 'section-title' }, title),
    ...body,
  ]);
}

// Detail panel for a single question.
function questionDetail(q) {
  const rows = [];
  rows.push(h('div', { class: 'detail-headline' }, `${formatQuestion(q)} = ${q.answer}`));
  rows.push(h('div', { class: 'detail-meta' }, [
    h('span', {}, `Q${q.index + 1}`),
    h('span', {}, `think ${fmtMs(q.thinkTime)}`),
    h('span', {}, `total ${fmtMs(q.totalTime)}`),
    h('span', {}, `type ${fmtMs(Math.max(0, q.totalTime - q.thinkTime))}`),
  ]));

  // correction events
  if (q.corrections && q.corrections.length) {
    const list = h('div', { class: 'detail-corrections' }, q.corrections.map((c) =>
      h('div', { class: 'correction-item' }, [
        h('span', { class: 'chip', style: { background: CLASS_COLORS[c.classifiedType] } }, CLASS_LABELS[c.classifiedType]),
        h('span', { class: 'correction-detail' },
          `typed "${c.wrongValue}" (diff ${c.diff > 0 ? '+' : ''}${c.diff}), retracted after ${fmtMs(c.latencyBeforeBackspace)}`),
      ])
    ));
    rows.push(h('div', { class: 'detail-sub' }, 'Correction events'));
    rows.push(list);
  } else {
    rows.push(h('div', { class: 'detail-clean' }, 'Clean — no corrections.'));
  }

  // voice trace (present when answered by voice)
  if (q.voiceResults && q.voiceResults.length) {
    const vlist = q.voiceResults.map((v) => {
      const rel = Math.round(v.t - q.shownAt);
      const hit = v.value === q.answer;
      return h('span', {
        class: hit ? 'keystroke voice-hit' : 'keystroke',
        title: `${rel}ms`,
      }, `“${v.transcript}” → ${v.value}`);
    });
    rows.push(h('div', { class: 'detail-sub' }, `🎤 Voice trace (${q.voiceResults.length})`));
    rows.push(h('div', { class: 'keystroke-trace' }, vlist));
  }

  // keystroke trace
  const trace = q.keystrokes.map((k) => {
    const label = k.key === 'Backspace' ? '⌫' : k.key === 'Delete' ? '⌦' : k.key;
    const rel = Math.round(k.t - q.shownAt);
    return h('span', { class: 'keystroke', title: `${rel}ms — field: "${k.fieldAfter}"` }, label);
  });
  rows.push(h('div', { class: 'detail-sub' }, `Keystroke trace (${q.keystrokes.length})`));
  rows.push(h('div', { class: 'keystroke-trace' }, trace.length ? trace : [h('span', { class: 'muted' }, 'none')]));

  return h('div', { class: 'detail-body' }, rows);
}

export function renderResults(root, session, { onReplay, onHistory, onConfig }) {
  const summary = computeSummary(session);

  // ----- header / headline stats -----
  const headline = h('div', { class: 'stat-grid' }, [
    statTile('Score', String(summary.score), `${summary.duration}s drill`),
    statTile('Median time', fmtMs(summary.latency.median), 'per question'),
    statTile('p90 / p95', `${fmtMs(summary.latency.p90)} / ${fmtMs(summary.latency.p95)}`, 'latency'),
    statTile('Worst freeze', fmtMs(summary.latency.max), 'slowest question'),
    statTile('Questions w/ errors', String(summary.questionsWithErrors), `${summary.totalCorrections} corrections`),
  ]);

  // ----- detail panel (populated on point click) -----
  const detailPanel = h('div', { class: 'detail-panel empty' }, [
    h('div', { class: 'detail-placeholder' }, 'Click a point on the timeline to inspect that question.'),
  ]);
  function selectQuestion(i) {
    const q = session.questions[i];
    clear(detailPanel);
    detailPanel.classList.remove('empty');
    detailPanel.append(questionDetail(q));
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const timeline = section('Per-question timeline',
    h('p', { class: 'section-hint' }, 'Time spent on each question. Red dots had correction events — click any point for full data.'),
    h('div', { class: 'chart-wrap' }, timelineChart(session.questions, selectQuestion)),
    detailPanel,
  );

  // ----- per-operation breakdown -----
  const opRows = ['+', '-', '*', '/']
    .map((op) => summary.perOperation[op])
    .filter((r) => r.count > 0)
    .map((r, i, arr) => {
      const op = ['+', '-', '*', '/'].filter((o) => summary.perOperation[o].count > 0)[i];
      return h('tr', {}, [
        h('td', {}, `${OP_NAMES[op]} (${r.symbol})`),
        h('td', {}, String(r.count)),
        h('td', {}, fmtMs(r.meanTime)),
        h('td', {}, `${fmtPct(r.errorRate)} (${r.errorCount})`),
      ]);
    });
  const opTable = h('table', { class: 'data-table' }, [
    h('thead', {}, h('tr', {}, [
      h('th', {}, 'Operation'), h('th', {}, 'Count'), h('th', {}, 'Mean time'), h('th', {}, 'Error rate'),
    ])),
    h('tbody', {}, opRows),
  ]);

  // ----- think vs type -----
  const tvt = summary.thinkVsType;
  const thinkType = barChart([
    { label: 'Think (to 1st key)', value: tvt.meanThink, text: fmtMs(tvt.meanThink), color: '#4c8dff' },
    { label: 'Type (key → answer)', value: tvt.meanType, text: fmtMs(tvt.meanType), color: '#12a594' },
  ]);

  // ----- fatigue curve -----
  const fat = summary.fatigue;
  const fatigueRows = [['First third', fat.first], ['Middle third', fat.middle], ['Last third', fat.last]]
    .filter(([, v]) => v && v.count)
    .map(([label, v]) => h('tr', {}, [
      h('td', {}, label),
      h('td', {}, String(v.count)),
      h('td', {}, fmtMs(v.meanTime)),
      h('td', {}, fmtPct(v.errorRate)),
    ]));
  const fatigueTable = h('table', { class: 'data-table' }, [
    h('thead', {}, h('tr', {}, [h('th', {}, 'Phase'), h('th', {}, 'Count'), h('th', {}, 'Mean time'), h('th', {}, 'Error rate')])),
    h('tbody', {}, fatigueRows),
  ]);

  // ----- error-type distribution -----
  const et = summary.errorTypes;
  const etOrder = [CLASSES.TYPO, CLASSES.COMPUTATION, CLASSES.BORROW_CARRY, CLASSES.TRANSPOSITION, CLASSES.OPERATOR_CONFUSION, CLASSES.UNCLASSIFIED];
  const errorBars = barChart(
    etOrder.map((k) => ({
      label: CLASS_LABELS[k],
      value: et.dist[k] || 0,
      text: String(et.dist[k] || 0),
      color: CLASS_COLORS[k],
    })),
  );
  const errorBlock = et.total
    ? errorBars
    : h('p', { class: 'muted' }, 'No correction events this session — flawless run.');

  // ----- slowest facts -----
  const slowRows = summary.slowestFacts.map((f) => h('tr', {}, [
    h('td', {}, f.key),
    h('td', {}, String(f.count)),
    h('td', {}, fmtMs(f.meanTime)),
    h('td', {}, fmtMs(f.maxTime)),
    h('td', {}, String(f.errors)),
  ]));
  const slowTable = h('table', { class: 'data-table' }, [
    h('thead', {}, h('tr', {}, [
      h('th', {}, 'Fact'), h('th', {}, 'Count'), h('th', {}, 'Mean'), h('th', {}, 'Max'), h('th', {}, 'Errors'),
    ])),
    h('tbody', {}, slowRows.length ? slowRows : [h('tr', {}, h('td', { colspan: '5', class: 'muted' }, 'No data'))]),
  ]);

  // ----- assemble -----
  const screen = h('div', { class: 'screen results-screen' }, [
    h('div', { class: 'results-head' }, [
      h('div', {}, [
        h('h2', { class: 'results-title' }, 'Session results'),
        h('div', { class: 'results-date muted' }, fmtDate(session.timestamp)),
      ]),
      h('div', { class: 'results-actions' }, [
        h('button', { class: 'btn btn-primary', onclick: onReplay }, 'Play again'),
        h('button', { class: 'btn', onclick: onConfig }, 'Config'),
        h('button', { class: 'btn', onclick: onHistory }, 'History'),
      ]),
    ]),
    headline,
    timeline,
    h('div', { class: 'results-columns' }, [
      section('Per-operation breakdown', opTable),
      section('Think time vs type time',
        h('p', { class: 'section-hint' }, `Total: ${fmtMs(tvt.totalThink)} thinking, ${fmtMs(tvt.totalType)} typing.`),
        thinkType),
    ]),
    h('div', { class: 'results-columns' }, [
      section('Fatigue curve', fatigueTable),
      section('Error-type distribution', errorBlock),
    ]),
    section('Slowest fact patterns', slowTable),
  ]);

  clear(root).append(screen);
}
