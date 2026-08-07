/**
 * Centralized configuration constants -- env vars with their defaults,
 * and the values that were previously hardcoded inline in individual
 * files. Same values/defaults throughout; this is a relocation only.
 */

// Explicit, not incidental: @prisma/client happens to auto-load .env
// as a side effect of its own initialization, but relying on that for
// unrelated env vars (JWT_SECRET below) would make their availability
// depend on Node's require() order -- whether some file requiring
// Prisma happened to run before this one. Loading here, first, is
// deterministic regardless of require order.
require("dotenv").config();

const PORT = process.env.PORT || 4000;

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// Defaults to the host-facing listener for local (non-Docker) dev;
// docker-compose overrides this to "kafka:19092" -- the internal
// listener, reachable only from other containers on the compose
// network -- so the same code runs unmodified in both environments.
const KAFKA_BOOTSTRAP_SERVERS = [process.env.KAFKA_BROKER || "localhost:9092"];
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

// Same pattern as KAFKA_BOOTSTRAP_SERVERS above: docker-compose
// overrides this to "redis" (the container's service name on the
// compose network); local host dev keeps the localhost default.
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = 6379;
const TOP_RISK_LIMIT = 20;

const STATS_BROADCAST_INTERVAL_MS = 5000;

// Single hardcoded analyst credential -- no User table, no per-bank
// scoping (that's multi-tenancy, deliberately deferred future work).
// JWT_SECRET and ANALYST_PASSWORD_HASH have no defaults on purpose:
// an app silently running with an undefined signing secret or a
// missing password hash is worse than one that fails to start, so
// the guard below throws immediately instead of limping along
// insecurely.
const JWT_SECRET = process.env.JWT_SECRET;
const ANALYST_USERNAME = process.env.ANALYST_USERNAME || "analyst";
const ANALYST_PASSWORD_HASH = process.env.ANALYST_PASSWORD_HASH;
const JWT_EXPIRY = "8h";
const AUTH_COOKIE_NAME = "auth_token";

if (!JWT_SECRET || !ANALYST_PASSWORD_HASH) {
  throw new Error(
    "Missing required auth config: JWT_SECRET and ANALYST_PASSWORD_HASH must both be set in the environment."
  );
}

// The dashboard's own origin -- CORS must echo this exact value, never
// a wildcard, since a wildcard origin combined with credentials:true
// (required for cookies to work cross-origin) isn't something browsers
// even permit.
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

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
  JWT_SECRET,
  ANALYST_USERNAME,
  ANALYST_PASSWORD_HASH,
  JWT_EXPIRY,
  AUTH_COOKIE_NAME,
  CORS_ORIGIN,
};
