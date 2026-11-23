/**
 * BTC 24h race bot for protocol agent-fun/bars-replay/v1.
 *
 * Protocol: the harness sends a `hello` message once with universe, capital, caps,
 * fees, and seed. After that it sends one `batch` per minute containing the bar that
 * just closed, any fills/rejections from orders decided on the previous batch, and the
 * current account. The bot must answer every batch with exactly one `reply` line that
 * echoes the batch `seq` and includes an `orders` array. Orders decided on bar k fill
 * at bar k+1's open (latency 1). A sell's proceeds land at that open and cannot fund
 * buys in the same reply. Orders decided on the last bar are rejected as `after_end`.
 *
 * Strategy (CBBTC only, long-only): keep a rolling ring of the last 12 CBBTC closes.
 * On each batch, fold CBBTC bar closes into the ring before deciding. During warmup,
 * no orders are sent. When flat, if the latest close is a 12-bar breakout high, buy
 * with as much cash as weight/cash constraints allow (respecting min notional) using
 * max_slippage_bps 200. When holding, track a peak close and arm a sticky exit when
 * the latest close drops 400 bps or more from that peak; once armed, keep sending a
 * full-position sell until flat, retrying across batches if needed. Sticky exit and
 * peak reset only when flat.
 */

import { BPS, runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const LOOKBACK = 12;
const TRAIL_BPS = 400n;
const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 200;

const closes: bigint[] = [];
let peakClose: bigint | null = null;
let stickyExit = false;

function foldBatch(batch: Batch): void {
  for (const bar of batch.bars) {
    if (bar.symbol !== SYMBOL) continue;
    closes.push(BigInt(bar.c));
    if (closes.length > LOOKBACK) {
      closes.shift();
    }
  }
}

function latestClose(): bigint | null {
  return closes.length > 0 ? closes[closes.length - 1] : null;
}

function isBreakoutHigh(close: bigint): boolean {
  if (closes.length < LOOKBACK) return false;
  for (const c of closes) {
    if (c > close) return false;
  }
  return true;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    foldBatch(batch);

    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL)?.qty ?? 0n;
    const latest = latestClose();

    if (held === 0n) {
      // A fresh flat state clears exit state so the next entry gets a clean peak.
      stickyExit = false;
      peakClose = null;

      if (latest === null || !isBreakoutHigh(latest)) return [];

      const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
      const notional = state.cash < state.weightRoom(SYMBOL) ? state.cash : state.weightRoom(SYMBOL);
      if (notional < minNotional) return [];

      return [{
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: notional,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      }];
    }

    if (latest !== null) {
      if (peakClose === null || latest > peakClose) {
        peakClose = latest;
      }
      // Trailing stop: arm exit when latest/peak <= 1 - TRAIL_BPS/BPS.
      // Rewritten as latest * BPS <= peakClose * (BPS - TRAIL_BPS) to keep all values
      // as bigint integers (no floats), preserving deterministic cross-run behavior.
      if (peakClose !== null && latest * BPS <= peakClose * (BPS - TRAIL_BPS)) {
        stickyExit = true;
      }
    }

    if (stickyExit) {
      return [{
        side: 'sell',
        symbol: SYMBOL,
        qty: held,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      }];
    }

    return [];
  },
});
