/**
 * Standalone test: calls getStats() directly and prints the result,
 * to confirm it returns the clean, computed object correctly.
 */

const { getStats } = require("../services/cache");

getStats()
  .then((stats) => {
    console.log("getStats() result:");
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("getStats() failed:", err);
    process.exit(1);
  });
