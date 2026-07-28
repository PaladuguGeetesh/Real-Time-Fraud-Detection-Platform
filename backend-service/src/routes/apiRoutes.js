/**
 * Route table (ARCHITECTURE.md sections 5.6/5.7) -- URL -> handler
 * mapping only, no logic. Handler logic lives in controllers/.
 */

const express = require("express");
const { getStatsHandler } = require("../controllers/statsController");
const { getTransactionsHandler } = require("../controllers/transactionsController");
const { handleStream } = require("../controllers/streamController");

const router = express.Router();

router.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/api/stats", getStatsHandler);
router.get("/api/transactions", getTransactionsHandler);
router.get("/api/stream", handleStream);

module.exports = router;
