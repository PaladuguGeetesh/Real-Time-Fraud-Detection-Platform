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
const { KAFKA_BOOTSTRAP_SERVERS, KAFKA_SCORED_TOPIC } = require("../config");

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
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_SCORED_TOPIC, fromBeginning: FROM_BEGINNING });

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
