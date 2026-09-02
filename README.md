# dYdX $1M Buyback — Execution Options

Live dashboard showing, for several market-buy sizes, where a market order leaves the DYDX price on
the current Binance book, and how long the remaining balance takes to deploy at different
participation rates. Includes a simulator so anyone can test their own sizes against the stored
snapshot.

Prepared by **KPK · Treasury SubDAO** for the **dYdX Foundation**.

**Live:** https://jktranslator.github.io/dydx-buyback-live/

---

## How it works

Static site on GitHub Pages. No backend, no API keys.

```
index.html              the dashboard
assets/app.js           book maths, rendering, simulator (all client-side)
assets/styles.css       KPK brand styling
data/snapshot.json      committed market snapshot — the single source of truth
scripts/refresh.py      pulls Binance depth + 24h ticker, writes the snapshot
.github/workflows/      refresh.yml — runs the script hourly and on demand
```

Two ways to get current data:

- **Refresh live** (the button) pulls the order book straight from Binance into your browser and
  re-renders everything immediately. Binance's public market-data endpoints send
  `Access-Control-Allow-Origin: *`, so this needs no backend and no repo access. Nothing is stored —
  it is a live read for whoever clicks it.
- **update stored baseline** (the small link) runs the Actions workflow, which commits a fresh
  `data/snapshot.json`. That is the shared figure everyone loads by default, and it also refreshes
  hourly on a schedule.

If a live fetch fails — Binance restricts some regions with HTTP 451 — the page says so and keeps
showing the stored snapshot.

Refresh locally instead:

```bash
python scripts/refresh.py     # stdlib only
```

## Changing the options

Edit the constants at the top of `assets/app.js`:

```js
const BUDGET  = 1_000_000;
const OPTIONS = [
  { n: 1, buy: 100_000, defend: 900_000 },
  ...
];
const RATES   = [2.5, 5, 10, 15, 20];
```

No rebuild step — commit and Pages serves it.

## How the numbers are derived

- **Ending price / average fill** — walks the displayed asks level by level until the notional is
  filled. Instantaneous, assumes no replenishment, so it is a worst case.
- **Deploys in** — `participation ÷ rate`, where participation is the notional as a share of 24h
  quote volume.
- **Avg cost vs mid** — average fill price against mid for one day's notional (`rate × 24h volume`)
  in a single pass of the book.

### Three things to know before quoting the output

**Average fill, not ending price, in the defence tables.** A single large resting order can absorb a
wide range of sizes at one price, so "ending price" *saturates*. In one snapshot a $41k order meant
$36k and $72k of buying ended at exactly the same price, making 5% and 10% participation look
identical. Average fill rises monotonically with size. Do not switch that column back to a price level.

**Everything is an upper bound.** The book is held constant, i.e. the whole notional executes in one
pass. A genuinely worked order pays less, because market-makers replenish between clips.

**Participation is derived, not from Tread.** `scripts/refresh.py` computes it as
notional ÷ 24h volume with a `TREAD_CALIBRATION` factor of 1.02, fitted against four Tread pre-trade
calls on 28 Aug 2026 ($500k/$800k/$850k/$900k), where the raw ratio understated Tread's `pov_pct` by
about 2%. Close enough for sizing; re-run the Tread pre-trade tool before executing.

Liquidity is thin and moves fast — a single large order can dominate the picture. **Refresh
immediately before execution** rather than trusting a snapshot from earlier in the day.

## Brand

Follows the KPK Vaults (Spring 2026) deck: eyebrow label above a large light-weight heading, tonal
borderless cards on a warm ground, numerals at weight 400. Type tokens from
[karpatkey/design-system](https://github.com/karpatkey/design-system).
Lexend is self-hosted (weights 400/600 only — the design system defines no others).

## Note on access

Binance geo-restricts some regions and returns HTTP 451. The snapshot is fetched by GitHub Actions
(not the visitor's browser), so the dashboard renders everywhere; only re-running the workflow
depends on the runner's region.

---

Internal decision aid, not investment or legal advice.
