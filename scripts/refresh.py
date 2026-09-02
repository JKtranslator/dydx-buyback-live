"""Pull a fresh DYDX order-book + volume snapshot and write data/snapshot.json.

Run by .github/workflows/refresh.yml (on a schedule and on manual dispatch), which commits the
result so GitHub Pages serves it. Also runnable locally:  python scripts/refresh.py

Only public Binance endpoints are used - no API key.
"""
import json
import os
import urllib.request
from datetime import datetime, timezone

SYMBOL = "DYDXUSDT"
BASE = "https://api.binance.com"
CURVE_TARGET_USD = 3_000_000   # keep levels until the curve can absorb this much buying
MAX_LEVELS = 4000              # hard cap so snapshot.json stays shippable to the browser
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "snapshot.json")

# Tread's pre-trade engine measures participation against its own expected-volume model, which sits
# a little below trailing 24h quote volume. Calibrated against four Tread pre-trade calls on
# 28 Aug 2026 (500k/800k/850k/900k): notional / 24h-volume understated Tread's pov_pct by ~2%.
TREAD_CALIBRATION = 1.02


def get(path, params):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{BASE}{path}?{qs}", headers={"User-Agent": "kpk-dydx-buyback/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    depth = get("/api/v3/depth", {"symbol": SYMBOL, "limit": 5000})
    ticker = get("/api/v3/ticker/24hr", {"symbol": SYMBOL})

    best_ask = float(depth["asks"][0][0])
    best_bid = float(depth["bids"][0][0])

    # Keep enough of the book that the simulator can walk well past the $1M budget; a truncated
    # curve would silently understate impact for large sizes.
    curve, cum_quote, cum_base = [], 0.0, 0.0
    for p, q in depth["asks"][:MAX_LEVELS]:
        price, qty = float(p), float(q)
        cum_quote += price * qty
        cum_base += qty
        curve.append([price, round(cum_quote, 2), round(cum_base, 4)])
        if cum_quote >= CURVE_TARGET_USD:
            break

    now = datetime.now(timezone.utc)
    snap = {
        "ts": now.isoformat(),
        "date": f"{now.day} {now:%b %Y}",
        "time_utc": now.strftime("%H:%M UTC"),
        "symbol": SYMBOL,
        "pair_label": "DYDX-USDT",
        "venue": "Binance",
        "last": float(ticker["lastPrice"]),
        "chg": float(ticker["priceChangePercent"]),
        "vol24": float(ticker["quoteVolume"]),
        "mid": (best_ask + best_bid) / 2,
        "best_ask": best_ask,
        "best_bid": best_bid,
        "spread_bps": (best_ask / best_bid - 1) * 1e4,
        "depth_total": cum_quote,
        "levels": len(curve),
        "curve_covers_usd": cum_quote,
        "tread_calibration": TREAD_CALIBRATION,
        "curve": curve,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(snap, f, separators=(",", ":"))

    print(f"{snap['date']} {snap['time_utc']}")
    print(f"  price        ${snap['last']:.4f}  ({snap['chg']:+.1f}% 24h)")
    print(f"  24h volume   ${snap['vol24']/1e6:.2f}M")
    print(f"  mid          ${snap['mid']:.5f}   spread {snap['spread_bps']:.1f} bps")
    print(f"  displayed    ${snap['depth_total']/1e6:.2f}M across {snap['levels']} levels")
    print(f"  wrote        {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
