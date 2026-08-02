/**
 * Centralized configuration constants -- env vars with their defaults,
 * and the values that were previously hardcoded inline in individual
 * files. Same values/defaults throughout; this is a relocation only.
 */

const PORT = process.env.PORT || 4000;

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

const KAFKA_BOOTSTRAP_SERVERS = ["localhost:9092"];
const KAFKA_TOPIC = "transactions";
const KAFKA_GROUP_ID = "backend-service-group";

// Phase 5: the ML Scoring Consumer's output topic.
const KAFKA_SCORED_TOPIC = "scored-transactions";

// Shared retry policy (src/messaging/retryWithBackoff.js), used by
// every per-concern Kafka consumer -- not scoring-specific despite the
// name history. Retries are unlimited (no DLQ, no give-up point --
// every message must eventually be handled) with exponential backoff
// between attempts, doubling from the base delay up to this ceiling
// so an extended outage settles into retrying at a fixed, bounded
// interval instead of the wait growing forever.
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;

const REDIS_HOST = "localhost";
const REDIS_PORT = 6379;
const TOP_RISK_LIMIT = 20;

const STATS_BROADCAST_INTERVAL_MS = 5000;

module.exports = {
  PORT,
  ML_SERVICE_URL,
  KAFKA_BOOTSTRAP_SERVERS,
  KAFKA_TOPIC,
  KAFKA_GROUP_ID,
  KAFKA_SCORED_TOPIC,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  REDIS_HOST,
  REDIS_PORT,
  TOP_RISK_LIMIT,
  STATS_BROADCAST_INTERVAL_MS,
};
