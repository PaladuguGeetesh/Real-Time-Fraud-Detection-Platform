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
  REDIS_HOST,
  REDIS_PORT,
  TOP_RISK_LIMIT,
  STATS_BROADCAST_INTERVAL_MS,
};
