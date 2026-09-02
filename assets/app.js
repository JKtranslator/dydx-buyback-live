/* dYdX buyback — execution options dashboard
   All maths runs client-side against data/snapshot.json, so the simulator is instant. */

const BUDGET = 1_000_000;
const OPTIONS = [
  { n: 1, buy: 100_000, defend: 900_000 },
  { n: 2, buy: 150_000, defend: 850_000 },
  { n: 3, buy: 200_000, defend: 800_000 },
  { n: 4, buy: 500_000, defend: 500_000 },
];
const RATES = [2.5, 5, 10, 15, 20];

let SNAP = null;

/* ---------------------------------------------------------------- formatting */
const usd = (v) =>
  Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M`
  : Math.abs(v) >= 1e3 ? `$${Math.round(v / 1e3)}k`
  : `$${v.toFixed(0)}`;
const px = (v) => `$${v.toFixed(4)}`;
const tok = (v) => `${(v / 1e6).toFixed(2)}M`;
const pct = (v, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
const days = (d) => (d < 2 ? `${(d * 24).toFixed(0)} h` : `${d.toFixed(0)} days`);

/* ---------------------------------------------------------------- book maths */

/** Walk the displayed asks until `spend` USDT is filled. Instantaneous: no replenishment. */
function walk(spend) {
  const c = SNAP.curve;
  if (spend <= 0 || !c.length) return { end: SNAP.best_ask, avg: SNAP.best_ask, dydx: 0, move: 0, capped: false };
  let i = -1;
  for (let k = 0; k < c.length; k++) if (c[k][1] >= spend) { i = k; break; }
  const capped = i === -1;               // ran past the stored curve
  if (capped) i = c.length - 1;
  const pq = i > 0 ? c[i - 1][1] : 0;
  const pb = i > 0 ? c[i - 1][2] : 0;
  const price = c[i][0];
  const base = pb + (spend - pq) / price;
  return {
    end: price,
    avg: base > 0 ? spend / base : price,
    dydx: base,
    move: (price / SNAP.best_ask - 1) * 100,
    capped,
  };
}

function depthWithin(p) {
  const limit = SNAP.best_ask * (1 + p);
  let cum = 0;
  for (const [price, cumQuote] of SNAP.curve) { if (price > limit) break; cum = cumQuote; }
  return cum;
}

/** Participation (% of 24h volume) implied by buying `notional` in one day. */
const participation = (notional) =>
  SNAP.vol24 > 0 ? (notional / SNAP.vol24) * 100 * (SNAP.tread_calibration || 1) : 0;

const deployDays = (notional, rate) => (rate > 0 ? participation(notional) / rate : Infinity);

/** Average fill cost vs mid of buying one day's notional at `rate`% participation.
 *  Average fill, not the final level: one large resting order can absorb a wide range of sizes at a
 *  single price, so "ending price" saturates and stops discriminating between rates. */
function avgCostVsMid(rate) {
  const { avg } = walk((SNAP.vol24 * rate) / 100);
  return (avg / SNAP.mid - 1) * 100;
}
const costTier = (c) => (c < 1 ? 'good' : c < 3 ? 'warn' : 'bad');

/* ---------------------------------------------------------------- rendering */

function renderStats() {
  const s = SNAP;
  document.getElementById('stats').innerHTML = [
    ['Price (mid)', px(s.mid), `last ${px(s.last)} · ${pct(s.chg)} 24h`],
    ['Volume, last 24h', usd(s.vol24), 'quote volume'],
    ['Spread', `${s.spread_bps.toFixed(0)}<span class="u">bps</span>`, ''],
    ['Depth +1% / +2%', `${usd(depthWithin(0.01))} / ${usd(depthWithin(0.02))}`, 'resting asks', 'sm'],
    ['Curve covers', usd(s.depth_total), `${s.levels} ask levels`],
  ].map(([t, v, f, cls = '']) =>
    `<div class="card"><div class="t">${t}</div>
     <div class="v num ${cls}">${v}</div>${f ? `<div class="foot">${f}</div>` : ''}</div>`
  ).join('');
}

function moveBlock(size) {
  const r = walk(size);
  return `
    <div class="lab">Ending price</div>
    <div class="move">
      <span class="from num">${px(SNAP.best_ask)}</span><span class="from">→</span>
      <span class="to num">${px(r.end)}</span>
    </div>
    <div class="delta">${pct(r.move, 0)} against the displayed book</div>
    <dl class="kv">
      <div><dt>Average fill</dt><dd class="num">${px(r.avg)}</dd></div>
      <div><dt>DYDX acquired</dt><dd class="num">${tok(r.dydx)}</dd></div>
      <div><dt>Share of 24h volume</dt><dd class="num">${(size / SNAP.vol24 * 100).toFixed(0)}%</dd></div>
    </dl>`;
}

function defendTable(defend) {
  const rows = RATES.map((rate) => {
    const c = avgCostVsMid(rate);
    return `<tr>
      <td class="k num">${rate}%</td>
      <td class="n num">${days(deployDays(defend, rate))}</td>
      <td class="n num">${usd((SNAP.vol24 * rate) / 100)}</td>
      <td class="n"><span class="pill p-${costTier(c)} num">${pct(c, 2)}</span></td>
    </tr>`;
  }).join('');
  return `<div class="lab">${usd(defend)} at a percentage of volume</div>
    <div class="scroll"><table>
      <thead><tr><th>Rate</th><th class="n">Deploys in</th>
        <th class="n">Buying / day</th><th class="n">Avg cost vs mid</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

function renderOptions() {
  document.getElementById('options').innerHTML = OPTIONS.map((o) => `
    <div class="opt">
      <div class="opt-h">
        <span class="idx">${o.n}</span>
        <h3>${usd(o.buy)} market buy &nbsp;+&nbsp; ${usd(o.defend)} worked defence</h3>
      </div>
      <div class="opt-b">
        <div class="pane-l">${moveBlock(o.buy)}</div>
        <div>${defendTable(o.defend)}</div>
      </div>
    </div>`).join('');
}

function renderReference() {
  const r = walk(BUDGET);
  document.getElementById('reference').innerHTML = `
    <div class="opt">
      <div class="opt-b">
        <div class="pane-l">${moveBlock(BUDGET)}</div>
        <div><p class="note">A single ${usd(BUDGET)} market order consumes effectively the entire
          displayed book, moving the price <b>${pct(r.move, 0)}</b> from <b>${px(SNAP.best_ask)}</b>
          to <b>${px(r.end)}</b> and filling at an average of <b>${px(r.avg)}</b> for
          ${tok(r.dydx)} DYDX. The displacement is transient: the quoted price reverts as
          market-makers replenish the book, so the level reached is a function of resting liquidity at
          the moment of execution rather than a sustained price. The order would represent
          <b>${(BUDGET / SNAP.vol24 * 100).toFixed(0)}%</b> of the last 24h of traded volume.
          ${r.capped ? '<b>Note:</b> this size exceeds the stored curve, so the figure is a floor on the true impact.' : ''}
          </p></div>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- impact chart */
function renderChart() {
  const w = 900, h = 240, pad = { l: 46, r: 12, t: 12, b: 26 };
  const maxSpend = 1_000_000;
  const pts = [];
  for (let s = 10_000; s <= maxSpend; s += 10_000) pts.push([s, (walk(s).avg / SNAP.mid - 1) * 100]);
  const maxY = Math.max(...pts.map((p) => p[1])) * 1.1 || 1;
  const X = (s) => pad.l + (s / maxSpend) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - (v / maxY) * (h - pad.t - pad.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const area = `${line}L${X(maxSpend).toFixed(1)},${(h - pad.b).toFixed(1)}L${X(10_000).toFixed(1)},${(h - pad.b).toFixed(1)}Z`;

  const yTicks = [0, maxY / 2, maxY].map((v) =>
    `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>
     <text x="${pad.l - 6}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(1)}%</text>`).join('');
  const xTicks = [0, 250_000, 500_000, 750_000, 1_000_000].map((s) =>
    `<text x="${X(s)}" y="${h - 8}" text-anchor="middle">${s ? usd(s) : '0'}</text>`).join('');
  const marks = OPTIONS.map((o) =>
    `<line class="mark" x1="${X(o.buy)}" x2="${X(o.buy)}" y1="${pad.t}" y2="${h - pad.b}"/>
     <text x="${X(o.buy)}" y="${pad.t + 9}" text-anchor="middle">${usd(o.buy)}</text>`).join('');

  document.getElementById('chart').innerHTML =
    `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img"
       aria-label="Average fill cost versus mid as a function of market-buy size">
       ${yTicks}<path class="area" d="${area}"/><path class="line" d="${line}"/>${marks}${xTicks}
     </svg>`;
}

/* ---------------------------------------------------------------- simulator */
function initSimulator() {
  const el = (id) => document.getElementById(id);
  const state = { buy: 150_000, defend: 850_000, rate: 10 };

  const rateSeg = el('simRates');
  rateSeg.innerHTML = RATES.map((r) =>
    `<button type="button" data-r="${r}" aria-pressed="${r === state.rate}">${r}%</button>`).join('');

  function render() {
    const r = walk(state.buy);
    const cost = avgCostVsMid(state.rate);
    const dd = deployDays(state.defend, state.rate);
    const part = participation(state.buy + state.defend);

    el('simBuyVal').textContent = usd(state.buy);
    el('simDefVal').textContent = usd(state.defend);
    el('simBuyNum').value = state.buy;
    el('simDefNum').value = state.defend;
    el('simBuyRange').value = state.buy;
    el('simDefRange').value = state.defend;

    el('simOut').innerHTML = [
      ['Ending price', px(r.end), ''],
      ['Avg fill', px(r.avg), ''],
      ['DYDX acquired', tok(r.dydx), ''],
      ['Book impact', pct(r.move, 0), ''],
      ['Defence deploys', days(dd), 'hl'],
      ['Avg cost vs mid', pct(cost, 2), ''],
    ].map(([t, v, cls]) =>
      `<div class="o ${cls}"><div class="t">${t}</div><div class="v num">${v}</div></div>`).join('');

    const total = state.buy + state.defend;
    const msgs = [];
    if (r.capped) msgs.push(`Market buy exceeds the stored book curve (${usd(SNAP.depth_total)}) — impact shown is a floor.`);
    if (Math.abs(total - BUDGET) > 1) msgs.push(`Total is ${usd(total)}, not the ${usd(BUDGET)} budget.`);
    if (r.move >= 25) msgs.push(`Market buy moves the displayed book ${pct(r.move, 0)}.`);
    if (cost >= 3) msgs.push(`Defence at ${state.rate}% costs ${pct(cost, 2)} vs mid.`);
    const flag = el('simFlag');
    flag.textContent = msgs.length ? `⚠ ${msgs.join('  ')}` : `✓ Total ${usd(total)} · combined ${part.toFixed(0)}% of 24h volume.`;
    flag.style.color = msgs.length ? 'var(--bad)' : 'var(--good)';
  }

  el('simBuyRange').addEventListener('input', (e) => { state.buy = +e.target.value; render(); });
  el('simDefRange').addEventListener('input', (e) => { state.defend = +e.target.value; render(); });
  el('simBuyNum').addEventListener('input', (e) => { state.buy = Math.max(0, +e.target.value || 0); render(); });
  el('simDefNum').addEventListener('input', (e) => { state.defend = Math.max(0, +e.target.value || 0); render(); });
  rateSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]'); if (!b) return;
    state.rate = +b.dataset.r;
    rateSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    render();
  });
  el('simSplit').addEventListener('click', () => { state.defend = Math.max(0, BUDGET - state.buy); render(); });

  render();
}

/* ---------------------------------------------------------------- boot */
async function load() {
  try {
    const res = await fetch(`data/snapshot.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`snapshot.json returned ${res.status}`);
    SNAP = await res.json();
  } catch (e) {
    document.getElementById('app').innerHTML =
      `<div class="err"><b>Could not load the snapshot.</b> ${e.message}.
       Run the Refresh data workflow to generate <code>data/snapshot.json</code>.</div>`;
    return;
  }
  document.getElementById('stamp').innerHTML =
    `Snapshot <b>${SNAP.date}, ${SNAP.time_utc}</b><br>${SNAP.venue} ${SNAP.pair_label} · live book`;
  document.getElementById('methodVol').textContent = usd(SNAP.vol24);
  renderStats(); renderOptions(); renderReference(); renderChart(); initSimulator();
  document.getElementById('app').hidden = false;
}
load();
