/**
 * Shared in-memory registry of open SSE connections (ARCHITECTURE.md
 * section 5.6). Used by controllers/streamController.js (register/
 * unregister on connect/disconnect) and services/transactionProcessor.js
 * and services/statsBroadcaster.js (broadcast on new events/ticks).
 */

const clients = new Set();

function register(res) {
  clients.add(res);
}

function unregister(res) {
  clients.delete(res);
}

function clientCount() {
  return clients.size;
}

function broadcast(eventName, data) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
}

module.exports = { register, unregister, clientCount, broadcast };
