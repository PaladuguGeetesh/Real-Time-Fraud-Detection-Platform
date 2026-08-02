"""Phase 5, Step 2 verification helper: publish ONE real transaction
event to "transactions" on demand, reusing build_event.py so it's a
genuine, realistically-shaped event -- just without the generator's
continuous 1/sec loop, for precise control over test timing.
"""

import json
import sys

import pandas as pd
from kafka import KafkaProducer

sys.path.insert(0, ".")
from build_event import DATA_PATH, build_event

BOOTSTRAP_SERVERS = "localhost:9092"
TOPIC = "transactions"


def main():
    df = pd.read_csv(DATA_PATH)
    row = df.sample(n=1).iloc[0]
    event = build_event(row)

    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    future = producer.send(TOPIC, event)
    future.get(timeout=10)
    producer.flush()
    producer.close()

    print(f"Published {event['transactionId']} | Amount=${event['features']['Amount']:.2f}")


if __name__ == "__main__":
    main()
