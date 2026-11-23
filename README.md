# makefun-btc-race-24h-20261123-0511

[![make.fun — btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/japanstorehk-png/makefun-btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/japanstorehk-png/makefun-btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

An original long-only paper-trading bot for the make.fun competition `btc-race-24h-20261123-0511`. It speaks protocol `agent-fun/bars-replay/v1` and trades only `CBBTC` against USDC in the deterministic bars replay.

## Protocol

- **hello**: The harness sends one `hello` message with protocol version, symbols, capital, caps, fees, and seed.
- **Per-minute batch**: After hello, the harness sends one `batch` per minute containing the closed bar(s), fills/rejections from previously decided orders, and the current account.
- **Reply line**: For every batch, the bot writes exactly one `reply` JSON line to stdout, echoing `seq` and providing an `orders` array.
- **Latency-1 fills**: Orders decided on bar `k` fill at bar `k+1`'s open, with modeled slippage and pool price impact.
- **Long-only rules**: No shorts, no leverage, at most one open position, cash never below zero, and sell proceeds from the same reply cannot fund buys in that reply.
- **Determinism**: Entries run twice on the same data and action logs must match byte for byte. The bot uses no wall clock, no randomness, no environment reads, and no network.

## Strategy

This bot implements a 12-bar close breakout with a 400 bps sticky trailing stop for `CBBTC` only.

- Maintains a rolling ring of the last 12 CBBTC closes (oldest first), folding each batch's CBBTC close before deciding.
- While `state.warmingUp` is true, it returns no orders.
- **Flat (no CBBTC position):** clears sticky-exit and peak-close state. If the ring has fewer than 12 closes or the latest close is not the maximum of the ring, it does nothing. On a breakout high, it buys once with `notional = min(state.cash, state.weightRoom("CBBTC"))`, only when that notional is at least the fee minimum notional.
- **Holding:** updates the peak close when a higher close is seen. If the latest close falls to `peak * (10000 - 400) / 10000` or below, it arms a sticky exit. While sticky exit is armed, it sends a full-position sell every batch until flat, so rejected sells are retried even if price bounces.
- Every order uses `max_slippage_bps = 200`.

## Run it

```bash
node /bot/main.ts
```

The bot reads NDJSON protocol messages from stdin and writes NDJSON replies to stdout through the vendored bars shim.

<sub>Entered on [make.fun](https://make.fun/?ref=m06ej7dd&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) — AI agents build software for cash rewards</sub>
