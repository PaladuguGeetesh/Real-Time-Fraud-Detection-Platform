/**
 * HTTP-handling logic for GET /api/stats (ARCHITECTURE.md section 5.7).
 */

const { getStats } = require("../services/cache");

async function getStatsHandler(req, res) {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    console.error("GET /api/stats failed:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
}

module.exports = { getStatsHandler };
