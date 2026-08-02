/**
 * Thin repository wrapping Prisma calls for the AuditLog table, same
 * pattern as repository/transactionRepository.js. Written only by
 * messaging/auditLogConsumer.js -- no REST endpoint or dashboard UI
 * reads from this table by design; direct SQL is the intended access
 * pattern for now, so this module intentionally has no findX()
 * functions yet.
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function save(auditLog) {
  return prisma.auditLog.create({ data: auditLog });
}

module.exports = { save, prisma };
