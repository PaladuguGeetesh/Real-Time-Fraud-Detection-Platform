/**
 * App bootstrap: creates the Express app, mounts routes, starts the
 * HTTP listener, starts the stats broadcaster, starts the Kafka
 * consumer.
 */

const express = require("express");
const { startConsumer } = require("./kafkaConsumer");
const routes = require("./routes/apiRoutes");
const { startStatsBroadcast } = require("./services/statsBroadcaster");
const { PORT } = require("./config");

const app = express();

app.use(routes);

app.listen(PORT, () => {
  console.log(`Backend service listening on port ${PORT}`);
});

startStatsBroadcast();

// Fire-and-forget: the consumer's own connect/subscribe/run is async
// and non-blocking, so it runs concurrently with Express rather than
// delaying app.listen() above or being delayed by it.
startConsumer().catch((err) => {
  console.error("Kafka consumer failed to start:", err);
});
