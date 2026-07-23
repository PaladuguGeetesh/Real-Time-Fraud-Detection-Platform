"""Minimal Kafka connection test: consume from the topic and print what's there.

Not the real consumer -- just proves the host can read back what's been
published, before any generator/CSV/loop code exists.

Default: reads from the beginning and prints every message, same as
before. Pass --tail N to only print the last N messages instead --
useful for spot-checking recent events without scrolling past hundreds
of lines. --tail seeks directly to (end offset - N) rather than
consuming everything and filtering, so it stays fast as the topic grows.
"""

import argparse
import json

from kafka import KafkaConsumer, TopicPartition

BOOTSTRAP_SERVERS = "localhost:9092"
TOPIC = "transactions"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-n", "--tail", type=int, default=None,
        help="Only print the last N messages instead of everything from the beginning.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    consumer = KafkaConsumer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        consumer_timeout_ms=5000,  # stop iterating after 5s of no new messages
    )

    if args.tail is None:
        consumer.subscribe([TOPIC])
    else:
        partitions = consumer.partitions_for_topic(TOPIC)
        if not partitions:
            print(f"Topic '{TOPIC}' does not exist yet.")
            consumer.close()
            return

        topic_partitions = [TopicPartition(TOPIC, p) for p in partitions]
        consumer.assign(topic_partitions)
        end_offsets = consumer.end_offsets(topic_partitions)
        for tp in topic_partitions:
            consumer.seek(tp, max(end_offsets[tp] - args.tail, 0))

    count = 0
    for message in consumer:
        count += 1
        print(
            f"topic={message.topic} partition={message.partition} "
            f"offset={message.offset} value={message.value}"
        )

    consumer.close()
    print(f"\nDone -- read {count} message(s), exiting after idle timeout.")


if __name__ == "__main__":
    main()
