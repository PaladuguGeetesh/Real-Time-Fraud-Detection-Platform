/**
 * Client for the ML Service's /predict endpoint (ARCHITECTURE.md
 * sections 5.2/5.3). Called from messaging/scoringConsumer.js.
 *
 * Uses native fetch (built into Node 18+) rather than adding axios as
 * a dependency for one HTTP call.
 */

const { ML_SERVICE_URL } = require("../config");

/**
 * @param {object} features - ONLY {Time, V1..V28, Amount}. Never pass
 *   the full event or groundTruth -- the ML service must never see
 *   the label (ARCHITECTURE.md section 5.1).
 * @returns {Promise<{prediction: string, riskScore: number, modelVersion: string}>}
 */
async function predictFraud(features) {
  let response;
  try {
    response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
    });
  } catch (err) {
    throw new Error(`ML service unreachable at ${ML_SERVICE_URL}: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "<no body>");
    throw new Error(`ML service returned ${response.status} ${response.statusText}: ${body}`);
  }

  return response.json();
}

module.exports = { predictFraud };
