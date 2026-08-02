/**
 * Phase 5, Step 1 throwaway: reads the message back from
 * scored-transactions and prints it, confirming the event shape
 * round-trips correctly. Companion to scripts/testScoredEvent.js.
 */

const { Kafka } = require("kafkajs");
const { KAFKA_BOOTSTRAP_SERVERS } = require("../config");

const SCORED_TOPIC = "scored-transactions";

async function main() {
  const kafka = new Kafka({
    clientId: "backend-service-test-consumer",
    brokers: KAFKA_BOOTSTRAP_SERVERS,
  });

  // Unique, throwaway group ID so this always reads from the very
  // start of the topic instead of resuming from a previous test run's
  // committed offset.
  const consumer = kafka.consumer({ groupId: `test-consume-scored-${Date.now()}` });

  await consumer.connect();
  await consumer.subscribe({ topic: SCORED_TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      console.log('Consumed from topic "scored-transactions":');
      console.log(JSON.stringify(event, null, 2));
      await consumer.disconnect();
      process.exit(0);
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
