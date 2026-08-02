/**
 * Phase 5, Step 1 throwaway: proves the scored-transactions topic and
 * event shape work before any real Scoring Consumer exists. Publishes
 * ONE hardcoded event -- the original "transactions" event shape
 * (transactionId, bankId, timestamp, features, metadata, groundTruth,
 * per ARCHITECTURE.md section 5.1) plus the scoring fields a real
 * consumer would add (prediction, riskScore, modelVersion,
 * predictionCorrect). No real ML call -- values are hardcoded.
 *
 * Note metadata stays NESTED here, unlike the flattened MySQL row
 * shape (transactionRepository.js) -- this is a Kafka event, following
 * the same shape as the original "transactions" topic, just extended.
 */

const { Kafka } = require("kafkajs");
const { KAFKA_BOOTSTRAP_SERVERS } = require("../config");

const SCORED_TOPIC = "scored-transactions";

function buildFeatures() {
  // Same real first-row dataset values used by scripts/testRepository.js.
  const vValues = [
    -1.3598071336738, -0.0727811733098497, 2.53634673796914, 1.37815522427443,
    -0.338320769942518, 0.462387777762292, 0.239598554061257, 0.0986979012610507,
    0.363786969611213, 0.0907941719789316, -0.551599533260813, -0.617800855762348,
    -0.991389847235408, -0.311169353699879, 1.46817697209427, -0.470400525259478,
    0.207971241929242, 0.0257905801985591, 0.403992960255733, 0.251412098239705,
    -0.018306777944153, 0.277837575558899, -0.110473910188767, 0.0669280749146731,
    0.128539358273528, -0.189114843888824, 0.133558376740387, -0.0210530534538215,
  ];

  const features = { Time: 12345.0 };
  vValues.forEach((v, i) => {
    features[`V${i + 1}`] = v;
  });
  features.Amount = 149.62;
  return features;
}

function buildScoredEvent() {
  return {
    transactionId: "txn_scored_test001",
    bankId: "bank_default",
    timestamp: new Date().toISOString(),
    features: buildFeatures(),
    metadata: {
      merchant: "Amazon",
      country: "US",
      cardType: "Visa",
      device: "iOS App",
    },
    groundTruth: 0,
    prediction: "safe",
    riskScore: 0.03,
    modelVersion: "xgboost-v1",
    predictionCorrect: true,
  };
}

async function main() {
  const kafka = new Kafka({
    clientId: "backend-service-test-producer",
    brokers: KAFKA_BOOTSTRAP_SERVERS,
  });
  const producer = kafka.producer();
  const event = buildScoredEvent();

  await producer.connect();
  await producer.send({
    topic: SCORED_TOPIC,
    messages: [{ value: JSON.stringify(event) }],
  });
  await producer.disconnect();

  console.log(`Published to topic "${SCORED_TOPIC}":`);
  console.log(JSON.stringify(event, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
