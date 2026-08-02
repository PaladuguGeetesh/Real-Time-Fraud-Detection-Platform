/**
 * MySQL Writer Consumer (Phase 5, Step 4).
 *
 * Reads "scored-transactions" and persists each record to MySQL via
 * the existing repository/transactionRepository.js's save() -- the
 * same Prisma field mapping the old transactionProcessor.js used
 * (deleted in the Step 8 cutover), just reading prediction/riskScore/
 * modelVersion/predictionCorrect directly off the already-scored
 * event instead of computing them (the Scoring Consumer already did
 * that work before publishing to "scored-transactions").
 *
 * Deliberately does NOT touch Redis or SSE -- this consumer owns
 * exactly one job (persistence). Redis updater, Audit log, and
 * Dashboard broadcaster each subscribe to "scored-transactions"
 * independently, same pattern as the Scoring Consumer.
 *
 * Wired into server.js alongside the other four Phase 5 consumers --
 * the old kafkaConsumer.js/transactionProcessor.js pipeline this
 * replaced has been deleted. Can still be run standalone for testing,
 * same as messaging/scoringConsumer.js.
 */

const { Kafka } = require("kafkajs");
const { save } = require("../repository/transactionRepository");
const { retryWithBackoff } = require("./retryWithBackoff");
const { KAFKA_BOOTSTRAP_SERVERS, KAFKA_SCORED_TOPIC, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } = require("../config");

const GROUP_ID = "mysql-writer-group";

// Same reasoning as the Scoring Consumer (messaging/scoringConsumer.js):
// a fresh pipeline stage starts from the tail of "scored-transactions"
// rather than replaying its entire history on first connect.
const FROM_BEGINNING = false;

const kafka = new Kafka({
  clientId: "mysql-writer-consumer",
  brokers: KAFKA_BOOTSTRAP_SERVERS,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

// Same field mapping as services/transactionProcessor.js -- flattens
// metadata into top-level columns, pulls amount off features.Amount.
// Unlike that file, prediction/riskScore/modelVersion/predictionCorrect
// are read directly off the event rather than computed here, since
// they're already present on every "scored-transactions" message.
//
// No malformed-message skip-guard here (unlike the Scoring Consumer's
// "transactions" guard): "scored-transactions" only ever receives
// well-formed events from the Scoring Consumer itself, so there's no
// equivalent stray-test-payload risk to defend against.
function buildTransactionRecord(event) {
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
  const record = buildTransactionRecord(event);

  // Blocks here until the save succeeds -- there is no other outcome.
  // Exact same shared retry helper and policy as the Scoring Consumer;
  // only the operation being retried and the log labels differ.
  await retryWithBackoff(() => save(record), {
    heartbeat,
    baseDelayMs: RETRY_BASE_DELAY_MS,
    maxDelayMs: RETRY_MAX_DELAY_MS,
    onRetry: (attempt, err, delayMs) => {
      console.log(`[mysql-writer] attempt ${attempt} failed for ${event.transactionId}: ${err.message}`);
      console.log(`[mysql-writer] retrying ${event.transactionId} in ${delayMs}ms...`);
    },
  });

  console.log(`[mysql-writer] saved ${event.transactionId}`);

  // The ONLY commit in this handler: only ever reached after a
  // successful save. Never committed while still retrying --
  // retryWithBackoff doesn't return until it succeeds.
  await commitMessage(topic, partition, message);
}

async function startMysqlWriterConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_SCORED_TOPIC, fromBeginning: FROM_BEGINNING });

  await consumer.run({
    autoCommit: false,
    eachMessage: handleMessage,
  });

  console.log(`MySQL writer consumer running: group="${GROUP_ID}", topic="${KAFKA_SCORED_TOPIC}"`);
}

module.exports = { startMysqlWriterConsumer };

// Standalone entry point for isolated verification --
// `node src/messaging/mysqlWriterConsumer.js`. Not invoked from
// server.js yet.
if (require.main === module) {
  startMysqlWriterConsumer().catch((err) => {
    console.error("MySQL writer consumer failed to start:", err);
    process.exitCode = 1;
  });
}
