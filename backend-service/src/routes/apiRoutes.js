/**
 * Route table (ARCHITECTURE.md sections 5.6/5.7) -- URL -> handler
 * mapping only, no logic. Handler logic lives in controllers/.
 */

const express = require("express");
const { getStatsHandler } = require("../controllers/statsController");
const { getTransactionsHandler } = require("../controllers/transactionsController");
const { handleStream } = require("../controllers/streamController");
const { requireAuth } = require("../middleware/authMiddleware");
const authRoutes = require("./authRoutes");

const router = express.Router();

// Unauthenticated: login/logout obviously can't require a token to
// get a token, and health checks must stay reachable regardless of
// auth state (e.g. container healthchecks, uptime monitors).
router.use("/api/auth", authRoutes);
router.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Everything else requires a valid session.
router.get("/api/stats", requireAuth, getStatsHandler);
router.get("/api/transactions", requireAuth, getTransactionsHandler);
router.get("/api/stream", requireAuth, handleStream);

module.exports = router;
