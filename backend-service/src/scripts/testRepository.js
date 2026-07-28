/**
 * Standalone repository test: save one hardcoded transaction (with a
 * full 30-field features object) and read it back, specifically
 * verifying the JSON column round-trips every field intact.
 */

const { save, findById, prisma } = require("../repository/transactionRepository");

function buildFeatures() {
  // Real values from the dataset's first row, used elsewhere in this
  // project -- realistic rather than arbitrary placeholders.
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

async function main() {
  const features = buildFeatures();

  const transaction = {
    transactionId: "txn_test001",
    bankId: "bank_default",
    timestamp: new Date(),
    amount: 149.62,
    merchant: "Amazon",
    country: "US",
    cardType: "Visa",
    device: "iOS App",
    prediction: "safe",
    riskScore: 0.03,
    modelVersion: "xgboost-v1",
    groundTruth: 0,
    predictionCorrect: true,
    features,
  };

  console.log("Saving transaction via repository.save() ...");
  await save(transaction);
  console.log("Saved.\n");

  console.log("Reading it back via repository.findById() ...");
  const retrieved = await findById(transaction.transactionId);

  console.log("\nRetrieved record:");
  console.log(JSON.stringify(retrieved, null, 2));

  const expectedKeys = Object.keys(features);
  const retrievedKeys = Object.keys(retrieved.features);
  const allKeysPresent = expectedKeys.every((k) => k in retrieved.features);
  const allValuesMatch = expectedKeys.every((k) => retrieved.features[k] === features[k]);

  console.log("\n--- features JSON round-trip check ---");
  console.log(`Expected field count: ${expectedKeys.length}`);
  console.log(`Retrieved field count: ${retrievedKeys.length}`);
  console.log(`All 30 keys present: ${allKeysPresent}`);
  console.log(`All 30 values match exactly: ${allValuesMatch}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
