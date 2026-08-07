/**
 * Verifies the JWT from the auth cookie (controllers/authController.js
 * sets it on login). Rejects with 401 if missing, invalid, or expired;
 * otherwise attaches the decoded payload to req.user and calls next().
 *
 * Applied to /api/stats, /api/transactions, and /api/stream --
 * deliberately NOT /api/health or /api/auth/* (routes/apiRoutes.js),
 * which must stay reachable with no auth at all.
 */

const jwt = require("jsonwebtoken");
const { JWT_SECRET, AUTH_COOKIE_NAME } = require("../config");

function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    // Covers both an invalid signature and an expired token -- either
    // way the caller needs to log in again, and the distinction isn't
    // something the client needs to react to differently.
    return res.status(401).json({ error: "Authentication required" });
  }
}

module.exports = { requireAuth };
