/**
 * App bootstrap: creates the Express app, mounts routes, starts the
 * HTTP listener, starts the stats broadcaster, starts all five
 * Phase 5 Kafka consumers (Scoring, MySQL writer, Redis updater,
 * Audit log, Dashboard broadcaster).
 *
 * This is the Phase 5 cutover: the old single kafkaConsumer.js /
 * transactionProcessor.js pipeline has been deleted. Each consumer
 * below independently owns exactly one concern and one consumer
 * group -- see messaging/*.js for the reasoning behind each one.
 */

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const routes = require("./routes/apiRoutes");
const { startStatsBroadcast } = require("./services/statsBroadcaster");
const { startScoringConsumer } = require("./messaging/scoringConsumer");
const { startMysqlWriterConsumer } = require("./messaging/mysqlWriterConsumer");
const { startRedisUpdaterConsumer } = require("./messaging/redisUpdaterConsumer");
const { startAuditLogConsumer } = require("./messaging/auditLogConsumer");
const { startDashboardBroadcasterConsumer } = require("./messaging/dashboardBroadcasterConsumer");
const { PORT, CORS_ORIGIN } = require("./config");

const app = express();

// credentials: true is required for the browser to send/receive the
// auth cookie cross-origin (the dashboard at :5173 calling the
// Backend at :4000). origin must stay a specific value, never "*" --
// browsers reject a wildcard origin combined with credentials:true
// outright, so this isn't just a tightening, it's the only
// configuration that actually works once cookies are involved.
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use(routes);

app.listen(PORT, () => {
  console.log(`Backend service listening on port ${PORT}`);
});

startStatsBroadcast();

// Fire-and-forget: each consumer's own connect/subscribe/run is async
// and non-blocking, so all five run concurrently with Express (and
// with each other) rather than delaying app.listen() above or being
// delayed by it. Each is independent -- one failing to start doesn't
// prevent the others from starting.
startScoringConsumer().catch((err) => {
  console.error("Scoring consumer failed to start:", err);
});

startMysqlWriterConsumer().catch((err) => {
  console.error("MySQL writer consumer failed to start:", err);
});

startRedisUpdaterConsumer().catch((err) => {
  console.error("Redis updater consumer failed to start:", err);
});

startAuditLogConsumer().catch((err) => {
  console.error("Audit log consumer failed to start:", err);
});

startDashboardBroadcasterConsumer().catch((err) => {
  console.error("Dashboard broadcaster consumer failed to start:", err);
});
