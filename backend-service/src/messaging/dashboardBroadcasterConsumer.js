/**
 * Dashboard Broadcaster Consumer (Phase 5, Step 7).
 *
 * Reads "scored-transactions" and pushes each one to connected
 * dashboard tabs via the existing services/sseClients.js's
 * broadcast("newTransaction", transaction) -- same event name and
 * same flattened transaction shape the old transactionProcessor.js
 * used (deleted in the Step 8 cutover), so the dashboard's
 * LiveFeedContext needs no changes to consume it.
 *
 * Same lighter-weight, non-blocking tier as the Redis Updater
 * Consumer: does NOT use retryWithBackoff(). A broadcast failure is
 * logged clearly and the offset commits anyway -- skip and move on,
 * no retry. SSE is a live, best-effort push to whoever's currently
 * watching; there's no "resend a missed live update" concept the way
 * there is for a durable record (MySQL/AuditLog) or even Redis's
 * aggregate counters.
 *
 * Deliberately does NOT touch services/statsBroadcaster.js or its
 * independent timer -- that stays completely separate and unchanged;
 * this consumer only ever broadcasts "newTransaction", never
 * "statsUpdate".
 *
 * Wired into server.js alongside the other four Phase 5 consumers --
 * the old kafkaConsumer.js/transactionProcessor.js pipeline this
 * replaced has been deleted (the Step 8 cutover). Can still be run
 * standalone for testing, same as the other messaging/ consumers.
 */

const { Kafka } = require("kafkajs");
const { broadcast } = require("../services/sseClients");
const { retryStartup } = require("./retryWithBackoff");
const { KAFKA_BOOTSTRAP_SERVERS, KAFKA_SCORED_TOPIC, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } = require("../config");

const GROUP_ID = "dashboard-broadcaster-group";

// Same reasoning as the other Phase 5 consumers: a fresh pipeline
// stage starts from the tail of "scored-transactions" rather than
// replaying its entire history on first connect.
const FROM_BEGINNING = false;

const kafka = new Kafka({
  clientId: "dashboard-broadcaster-consumer",
  brokers: KAFKA_BOOTSTRAP_SERVERS,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

// Same field mapping as mysqlWriterConsumer.js's buildTransactionRecord
// and auditLogConsumer.js's buildAuditLogRecord -- flattens metadata
// into top-level columns, pulls amount off features.Amount, reads
// prediction/riskScore/modelVersion/predictionCorrect directly off the
// already-scored event. Duplicated locally rather than imported, same
// as those two files, so each consumer stays independently readable
// and none of them depend on another's internals.
function buildTransactionRecord(event) {
  return {
    transactionId: event.transactionId,
    bankId: event.bankId,
    timestamp: event.timestamp,
    amount: event.features.Amount,
    merchant: event.metadata.merchant,
    country: event.metadata.country,
    cardType: event.metadata.cardType,
    device: event.metadata.device,
    prediction: event.prediction,
    riskScore: event.riskScore,
    modelVersion: event.modelVersion,
    groundTruth: event.groundTruth,
    predictionCorrect: event.predictionCorrect,
    features: event.features,
  };
}

// Kafka's committed offset means "the next offset to read", so this is
// always the message's own offset + 1, never the offset itself.
async function commitMessage(topic, partition, message) {
  await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
}

async function handleMessage({ topic, partition, message }) {
  const event = JSON.parse(message.value.toString());
  const transaction = buildTransactionRecord(event);

  try {
    broadcast("newTransaction", transaction);
    console.log(`[dashboard-broadcaster] broadcast newTransaction for ${event.transactionId}`);
  } catch (err) {
    // No retry, no blocking -- log clearly and move on. The offset
    // commits below either way. SSE is a live, best-effort push: a
    // dashboard tab that missed one update because a write briefly
    // failed will simply see the next one; there's no durable record
    // to reconcile the way there is for MySQL/AuditLog/Redis.
    console.log(`[dashboard-broadcaster] failed to broadcast for ${event.transactionId}: ${err.message}`);
  }

  await commitMessage(topic, partition, message);
}

async function startDashboardBroadcasterConsumer() {
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
        console.log(`[dashboard-broadcaster] connect/subscribe attempt ${attempt} failed: ${err.message}`);
        console.log(`[dashboard-broadcaster] retrying in ${delayMs}ms...`);
      },
    }
  );

  await consumer.run({
    autoCommit: false,
    eachMessage: handleMessage,
  });

  console.log(`Dashboard broadcaster consumer running: group="${GROUP_ID}", topic="${KAFKA_SCORED_TOPIC}"`);
}

module.exports = { startDashboardBroadcasterConsumer };

// Standalone entry point for isolated verification --
// `node src/messaging/dashboardBroadcasterConsumer.js`. Not invoked
// from server.js yet.
if (require.main === module) {
  startDashboardBroadcasterConsumer().catch((err) => {
    console.error("Dashboard broadcaster consumer failed to start:", err);
    process.exitCode = 1;
  });
}
