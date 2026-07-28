/**
 * Kafka consumer: connects, subscribes to the `transactions` topic,
 * and delegates each message to services/transactionProcessor.js for
 * scoring, persistence, stats, and SSE broadcast.
 */

const { Kafka } = require("kafkajs");
const { processTransactionEvent } = require("./services/transactionProcessor");
const { KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC, KAFKA_GROUP_ID } = require("./config");

const kafka = new Kafka({
  clientId: "backend-service",
  brokers: KAFKA_BOOTSTRAP_SERVERS,
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      await processTransactionEvent(event);
    },
  });

  console.log(`Kafka consumer running: group="${KAFKA_GROUP_ID}", topic="${KAFKA_TOPIC}"`);
}

module.exports = { startConsumer };
