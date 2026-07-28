/**
 * HTTP-handling logic for GET /api/stream (ARCHITECTURE.md section 5.6).
 * Sets SSE headers, registers/unregisters the connection with
 * services/sseClients.js. The connection is held open indefinitely --
 * this never calls res.end().
 */

const { register, unregister, clientCount } = require("../services/sseClients");

function handleStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx (or similar) proxy buffering
  });
  res.flushHeaders();

  register(res);
  console.log(`[sse] client connected, registry size=${clientCount()}`);

  req.on("close", () => {
    unregister(res);
    console.log(`[sse] client disconnected, registry size=${clientCount()}`);
  });
  // No res.end() -- this connection stays open until the client disconnects.
}

module.exports = { handleStream };
