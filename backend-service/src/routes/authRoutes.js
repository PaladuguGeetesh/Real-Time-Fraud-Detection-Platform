/**
 * Route table for /api/auth/* -- URL -> handler mapping only, same
 * convention as routes/apiRoutes.js. Mounted there under /api/auth.
 */

const express = require("express");
const { login, logout, me } = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

module.exports = router;
