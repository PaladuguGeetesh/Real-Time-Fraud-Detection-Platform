/**
 * ML Scoring Consumer (Phase 5, Step 2; retry policy revised in
 * Step 3; retry mechanics extracted to retryWithBackoff.js in Step 4).
 *
 * Reads "transactions", calls the ML service, and publishes the scored
 * result to "scored-transactions". On an ML failure it retries
 * forever with exponential backoff capped at RETRY_MAX_DELAY_MS --
 * there is no DLQ and no give-up point. Every transaction must
 * eventually be scored, even through an extended ML outage.
 *
 * Deliberately does NOT touch MySQL, Redis, or SSE -- this consumer
 * owns exactly one job (scoring). Those become their own consumers in
 * later Phase 5 steps, each subscribing to "scored-transactions"
 * independently (see messaging/mysqlWriterConsumer.js for the first
 * one, which shares this file's retry helper).
 *
 * Wired into server.js alongside the other four Phase 5 consumers --
 * the old kafkaConsumer.js/transactionProcessor.js pipeline this
 * replaced has been deleted (the Step 8 cutover). Can still be run
 * standalone for testing (see the bottom of this file). Lives in
 * messaging/ rather than services/ since it's one of several
 * per-concern Kafka consumers, not a general-purpose helper.
 */

const { Kafka } = require("kafkajs");
const { predictFraud } = require("../services/mlClient");
const { retryWithBackoff } = require("./retryWithBackoff");
const {
  KAFKA_BOOTSTRAP_SERVERS,
  KAFKA_TOPIC,
  KAFKA_SCORED_TOPIC,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} = require("../config");

const GROUP_ID = "scoring-consumer-group";

// A fresh pipeline stage: on its first-ever connection (no committed
// offset yet for this group), start from the tail of "transactions"
// rather than replaying the entire topic history. This is also the
// right behavior for the eventual cutover from today's single
// consumer: that consumer will already have processed everything up
// to the cutover point, so starting this one from "now" avoids
// redoing that work rather than silently duplicating it. (A one-time
// historical backfill, if ever wanted, should be its own deliberate
// job -- not this flag, and not this step.)
const FROM_BEGINNING = false;

const kafka = new Kafka({
  clientId: "scoring-consumer",
  brokers: KAFKA_BOOTSTRAP_SERVERS,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });
const producer = kafka.producer();

// Duplicated from the old (now-deleted) services/transactionProcessor.js
// rather than shared via import -- keeps this consumer free of any
// dependency on another consumer's internals.
function isPredictionCorrect(prediction, groundTruth) {
  return (prediction === "fraud" && groundTruth === 1) || (prediction === "safe" && groundTruth === 0);
}

// Kafka's committed offset means "the next offset to read", so this is
// always the message's own offset + 1, never the offset itself.
// message.offset arrives as a string (Kafka offsets are int64, kept as
// strings in JS to avoid precision loss), hence the Number()/toString().
async function commitMessage(topic, partition, message) {
  await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
}

async function handleMessage({ topic, partition, message, heartbeat }) {
  const event = JSON.parse(message.value.toString());

  // Same guard as today's consumer: older/unrelated messages on this
  // topic (e.g. Phase 2's connectivity-test payloads) don't have this
  // shape -- skip rather than crash, and still commit past them so
  // the consumer doesn't re-read them forever. This is unrelated to
  // the ML retry policy below: a malformed message will never become
  // scoreable no matter how many times it's retried, so it's still
  // committed immediately here, same as before.
  if (!event.features || !event.metadata) {
    console.log(`[scoring] skipped non-transaction message: ${JSON.stringify(event)}`);
    await commitMessage(topic, partition, message);
    return;
  }

  // Blocks here until scoring succeeds -- there is no other outcome.
  // Same retry mechanics as before (unbounded, capped exponential
  // backoff, heartbeat-chunked sleep), now shared via
  // retryWithBackoff.js instead of an inline copy; onRetry preserves
  // the exact same two log lines per failed attempt as before the
  // refactor.
  const { prediction, riskScore, modelVersion } = await retryWithBackoff(() => predictFraud(event.features), {
    heartbeat,
    baseDelayMs: RETRY_BASE_DELAY_MS,
    maxDelayMs: RETRY_MAX_DELAY_MS,
    onRetry: (attempt, err, delayMs) => {
      console.log(`[scoring] attempt ${attempt} failed for ${event.transactionId}: ${err.message}`);
      console.log(`[scoring] retrying ${event.transactionId} in ${delayMs}ms...`);
    },
  });

  // Original event fields plus the scoring fields -- metadata stays
  // NESTED here (unlike the flattened MySQL row shape), matching the
  // "transactions" topic's own shape, just extended. Same shape
  // verified round-trip-correct in Step 1.
  const scoredEvent = {
    transactionId: event.transactionId,
    bankId: event.bankId,
    timestamp: event.timestamp,
    features: event.features,
    metadata: event.metadata,
    groundTruth: event.groundTruth,
    prediction,
    riskScore,
    modelVersion,
    predictionCorrect: isPredictionCorrect(prediction, event.groundTruth),
  };

  await producer.send({
    topic: KAFKA_SCORED_TOPIC,
    messages: [{ value: JSON.stringify(scoredEvent) }],
  });
  console.log(
    `[scoring] scored ${event.transactionId} -> ${KAFKA_SCORED_TOPIC} | prediction=${prediction} riskScore=${riskScore}`
  );

  // The ONLY commit on the scoring path (besides the skip-guard
  // above): only ever reached after a successful score. Never
  // committed while still retrying -- retryWithBackoff doesn't return
  // until it succeeds -- and there is no "gave up" branch anymore to
  // commit from, since retries never stop.
  await commitMessage(topic, partition, message);
}

async function startScoringConsumer() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: FROM_BEGINNING });

  await consumer.run({
    autoCommit: false,
    eachMessage: handleMessage,
  });

  console.log(`Scoring consumer running: group="${GROUP_ID}", topic="${KAFKA_TOPIC}" -> "${KAFKA_SCORED_TOPIC}"`);
}

module.exports = { startScoringConsumer };

// Standalone entry point for isolated verification --
// `node src/messaging/scoringConsumer.js`. Not invoked from
// server.js yet.
if (require.main === module) {
  startScoringConsumer().catch((err) => {
    console.error("Scoring consumer failed to start:", err);
    process.exitCode = 1;
  });
}
