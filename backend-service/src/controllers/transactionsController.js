/**
 * HTTP-handling logic for GET /api/transactions (ARCHITECTURE.md
 * section 5.7). All data access goes through transactionRepository.js
 * -- no direct Prisma calls here.
 */

const { findPaginated } = require("../repository/transactionRepository");

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// ?country=US,UK,DE -- comma-separated, multi-select. A single value
// (?country=US) splits into a one-element array, which behaves
// identically to equality once it reaches the repository's `in` filter.
function parseCountryList(value) {
  if (!value) return undefined;
  const countries = value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return countries.length > 0 ? countries : undefined;
}

async function getTransactionsHandler(req, res) {
  // Invalid/missing page or limit (e.g. non-numeric) fall back to
  // defaults rather than crashing the request.
  const page = parsePositiveInt(req.query.page, 1);
  const limit = parsePositiveInt(req.query.limit, 20);
  const prediction = req.query.prediction || undefined;
  const country = parseCountryList(req.query.country);

  try {
    const { transactions, total, totalPages } = await findPaginated({ page, limit, prediction, country });
    res.json({
      data: transactions,
      pagination: { total, page, limit, totalPages },
    });
  } catch (err) {
    console.error("GET /api/transactions failed:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

module.exports = { getTransactionsHandler };
