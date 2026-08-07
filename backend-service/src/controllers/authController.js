/**
 * HTTP-handling logic for POST /api/auth/login, POST /api/auth/logout,
 * and GET /api/auth/me. Single hardcoded analyst credential -- no User
 * table, no per-bank scoping (see config.js).
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {
  JWT_SECRET,
  JWT_EXPIRY,
  AUTH_COOKIE_NAME,
  ANALYST_USERNAME,
  ANALYST_PASSWORD_HASH,
} = require("../config");

// httpOnly: JS on the page can never read this cookie (defends against
// XSS stealing the token). sameSite: "lax": localhost:5173 and
// localhost:4000 are different origins (different ports) but the same
// "site" per the SameSite spec (site is scheme+registrable-domain,
// port doesn't count) -- Lax already permits this without needing
// SameSite=None, which would additionally require Secure (HTTPS).
// secure: only over HTTPS, so left off for local HTTP dev and turned
// on automatically once this ever runs behind TLS in production.
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000, // 8h, matches JWT_EXPIRY
};

async function login(req, res) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // bcrypt.compare() always runs against the one real stored hash,
  // regardless of whether `username` matches -- there's no separate
  // "look up the user" step that could short-circuit and return
  // measurably faster for a wrong username than a wrong password.
  const passwordMatches = await bcrypt.compare(password, ANALYST_PASSWORD_HASH);
  const usernameMatches = username === ANALYST_USERNAME;

  if (!usernameMatches || !passwordMatches) {
    // Deliberately generic -- never reveal which field was wrong.
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  // Never in the response body -- only as an httpOnly cookie, so it's
  // inaccessible to page JS on either side.
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ status: "ok" });
}

function logout(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, COOKIE_OPTIONS);
  res.json({ status: "ok" });
}

// Behind requireAuth (routes/authRoutes.js) -- a cheap, dependency-free
// "am I logged in" check. Deliberately NOT /api/stats or similar: a
// real endpoint's own failure modes (e.g. a Redis outage returning
// 503) have nothing to do with authentication, and reusing one here
// would make the frontend misread "a dependency is down" as "log back
// in," booting an already-authenticated analyst to the login page
// during an unrelated outage.
function me(req, res) {
  res.json({ username: req.user.username });
}

module.exports = { login, logout, me };
