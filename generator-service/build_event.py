"""Build transaction event dicts from CSV rows.

Not the real generator -- just proves the event shape matches
ARCHITECTURE.md section 5.1, and that metadata generation (this file's
Step 5 addition) produces plausible values, before any streaming loop
exists. Does not publish to Kafka.
"""

import json
import random
import uuid
from datetime import datetime, timezone

import pandas as pd

DATA_PATH = "../data/creditcard.csv"
BANK_ID = "bank_default"  # multi-tenancy readiness, see ARCHITECTURE.md section 12
FEATURE_COLS = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]

COUNTRIES = ["US", "UK", "CA", "DE", "FR", "AU"]
CARD_TYPES = ["Visa", "Mastercard", "Amex", "Discover"]
DEVICES = ["iOS App", "Android App", "Web", "POS Terminal"]

# Overlapping (low, high) ranges so every non-negative amount matches at
# least one tier, with no gaps. An amount can plausibly fall into more
# than one tier (e.g. $30 could be a Netflix bill or a Target run); the
# merchant is picked from the union of every tier that amount fits.
MERCHANT_TIERS = [
    ("small", 0, 40, ["Starbucks", "Netflix", "Uber Eats"]),
    ("medium", 15, 300, ["Uber", "Shell", "Target", "Walmart"]),
    ("large", 50, float("inf"), ["Amazon", "Best Buy"]),
]


def pick_merchant(amount):
    candidates = [
        merchant
        for _tier_name, low, high, merchants in MERCHANT_TIERS
        if low <= amount <= high
        for merchant in merchants
    ]
    return random.choice(candidates)


def build_metadata(amount):
    return {
        "merchant": pick_merchant(amount),
        "country": random.choice(COUNTRIES),
        "cardType": random.choice(CARD_TYPES),
        "device": random.choice(DEVICES),
    }


def build_event(row):
    amount = float(row["Amount"])
    return {
        "transactionId": "txn_" + uuid.uuid4().hex[:8],
        "bankId": BANK_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "features": {col: float(row[col]) for col in FEATURE_COLS},
        "metadata": build_metadata(amount),
        "groundTruth": int(row["Class"]),
    }


def main():
    df = pd.read_csv(DATA_PATH)
    # Evenly spaced across the sorted Amount range (not a plain random
    # sample) so this demo actually spans small/medium/large tiers
    # instead of leaving it to chance which range gets shown.
    sorted_by_amount = df.sort_values("Amount")
    positions = [int(q * (len(sorted_by_amount) - 1)) for q in (0.15, 0.4, 0.6, 0.85, 0.98)]
    sample = sorted_by_amount.iloc[positions]

    for i, (_, row) in enumerate(sample.iterrows(), 1):
        event = build_event(row)
        print(f"--- Event {i}: Amount=${event['features']['Amount']:.2f} -> merchant={event['metadata']['merchant']} ---")
        print(json.dumps(event, indent=2))
        print()


if __name__ == "__main__":
    main()
