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

async function getTransactionsHandler(req, res) {
  // Invalid/missing page or limit (e.g. non-numeric) fall back to
  // defaults rather than crashing the request.
  const page = parsePositiveInt(req.query.page, 1);
  const limit = parsePositiveInt(req.query.limit, 20);
  const prediction = req.query.prediction || undefined;
  const country = req.query.country || undefined;

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
