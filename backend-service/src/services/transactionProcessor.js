/**
 * The Kafka-message-to-database-record pipeline: scores a transaction
 * event via the ML service, persists it, updates Redis stats, and
 * broadcasts it over SSE. No req/res -- this is triggered by a Kafka
 * message, not an HTTP request. Called from kafkaConsumer.js's
 * eachMessage.
 */

const { predictFraud } = require("./mlClient");
const { save } = require("../repository/transactionRepository");
const { updateStats } = require("./cache");
const { broadcast } = require("./sseClients");

function isPredictionCorrect(prediction, groundTruth) {
  return (prediction === "fraud" && groundTruth === 1) || (prediction === "safe" && groundTruth === 0);
}

async function processTransactionEvent(event) {
  // Older test messages on this topic (e.g. Phase 2's {"hello":"world"}
  // connectivity check) don't match the transaction event shape --
  // skip rather than crash the consumer loop on them.
  if (!event.features || !event.metadata) {
    console.log(`[skipped] non-transaction message: ${JSON.stringify(event)}`);
    return;
  }

  // Declared here (not `const` inside the try) so they're still in
  // scope after the try block, whether it succeeds or fails.
  let prediction, riskScore, modelVersion;
  try {
    ({ prediction, riskScore, modelVersion } = await predictFraud(event.features));
  } catch (err) {
    console.log(`[error] ML service call failed for ${event.transactionId}:`, err.message);
    return; // stop processing this message -- do not fall through with undefined values
  }

  const predictionCorrect = isPredictionCorrect(prediction, event.groundTruth);

  // Built field by field to match the Prisma Transaction schema --
  // spreading the raw event doesn't work: it has nested
  // features/metadata objects and no top-level `amount`.
  const transaction = {
    transactionId: event.transactionId,
    bankId: event.bankId,
    timestamp: new Date(event.timestamp),
    amount: event.features.Amount,
    merchant: event.metadata.merchant,
    country: event.metadata.country,
    cardType: event.metadata.cardType,
    device: event.metadata.device,
    prediction,
    riskScore,
    modelVersion,
    groundTruth: event.groundTruth,
    predictionCorrect,
    features: event.features,
  };

  try {
    await save(transaction);
  } catch (err) {
    console.log(`[error] Failed to save ${event.transactionId} to the database:`, err.message);
    return; // stop processing this message -- nothing left to do if the save failed
  }

  console.log(
    `[saved] ${transaction.transactionId} | Amount=$${transaction.amount.toFixed(2)} | ` +
      `merchant=${transaction.merchant} | prediction=${transaction.prediction} | ` +
      `riskScore=${transaction.riskScore} | correct=${transaction.predictionCorrect}`
  );

  // Separate try/catch: a Redis failure is logged distinctly and
  // does not undo or crash anything -- the MySQL save has already
  // succeeded by this point.
  try {
    await updateStats(transaction);
    console.log(`[stats] updated for ${transaction.transactionId}`);
  } catch (err) {
    console.log(`[error] Failed to update Redis stats for ${transaction.transactionId}:`, err.message);
    return;
  }

  // Separate try/catch, same reasoning as the stats block above: an
  // SSE broadcast failure is logged distinctly and never crashes the
  // consumer -- the MySQL save and Redis stats update have already
  // succeeded by this point.
  try {
    broadcast("newTransaction", transaction);
    console.log(`[sse] broadcast newTransaction for ${transaction.transactionId}`);
  } catch (err) {
    console.log(`[error] Failed to broadcast newTransaction for ${transaction.transactionId}:`, err.message);
  }
}

module.exports = { processTransactionEvent };
