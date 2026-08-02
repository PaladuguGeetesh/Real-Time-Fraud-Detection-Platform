/**
 * Audit Log Consumer (Phase 5, Step 6).
 *
 * Reads "scored-transactions" and, for fraud-predicted transactions
 * only, saves a self-contained snapshot to the AuditLog table via the
 * new repository/auditLogRepository.js. Non-fraud transactions are
 * skipped (committed, no logging -- that's the common case, not worth
 * a log line per message).
 *
 * Same retry-and-block tier as the MySQL Writer Consumer: wraps the
 * save in the shared retryWithBackoff() and never commits until it
 * succeeds. Unlike the Redis Updater Consumer, a missed audit record
 * isn't an acceptable gap -- this is a compliance/audit trail, not a
 * hot dashboard aggregate, so it retries forever rather than skipping.
 *
 * No REST endpoint or dashboard UI reads this table -- storage only,
 * direct SQL is the intended access pattern for now.
 *
 * Wired into server.js alongside the other four Phase 5 consumers --
 * the old kafkaConsumer.js/transactionProcessor.js pipeline this
 * replaced has been deleted (the Step 8 cutover). Can still be run
 * standalone for testing, same as the other messaging/ consumers.
 */

const { Kafka } = require("kafkajs");
const { save } = require("../repository/auditLogRepository");
const { retryWithBackoff } = require("./retryWithBackoff");
const { KAFKA_BOOTSTRAP_SERVERS, KAFKA_SCORED_TOPIC, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } = require("../config");

const GROUP_ID = "audit-log-group";

// Same reasoning as the other Phase 5 consumers: a fresh pipeline
// stage starts from the tail of "scored-transactions" rather than
// replaying its entire history on first connect.
const FROM_BEGINNING = false;

const kafka = new Kafka({
  clientId: "audit-log-consumer",
  brokers: KAFKA_BOOTSTRAP_SERVERS,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

// Same field mapping as mysqlWriterConsumer.js's buildTransactionRecord
// -- flattens metadata into top-level columns, pulls amount off
// features.Amount, reads prediction/riskScore/modelVersion/
// predictionCorrect directly off the already-scored event.
function buildAuditLogRecord(event) {
  return {
    transactionId: event.transactionId,
    bankId: event.bankId,
    timestamp: new Date(event.timestamp),
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

async function handleMessage({ topic, partition, message, heartbeat }) {
  const event = JSON.parse(message.value.toString());

  if (event.prediction !== "fraud") {
    await commitMessage(topic, partition, message);
    return;
  }

  const record = buildAuditLogRecord(event);

  // Blocks here until the save succeeds -- there is no other outcome.
  // Exact same shared retry helper and policy as the MySQL Writer
  // Consumer; only the operation being retried and the log labels
  // differ.
  await retryWithBackoff(() => save(record), {
    heartbeat,
    baseDelayMs: RETRY_BASE_DELAY_MS,
    maxDelayMs: RETRY_MAX_DELAY_MS,
    onRetry: (attempt, err, delayMs) => {
      console.log(`[audit-log] attempt ${attempt} failed for ${event.transactionId}: ${err.message}`);
      console.log(`[audit-log] retrying ${event.transactionId} in ${delayMs}ms...`);
    },
  });

  console.log(`[audit-log] saved fraud record for ${event.transactionId}`);

  // The ONLY commit on the save path: only ever reached after a
  // successful save. Never committed while still retrying --
  // retryWithBackoff doesn't return until it succeeds.
  await commitMessage(topic, partition, message);
}

async function startAuditLogConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_SCORED_TOPIC, fromBeginning: FROM_BEGINNING });

  await consumer.run({
    autoCommit: false,
    eachMessage: handleMessage,
  });

  console.log(`Audit log consumer running: group="${GROUP_ID}", topic="${KAFKA_SCORED_TOPIC}"`);
}

module.exports = { startAuditLogConsumer };

// Standalone entry point for isolated verification --
// `node src/messaging/auditLogConsumer.js`. Not invoked from
// server.js yet.
if (require.main === module) {
  startAuditLogConsumer().catch((err) => {
    console.error("Audit log consumer failed to start:", err);
    process.exitCode = 1;
  });
}
