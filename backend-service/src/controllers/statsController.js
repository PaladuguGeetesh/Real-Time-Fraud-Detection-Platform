/**
 * HTTP-handling logic for GET /api/stats (ARCHITECTURE.md section 5.7).
 */

const { getStats } = require("../services/cache");

async function getStatsHandler(req, res) {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    // 503, not 500 -- a Redis outage is a known, transient dependency
    // failure, not a server bug. Log the real error server-side only;
    // the response body stays generic so internal error details never
    // leak to the client.
    console.error("GET /api/stats failed:", err.message);
    res.status(503).json({ error: "Stats temporarily unavailable", reason: "cache unreachable" });
  }
}

module.exports = { getStatsHandler };
