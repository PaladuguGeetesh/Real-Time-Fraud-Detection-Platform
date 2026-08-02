/**
 * Redis Updater Consumer (Phase 5, Step 5).
 *
 * Reads "scored-transactions" and updates the Redis aggregate stats
 * via the existing services/cache.js's updateStats() -- no field
 * mapping needed, the scored event's transactionId/prediction/
 * riskScore/predictionCorrect already match what updateStats() reads.
 *
 * Deliberately the lighter-weight, non-blocking tier: does NOT use
 * retryWithBackoff() (unlike scoringConsumer.js and
 * mysqlWriterConsumer.js). A Redis failure is logged clearly and the
 * offset is committed anyway -- skip and move on, no retry, no
 * resync/drift-correction logic. Redis holds hot dashboard aggregates,
 * not the system of record (that's MySQL, via mysqlWriterConsumer.js);
 * losing a stats update during a Redis outage is an accepted gap, not
 * a correctness problem worth blocking the pipeline over.
 *
 * Wired into server.js alongside the other four Phase 5 consumers --
 * the old kafkaConsumer.js/transactionProcessor.js pipeline this
 * replaced has been deleted (the Step 8 cutover). Can still be run
 * standalone for testing, same as the other messaging/ consumers.
 */

const { Kafka } = require("kafkajs");
const { updateStats } = require("../services/cache");
const { retryStartup } = require("./retryWithBackoff");
const { KAFKA_BOOTSTRAP_SERVERS, KAFKA_SCORED_TOPIC, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } = require("../config");

const GROUP_ID = "redis-updater-group";

// Same reasoning as the other Phase 5 consumers: a fresh pipeline
// stage starts from the tail of "scored-transactions" rather than
// replaying its entire history on first connect.
const FROM_BEGINNING = false;

const kafka = new Kafka({
  clientId: "redis-updater-consumer",
  brokers: KAFKA_BOOTSTRAP_SERVERS,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

// Kafka's committed offset means "the next offset to read", so this is
// always the message's own offset + 1, never the offset itself.
async function commitMessage(topic, partition, message) {
  await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
}

async function handleMessage({ topic, partition, message }) {
  const event = JSON.parse(message.value.toString());

  try {
    await updateStats(event);
    console.log(`[redis-updater] updated stats for ${event.transactionId}`);
  } catch (err) {
    // No retry, no DLQ -- log clearly and move on. The offset commits
    // below either way, so a Redis outage never blocks this consumer;
    // whatever stats updates were missed during the outage stay
    // permanently missing from the totals (accepted, not resynced).
    console.log(`[redis-updater] failed to update stats for ${event.transactionId}: ${err.message}`);
  }

  await commitMessage(topic, partition, message);
}

async function startRedisUpdaterConsumer() {
  // retryStartup here is unrelated to this file's no-retry message
  // policy above -- it only covers the one-time startup connect/
  // subscribe step. See retryWithBackoff.js's retryStartup()
  // docstring: a fresh broker can transiently reject this subscribe
  // with UNKNOWN_TOPIC_OR_PARTITION while auto-creating
  // "scored-transactions". Without this, a consumer that lost that
  // race would never start at all -- a much bigger gap than the
  // per-message skip-and-log policy this file otherwise uses.
  await retryStartup(
    async () => {
      await consumer.connect();
      await consumer.subscribe({ topic: KAFKA_SCORED_TOPIC, fromBeginning: FROM_BEGINNING });
    },
    {
      baseDelayMs: RETRY_BASE_DELAY_MS,
      maxDelayMs: RETRY_MAX_DELAY_MS,
      onRetry: (attempt, err, delayMs) => {
        console.log(`[redis-updater] connect/subscribe attempt ${attempt} failed: ${err.message}`);
        console.log(`[redis-updater] retrying in ${delayMs}ms...`);
      },
    }
  );

  await consumer.run({
    autoCommit: false,
    eachMessage: handleMessage,
  });

  console.log(`Redis updater consumer running: group="${GROUP_ID}", topic="${KAFKA_SCORED_TOPIC}"`);
}

module.exports = { startRedisUpdaterConsumer };

// Standalone entry point for isolated verification --
// `node src/messaging/redisUpdaterConsumer.js`. Not invoked from
// server.js yet.
if (require.main === module) {
  startRedisUpdaterConsumer().catch((err) => {
    console.error("Redis updater consumer failed to start:", err);
    process.exitCode = 1;
  });
}
