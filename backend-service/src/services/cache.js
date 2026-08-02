/**
 * Redis aggregate stats (ARCHITECTURE.md section 5.5). Uses ioredis.
 * Connected once at module load, reused across calls -- same
 * "connect once" pattern as the Kafka producer and Prisma client.
 */

const Redis = require("ioredis");
const { REDIS_HOST, REDIS_PORT, TOP_RISK_LIMIT } = require("../config");

// enableOfflineQueue: false makes a command reject immediately when
// the connection is down, instead of ioredis's default behavior of
// queueing it and silently retrying up to maxRetriesPerRequest (20)
// times with its own backoff before finally rejecting. That default
// only matters during an outage -- it's invisible on the happy path --
// but it matters a lot there: messaging/redisUpdaterConsumer.js relies
// on updateStats() failing fast so it can log-and-move-on without
// retrying, and a slow-to-reject call was measured to run long enough
// to blow through Kafka's consumer session timeout and crash that
// consumer entirely. The silent .on('error') listener below is
// ioredis's own documented recommendation for any long-lived client:
// without one, Node reports every background reconnect-attempt
// failure as an "Unhandled error event", which is just noise here
// since every caller of updateStats()/getStats() already handles
// failures in its own try/catch.
const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, enableOfflineQueue: false });
redis.on("error", () => {});

function todayKey() {
  return new Date().toISOString().slice(0, 10); // e.g. "2026-07-26"
}

async function updateStats(transaction) {
  await redis.incr("stats:totalProcessed");

  if (transaction.prediction === "fraud") {
    await redis.incr(`stats:fraudCount:${todayKey()}`);
  }

  if (transaction.predictionCorrect) {
    await redis.incr("stats:correctCount");
  }

  await redis.zadd("stats:topRisk", transaction.riskScore, transaction.transactionId);
  // Keep only the top 20 by score: ranks are ascending by score, so
  // removing everything except the last 20 ranks keeps the 20 highest.
  await redis.zremrangebyrank("stats:topRisk", 0, -(TOP_RISK_LIMIT + 1));
}

async function getStats() {
  const [totalProcessed, fraudToday, correctCount, topRiskRaw] = await Promise.all([
    redis.get("stats:totalProcessed"),
    redis.get(`stats:fraudCount:${todayKey()}`),
    redis.get("stats:correctCount"),
    redis.zrevrange("stats:topRisk", 0, TOP_RISK_LIMIT - 1, "WITHSCORES"),
  ]);

  const total = parseInt(totalProcessed, 10) || 0;
  const fraud = parseInt(fraudToday, 10) || 0;
  const correct = parseInt(correctCount, 10) || 0;

  const topRisk = [];
  for (let i = 0; i < topRiskRaw.length; i += 2) {
    topRisk.push({ transactionId: topRiskRaw[i], riskScore: parseFloat(topRiskRaw[i + 1]) });
  }

  return {
    totalProcessed: total,
    fraudToday: fraud,
    fraudRate: total > 0 ? fraud / total : 0,
    accuracyRate: total > 0 ? correct / total : 0,
    topRisk,
  };
}

module.exports = { updateStats, getStats };
