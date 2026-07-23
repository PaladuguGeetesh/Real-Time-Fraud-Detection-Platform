"""Minimal Kafka connection test: publish one hardcoded message and confirm delivery.

Not the real generator -- just proves the host can reach the Kafka broker
started by docker-compose.yml before any generator/CSV/loop code is written.
"""

import json

from kafka import KafkaProducer

BOOTSTRAP_SERVERS = "localhost:9092"
TOPIC = "transactions"


def main():
    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )

    future = producer.send(TOPIC, {"hello": "world"})
    record_metadata = future.get(timeout=10)  # raises with a full traceback on failure/timeout

    producer.flush()
    producer.close()

    print(
        f"Sent successfully -> topic={record_metadata.topic} "
        f"partition={record_metadata.partition} offset={record_metadata.offset}"
    )


if __name__ == "__main__":
    main()
