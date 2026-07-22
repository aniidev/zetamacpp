import { h, clear, fmtMs, fmtPct, fmtDate } from './dom.js';
import { loadSessions, deleteSession } from './storage.js';
import { median, aggregateSessions } from './stats.js';
import { trendChart, barChart } from './charts.js';
import { CLASS_LABELS, CLASS_COLORS, CLASSES } from './classifier.js';
import { OP_SYMBOL } from './questions.js';

const OP_NAMES = { '+': 'Addition', '-': 'Subtraction', '*': 'Multiplication', '/': 'Division' };

function medianQuestionTime(session) {
  return median(session.questions.map((q) => q.totalTime));
}

export function renderHistory(root, { onConfig, onOpenSession }) {
  const draw = () => {
    const sessions = loadSessions().slice().sort((a, b) => a.timestamp - b.timestamp);

    // ----- trend chart: score + median question time over sessions -----
    const scorePoints = sessions.map((s, i) => ({ x: i, y: s.score }));
    const medianPoints = sessions.map((s, i) => ({ x: i, y: medianQuestionTime(s) }));
    const xLabels = sessions.map((s) => fmtDate(s.timestamp).replace(/,.*/, ''));

    const scoreChart = trendChart(
      [{ name: 'Score', color: '#4c8dff', points: scorePoints }],
      { xLabels, yFormat: (v) => String(Math.round(v)) },
    );
    const timeChart = trendChart(
      [{ name: 'Median q-time', color: '#12a594', points: medianPoints }],
      { xLabels, yFormat: (v) => `${(v / 1000).toFixed(1)}s` },
    );

    // ----- records across all rounds -----
    const timed = sessions.filter((s) => s.questions.length > 0);
    const bestScore = sessions.length ? Math.max(...sessions.map((s) => s.score)) : null;
    const fastestMedian = timed.length ? Math.min(...timed.map(medianQuestionTime)) : null;

    // Section header with the record shown on the right.
    const sectionHead = (title, badgeLabel, badgeValue, color) =>
      h('div', { class: 'section-head' }, [
        h('h3', { class: 'section-title' }, title),
        badgeValue != null
          ? h('div', { class: 'record-badge', style: { borderColor: color, color } }, [
              h('span', { class: 'record-label' }, badgeLabel),
              h('span', { class: 'record-value' }, badgeValue),
            ])
          : null,
      ]);

    // ----- aggregate stats across all sessions -----
    const agg = aggregateSessions(sessions);

    // Average per-operation breakdown (pooled over every question).
    const aggOpRows = ['+', '-', '*', '/']
      .filter((op) => agg.perOperation[op].count > 0)
      .map((op) => {
        const r = agg.perOperation[op];
        return h('tr', {}, [
          h('td', {}, `${OP_NAMES[op]} (${r.symbol})`),
          h('td', {}, String(r.count)),
          h('td', {}, fmtMs(r.meanTime)),
          h('td', {}, `${fmtPct(r.errorRate)} (${r.errorCount})`),
        ]);
      });
    const aggOpTable = h('table', { class: 'data-table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, 'Operation'), h('th', {}, 'Count'), h('th', {}, 'Mean time'), h('th', {}, 'Error rate'),
      ])),
      h('tbody', {}, aggOpRows.length ? aggOpRows : [h('tr', {}, h('td', { colspan: '4', class: 'muted' }, 'No data'))]),
    ]);

    // Average fatigue curve (each drill's first/middle/last third, averaged).
    const fatigueRows = [['First third', agg.fatigue.first], ['Middle third', agg.fatigue.middle], ['Last third', agg.fatigue.last]]
      .filter(([, v]) => v)
      .map(([label, v]) => h('tr', {}, [
        h('td', {}, label),
        h('td', {}, fmtMs(v.meanTime)),
        h('td', {}, fmtPct(v.errorRate)),
        h('td', {}, `${v.sessions}`),
      ]));
    const fatigueTable = h('table', { class: 'data-table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, 'Phase'), h('th', {}, 'Mean time'), h('th', {}, 'Error rate'), h('th', {}, 'Sessions'),
      ])),
      h('tbody', {}, fatigueRows.length ? fatigueRows : [h('tr', {}, h('td', { colspan: '4', class: 'muted' }, 'No data'))]),
    ]);

    // Aggregate error-type distribution (pooled correction events).
    const et = agg.errorTypes;
    const etOrder = [CLASSES.TYPO, CLASSES.COMPUTATION, CLASSES.BORROW_CARRY, CLASSES.TRANSPOSITION, CLASSES.OPERATOR_CONFUSION, CLASSES.UNCLASSIFIED];
    const errorBlock = et.total
      ? barChart(etOrder.map((k) => ({
          label: CLASS_LABELS[k], value: et.dist[k] || 0, text: String(et.dist[k] || 0), color: CLASS_COLORS[k],
        })))
      : h('p', { class: 'muted' }, 'No correction events recorded yet.');

    // Think vs type (pooled).
    const tvt = agg.thinkVsType;
    const thinkType = barChart([
      { label: 'Think (to 1st key)', value: tvt.meanThink, text: fmtMs(tvt.meanThink), color: '#4c8dff' },
      { label: 'Type (key → answer)', value: tvt.meanType, text: fmtMs(tvt.meanType), color: '#12a594' },
    ]);

    // ----- session list -----
    const rows = sessions.slice().reverse().map((s) => h('tr', { class: 'history-row' }, [
      h('td', {}, fmtDate(s.timestamp)),
      h('td', {}, String(s.score)),
      h('td', {}, `${s.config.duration}s`),
      h('td', {}, fmtMs(medianQuestionTime(s))),
      h('td', {}, String(s.questions.filter((q) => q.corrections && q.corrections.length).length)),
      h('td', {}, [
        h('button', { class: 'btn btn-sm', onclick: () => onOpenSession(s.id) }, 'Open'),
        h('button', {
          class: 'btn btn-sm btn-ghost',
          onclick: () => { deleteSession(s.id); draw(); },
        }, 'Delete'),
      ]),
    ]));

    const table = h('table', { class: 'data-table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, 'Date'), h('th', {}, 'Score'), h('th', {}, 'Duration'),
        h('th', {}, 'Median q-time'), h('th', {}, 'Q w/ errors'), h('th', {}, ''),
      ])),
      h('tbody', {}, rows.length ? rows : [h('tr', {}, h('td', { colspan: '6', class: 'muted' }, 'No sessions yet — play a drill first.'))]),
    ]);

    const screen = h('div', { class: 'screen history-screen' }, [
      h('div', { class: 'results-head' }, [
        h('h2', { class: 'results-title' }, 'History & trend'),
        h('div', { class: 'results-actions' }, [
          h('button', { class: 'btn btn-primary', onclick: onConfig }, 'New drill'),
        ]),
      ]),
      h('p', { class: 'section-hint' }, `${sessions.length} session(s) recorded. Is practice moving the number?`),
      h('div', { class: 'results-columns' }, [
        h('section', { class: 'results-section' }, [
          sectionHead('Score over time', 'Highest score', bestScore != null ? String(bestScore) : null, '#4c8dff'),
          h('div', { class: 'chart-wrap' }, scoreChart),
        ]),
        h('section', { class: 'results-section' }, [
          sectionHead('Median question time over time', 'Fastest median', fastestMedian != null ? fmtMs(fastestMedian) : null, '#12a594'),
          h('div', { class: 'chart-wrap' }, timeChart),
        ]),
      ]),
      h('p', { class: 'section-hint' }, `Aggregate across all ${agg.sessionCount} session(s) — ${agg.totalAnswered} questions answered in total.`),
      h('div', { class: 'results-columns' }, [
        h('section', { class: 'results-section' }, [
          h('h3', { class: 'section-title' }, 'Average per-operation breakdown'),
          aggOpTable,
        ]),
        h('section', { class: 'results-section' }, [
          h('h3', { class: 'section-title' }, 'Average fatigue curve'),
          h('p', { class: 'section-hint' }, 'Each drill split into thirds, averaged across sessions.'),
          fatigueTable,
        ]),
      ]),
      h('div', { class: 'results-columns' }, [
        h('section', { class: 'results-section' }, [
          h('h3', { class: 'section-title' }, 'Error-type distribution (all sessions)'),
          errorBlock,
        ]),
        h('section', { class: 'results-section' }, [
          h('h3', { class: 'section-title' }, 'Think vs type time (all sessions)'),
          thinkType,
        ]),
      ]),
      h('section', { class: 'results-section' }, [
        h('h3', { class: 'section-title' }, 'All sessions'),
        table,
      ]),
    ]);

    clear(root).append(screen);
  };

  draw();
}
