/**
 * Shared retry helper (Phase 5, Step 4), extracted from
 * scoringConsumer.js's original inline retry logic (Step 2/3) so the
 * MySQL Writer Consumer -- and any future per-concern consumer -- can
 * reuse the exact same, already-verified retry mechanics instead of a
 * second hand-copied implementation.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chunk size for sleepWithHeartbeat, deliberately matching kafkajs's
// own default heartbeatInterval (3000ms).
const HEARTBEAT_CHUNK_MS = 3000;

/**
 * Sleeps for `ms`, but in small chunks, calling kafkajs's `heartbeat`
 * between each one instead of just once at the start.
 *
 * A single heartbeat() call right before a multi-second sleep is NOT
 * enough by itself: kafka's broker expires the session if the GAP
 * between heartbeats exceeds sessionTimeout (default 30000ms), and
 * once a retry delay reaches that range, a single heartbeat call
 * before the sleep leaves a gap that can exceed the timeout on its
 * own. This exact bug was hit and fixed during the Scoring Consumer's
 * Step 2/3 verification -- it measurably caused real "coordinator is
 * not aware of this member" errors and consumer-group rebalances,
 * visible as the retry attempt counter resetting mid-backoff, since
 * the aborted eachMessage call restarts from scratch on the
 * redelivered (still-uncommitted) message. Heartbeating every ~3s
 * throughout the sleep, regardless of how long it is, keeps every gap
 * far under sessionTimeout no matter how large the backoff grows.
 */
async function sleepWithHeartbeat(ms, heartbeat) {
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(HEARTBEAT_CHUNK_MS, remaining);
    await sleep(chunk);
    remaining -= chunk;
    await heartbeat();
  }
}

/**
 * Retries `operation` FOREVER on failure, with exponential backoff
 * (baseDelayMs, doubling each attempt, capped at maxDelayMs). Never
 * gives up -- there is no dead-letter path here; callers that need
 * one build it themselves around this helper.
 *
 * @param {() => Promise<T>} operation - the thing to retry. Takes no
 *   arguments -- callers close over whatever context they need (e.g.
 *   `() => predictFraud(event.features)`).
 * @param {object} options
 * @param {() => Promise<void>} options.heartbeat - kafkajs's
 *   per-message heartbeat callback, as destructured from
 *   eachMessage's own arguments (NOT the Consumer instance itself --
 *   kafkajs doesn't expose a standalone heartbeat method outside that
 *   callback, so that's what actually needs to be passed through).
 * @param {number} options.baseDelayMs
 * @param {number} options.maxDelayMs
 * @param {(attempt: number, err: Error, delayMs: number) => void} [options.onRetry] -
 *   called after each failed attempt, before the backoff sleep, so
 *   each caller can log with its own message/prefix while the retry
 *   mechanics stay fully shared.
 * @returns {Promise<T>}
 */
async function retryWithBackoff(operation, { heartbeat, baseDelayMs, maxDelayMs, onRetry }) {
  let attempt = 1;
  // eslint-disable-next-line no-constant-condition -- deliberately unbounded: no give-up point.
  while (true) {
    try {
      return await operation();
    } catch (err) {
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      if (onRetry) onRetry(attempt, err, delayMs);
      await sleepWithHeartbeat(delayMs, heartbeat);
      attempt++;
    }
  }
}

module.exports = { retryWithBackoff };
