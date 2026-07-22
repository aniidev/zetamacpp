// Minimal hand-rolled SVG charts (no chart library).
import { fmtMs } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    node.setAttribute(k, v);
  }
  return node;
}

// -------------------------------------------------------------------------
// Per-question timeline: x = question index, y = time spent.
// Questions with correction events are marked with red dots. Clicking any
// point invokes onSelect(questionIndex).
// -------------------------------------------------------------------------
export function timelineChart(questions, onSelect) {
  const W = 900, H = 320;
  const pad = { top: 20, right: 20, bottom: 40, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart timeline-chart',
    preserveAspectRatio: 'xMidYMid meet',
  });

  if (!questions.length) {
    svg.append(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' }));
    svg.lastChild.textContent = 'No questions recorded';
    return svg;
  }

  const n = questions.length;
  const maxTime = Math.max(...questions.map((q) => q.totalTime), 1);
  const avgTime = questions.reduce((a, q) => a + q.totalTime, 0) / n;
  const xFor = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = (t) => pad.top + plotH - (t / maxTime) * plotH;

  // y gridlines + labels (in seconds)
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const t = (maxTime / ticks) * i;
    const y = yFor(t);
    svg.append(svgEl('line', { x1: pad.left, y1: y, x2: W - pad.right, y2: y, class: 'grid-line' }));
    const label = svgEl('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = `${(t / 1000).toFixed(1)}s`;
    svg.append(label);
  }

  // x axis title
  const xTitle = svgEl('text', { x: pad.left + plotW / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' });
  xTitle.textContent = 'Question #';
  svg.append(xTitle);

  // connecting line
  const path = questions.map((q, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(q.totalTime)}`).join(' ');
  svg.append(svgEl('path', { d: path, class: 'timeline-line' }));

  // points
  questions.forEach((q, i) => {
    const cx = xFor(i);
    const cy = yFor(q.totalTime);
    const hasErr = q.corrections && q.corrections.length > 0;
    const isFast = !hasErr && q.totalTime < avgTime; // faster than average (and clean)
    const cls = hasErr ? 'point point-error' : isFast ? 'point point-fast' : 'point';
    const g = svgEl('g', { class: 'point-group', tabindex: '0', role: 'button' });
    const dot = svgEl('circle', { cx, cy, r: hasErr ? 6 : 4, class: cls });
    const hit = svgEl('circle', { cx, cy, r: 12, class: 'point-hit', fill: 'transparent' });
    const title = svgEl('title');
    title.textContent = `Q${i + 1}: ${fmtMs(q.totalTime)}`
      + (hasErr ? ` — ${q.corrections.length} correction(s)` : isFast ? ' — faster than average' : '');
    g.append(hit, dot, title);
    const handler = () => onSelect && onSelect(i);
    g.addEventListener('click', handler);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    svg.append(g);
  });

  return svg;
}

// -------------------------------------------------------------------------
// Simple horizontal bar list (label + value). values: [{label,value,text,color}]
// -------------------------------------------------------------------------
export function barChart(values, { unit = '' } = {}) {
  const max = Math.max(...values.map((v) => v.value), 1);
  const wrap = document.createElement('div');
  wrap.className = 'bar-chart';
  for (const v of values) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = v.label;
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${(v.value / max) * 100}%`;
    if (v.color) fill.style.background = v.color;
    track.append(fill);
    const val = document.createElement('div');
    val.className = 'bar-value';
    val.textContent = v.text != null ? v.text : `${v.value}${unit}`;
    row.append(label, track, val);
    wrap.append(row);
  }
  return wrap;
}

// -------------------------------------------------------------------------
// Multi-series trend line for the history view.
// series: [{ name, color, points: [{x, y}] }], sharing an x domain (indices).
// -------------------------------------------------------------------------
export function trendChart(series, { xLabels = [], yLabel = '', yFormat = (v) => v } = {}) {
  const W = 900, H = 300;
  const pad = { top: 20, right: 20, bottom: 44, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart trend-chart', preserveAspectRatio: 'xMidYMid meet' });

  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  if (!allY.length) {
    const t = svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' });
    t.textContent = 'Not enough sessions yet';
    svg.append(t);
    return svg;
  }
  const maxX = Math.max(...allX, 1);
  const maxY = Math.max(...allY, 1);
  const xFor = (x) => pad.left + (maxX === 0 ? plotW / 2 : (x / maxX) * plotW);
  const yFor = (y) => pad.top + plotH - (y / maxY) * plotH;

  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const yv = (maxY / ticks) * i;
    const y = yFor(yv);
    svg.append(svgEl('line', { x1: pad.left, y1: y, x2: W - pad.right, y2: y, class: 'grid-line' }));
    const label = svgEl('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = yFormat(yv);
    svg.append(label);
  }

  // x labels (session dates) — show a handful to avoid crowding
  const step = Math.max(1, Math.ceil(xLabels.length / 8));
  xLabels.forEach((lbl, i) => {
    if (i % step !== 0 && i !== xLabels.length - 1) return;
    const x = xFor(i);
    const t = svgEl('text', { x, y: H - 8, 'text-anchor': 'middle', class: 'axis-label' });
    t.textContent = lbl;
    svg.append(t);
  });

  for (const s of series) {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.x)},${yFor(p.y)}`).join(' ');
    svg.append(svgEl('path', { d, class: 'trend-line', stroke: s.color, fill: 'none' }));
    s.points.forEach((p) => {
      const c = svgEl('circle', { cx: xFor(p.x), cy: yFor(p.y), r: 4, fill: s.color, class: 'trend-point' });
      const title = svgEl('title');
      title.textContent = `${s.name}: ${yFormat(p.y)}`;
      c.append(title);
      svg.append(c);
    });
  }

  return svg;
}
