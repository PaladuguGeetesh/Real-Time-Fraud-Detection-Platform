/**
 * Thin repository wrapping Prisma calls (ARCHITECTURE.md section 7.1).
 * Routes and the Kafka consumer depend on this module, not on Prisma
 * or MySQL directly.
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function save(transaction) {
  return prisma.transaction.create({ data: transaction });
}

async function findRecent(limit) {
  return prisma.transaction.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

async function findById(transactionId) {
  return prisma.transaction.findUnique({ where: { transactionId } });
}

/**
 * @param {object} params
 * @param {number} params.page - 1-indexed.
 * @param {number} params.limit - page size.
 * @param {string} [params.prediction] - filter, omitted entirely if not provided.
 * @param {string} [params.country] - filter, omitted entirely if not provided.
 */
async function findPaginated({ page, limit, prediction, country }) {
  const where = {};
  if (prediction) where.prediction = prediction;
  if (country) where.country = country;

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

module.exports = { save, findRecent, findById, findPaginated, prisma };
