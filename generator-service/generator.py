"""The real Generator: streams the dataset to Kafka continuously.

Loads creditcard.csv once at startup, then loops through it forever
(wrapping back to the start at the end -- see ARCHITECTURE.md section 8
item 7, continuous demo stream, no stopping). Event construction
(features + tiered metadata + groundTruth) is reused from build_event.py
rather than duplicated -- injection only changes which row gets picked,
never how the event is built.

Fraud injection (section 8 item 7): with FRAUD_INJECTION_EVERY_N > 0,
the base stream is legit-only (Class==0), looping in sequential order,
and every Nth published event is replaced by a random row pulled from
the fraud pool (Class==1) instead of the next sequential legit row.
Set FRAUD_INJECTION_EVERY_N=0 to disable injection and stream the
original dataset in its authentic sequential order instead.
"""

import json
import os
import sys
import time

import pandas as pd
from kafka import KafkaProducer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_event import DATA_PATH, build_event

# Defaults to the host-facing listener for local (non-Docker) dev;
# docker-compose overrides this to "kafka:19092" -- the internal
# listener, reachable only from other containers on the compose
# network -- so the same code runs unmodified in both environments
# (same pattern as backend-service/src/config.js's KAFKA_BROKER).
BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BROKER", "localhost:9092")
TOPIC = "transactions"
PUBLISH_INTERVAL_SECONDS = float(os.environ.get("PUBLISH_INTERVAL_SECONDS", "1.0"))
FRAUD_INJECTION_EVERY_N = float(os.environ.get("FRAUD_INJECTION_EVERY_N","15"))


def main():
    print(f"Loading dataset from {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)

    fraud_pool = df[df["Class"] == 1]
    legit_pool = df[df["Class"] == 0]
    print(f"  {len(df):,} rows loaded -> fraud_pool={len(fraud_pool):,} rows, legit_pool={len(legit_pool):,} rows")

    injection_enabled = FRAUD_INJECTION_EVERY_N > 0
    if injection_enabled:
        print(f"  Fraud injection: ON, every {FRAUD_INJECTION_EVERY_N}th event pulled from fraud_pool")
        stream_source = legit_pool
    else:
        print("  Fraud injection: OFF (FRAUD_INJECTION_EVERY_N=0) -- authentic sequential replay")
        stream_source = df
    print(f"  Publish interval: {PUBLISH_INTERVAL_SECONDS}s\n")

    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )

    published = 0
    try:
        while True:
            for _, row in stream_source.iterrows():
                published += 1

                is_injected = injection_enabled and published % FRAUD_INJECTION_EVERY_N == 0
                if is_injected:
                    row = fraud_pool.sample(n=1).iloc[0]

                event = build_event(row)

                try:
                    future = producer.send(TOPIC, event)
                    future.get(timeout=10)  # confirm delivery before logging/moving on
                except Exception as err:
                    print(f"[warning] Failed to publish {event['transactionId']}: {err}")
                    time.sleep(PUBLISH_INTERVAL_SECONDS)
                    continue  # skip this row, move on rather than crashing the script

                marker = " [INJECTED FRAUD]" if is_injected else ""
                print(
                    f"[{published}] {event['transactionId']} | "
                    f"Amount=${event['features']['Amount']:.2f} | "
                    f"merchant={event['metadata']['merchant']} | "
                    f"groundTruth={event['groundTruth']}{marker}"
                )

                time.sleep(PUBLISH_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nStopping (Ctrl+C received) ...")
    finally:
        producer.flush()
        producer.close()
        print(f"Producer closed. Published {published} event(s) total.")


if __name__ == "__main__":
    main()
