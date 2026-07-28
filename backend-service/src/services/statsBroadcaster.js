/**
 * Periodic statsUpdate broadcaster (ARCHITECTURE.md section 5.6).
 * Runs independently of any single HTTP request -- broadcasts the
 * latest Redis aggregate stats to every open SSE connection on a
 * timer, skipping ticks where nothing has changed.
 */

const { broadcast } = require("./sseClients");
const { getStats } = require("./cache");
const { STATS_BROADCAST_INTERVAL_MS } = require("../config");

// Persists across ticks (module-level, outside the interval callback).
let lastBroadcastTotal = null;

function startStatsBroadcast() {
  setInterval(async () => {
    try {
      const stats = await getStats();

      // totalProcessed increments unconditionally on every processed
      // transaction, and every other stat only changes alongside it --
      // so if it's unchanged since the last broadcast, nothing could
      // have changed. Skip broadcasting an identical, stale snapshot.
      if (stats.totalProcessed === lastBroadcastTotal) {
        return;
      }
      lastBroadcastTotal = stats.totalProcessed;

      broadcast("statsUpdate", stats);
    } catch (err) {
      console.log("[error] Failed to broadcast statsUpdate:", err.message);
    }
  }, STATS_BROADCAST_INTERVAL_MS);
}

module.exports = { startStatsBroadcast };
