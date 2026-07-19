# Real-Time Credit Card Fraud Detection & Monitoring System
## Architecture & Design Reference

> **Purpose of this document:** the single source of truth for the project. Every design decision, service contract, and build milestone lives here. Update it as decisions change so it never goes stale. Keep it at the repo root so Claude Code (and any teammate) can read it for context.

---

## 1. What We're Building

A simulation of how a payment company (Stripe / PayPal style) monitors card transactions in real time: transactions stream in one at a time, an ML model scores each for fraud, everything is stored, and a live dashboard shows it to fraud analysts — no refresh needed.

Because we have no live transaction feed, we replay the **Kaggle Credit Card Fraud Detection** dataset as if it were happening now.

**This is a genuine event-driven microservices project** — not a monolith with labels — because each service has exactly one responsibility and communicates over a message broker and well-defined APIs.

---

## 2. System at a Glance

```
Kaggle CSV
    │
    ▼
┌─────────────────────┐
│ Transaction         │  reads 1 row/sec, adds fake metadata,
│ Generator (Python)  │  publishes an event
└─────────┬───────────┘
          │ produce
          ▼
     ┌─────────┐
     │  Kafka  │  topic: transactions
     └────┬────┘
          │ consume
          ▼
┌─────────────────────┐        HTTP POST /predict     ┌──────────────────┐
│ Backend Service     │ ─────────────────────────────▶│ ML Service       │
│ (Node.js + Express) │ ◀───────────────────────────── │ (Python/FastAPI) │
│  orchestrator       │        {prediction, score}     │ Isolation Forest │
└──┬──────────┬───────┘                                └──────────────────┘
   │ write    │ update
   ▼          ▼
┌────────┐  ┌────────┐
│MongoDB │  │ Redis  │  (permanent record)  (hot aggregates)
└────────┘  └────────┘
   │
   │ emit newTransaction (Socket.io)
   ▼
┌─────────────────────┐
│ React Dashboard     │  live feed, alerts, charts, filters
└─────────────────────┘
```

Everything runs in Docker, brought up with a single `docker compose up`.

---

## 3. Services & Responsibilities

Single-responsibility is the design rule. If a service starts doing two unrelated things, that's a smell.

| # | Service | Stack | Single Responsibility |
|---|---------|-------|-----------------------|
| 1 | **Transaction Generator** | Python | Read dataset rows, enrich with fake metadata, publish to Kafka |
| 2 | **Kafka** | Confluent/Bitnami image | Decouple producer from consumer; buffer events |
| 3 | **Backend Service** | Node.js + Express | Orchestrate: consume → call ML → persist → cache → push |
| 4 | **ML Service** | Python + FastAPI | Predict fraud from features; return prediction + risk score |
| 5 | **MongoDB** | Official image | Permanent system of record for every processed transaction |
| 6 | **Redis** | Official image | Fast in-memory store for dashboard aggregate stats |
| 7 | **React Dashboard** | React + Vite | Analyst UI: live feed, alerts, charts, filtering |

---

## 4. The Dataset

Kaggle Credit Card Fraud Detection dataset. Columns:

- `Time` — seconds elapsed since first transaction
- `V1`–`V28` — PCA-transformed anonymized features
- `Amount` — transaction amount
- `Class` — `0` = legitimate, `1` = fraud (ground truth)

**Two roles:**
1. **Training** the ML model (offline, one-time, done in the ML service build step).
2. **Source of the "live" stream** replayed by the Generator.

**Important modeling note:** we use **Isolation Forest**, which is *unsupervised* — it does **not** train on the `Class` label. We hold `Class` aside purely to **evaluate** the model (precision/recall) and to tune the score threshold. At prediction time, `Class` is never sent to the ML service — that would be cheating and unrealistic (in production you don't know the label yet).

---

## 5. Data Contracts (the important part)

These contracts are what let the services stay decoupled. Lock them down early; changing them later means touching multiple services.

### 5.1 Transaction Event — Generator → Kafka

Published to Kafka topic `transactions`. JSON:

```json
{
  "transactionId": "txn_a1b2c3d4",
  "timestamp": "2026-07-19T10:30:00.000Z",
  "features": {
    "Time": 12345.0,
    "V1": -1.359, "V2": 0.072, "...": "...", "V28": -0.021,
    "Amount": 149.62
  },
  "metadata": {
    "merchant": "Amazon",
    "country": "US",
    "cardType": "Visa",
    "device": "iOS App"
  },
  "groundTruth": 0
}
```

Notes:
- `features` is exactly what the ML service needs (`Time`, `V1`–`V28`, `Amount`).
- `metadata` is fabricated by the Generator; not in the original dataset.
- `groundTruth` (the real `Class`) is carried for **evaluation/demo only** — the Backend must **not** forward it to the ML service. Keep it so the dashboard can optionally show "model was right/wrong."

### 5.2 Prediction Request — Backend → ML Service

`POST /predict`

```json
{
  "Time": 12345.0,
  "V1": -1.359, "...": "...", "V28": -0.021,
  "Amount": 149.62
}
```

### 5.3 Prediction Response — ML Service → Backend

```json
{
  "prediction": "fraud",        // "fraud" | "safe"
  "riskScore": 0.87,            // normalized 0.0–1.0, higher = riskier
  "modelVersion": "iforest-v1"
}
```

### 5.4 Stored Transaction — Backend → MongoDB

The merged record (system of record). Collection: `transactions`.

```json
{
  "transactionId": "txn_a1b2c3d4",
  "timestamp": "2026-07-19T10:30:00.000Z",
  "amount": 149.62,
  "metadata": { "merchant": "Amazon", "country": "US", "cardType": "Visa", "device": "iOS App" },
  "prediction": "fraud",
  "riskScore": 0.87,
  "modelVersion": "iforest-v1",
  "groundTruth": 0,
  "features": { "...": "kept for audit/retrain, optional" }
}
```

### 5.5 Aggregate Stats — Backend → Redis

Pre-computed, dashboard-facing. Suggested keys:

| Key | Type | Meaning |
|-----|------|---------|
| `stats:totalProcessed` | counter | total transactions ever processed |
| `stats:fraudToday` | counter | frauds flagged today (reset daily) |
| `stats:avgRiskScore` | value | running average risk score |
| `stats:topRisk` | sorted set / list | current top-N riskiest transactions |

### 5.6 Real-Time Push — Backend → Dashboard

Socket.io event `newTransaction`, payload = the Stored Transaction object (5.4, minus bulky `features`). Optionally a second event `statsUpdate` with the Redis aggregates.

### 5.7 REST APIs — Backend (for the dashboard to pull history)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/transactions?limit=&page=&prediction=&country=` | paginated/filterable history from Mongo |
| GET | `/api/stats` | current aggregates from Redis |
| GET | `/api/health` | service health check |

---

## 6. End-to-End Flow (numbered)

1. Generator reads one row from the CSV.
2. Generator fabricates metadata (merchant, country, device, card type) + a transaction ID.
3. Generator merges row + metadata into one event object.
4. Generator publishes the event to Kafka topic `transactions`.
5. Backend consumes the message from Kafka.
6. Backend sends **only** the ML features (`Time`, `V1`–`V28`, `Amount`) to the ML service via `POST /predict`.
7. ML service returns `{prediction, riskScore, modelVersion}`.
8. Backend writes the full merged record to MongoDB.
9. Backend updates the aggregate stats in Redis.
10. Backend emits `newTransaction` over Socket.io.
11. React dashboard receives the event and updates the UI live — no refresh.

---

## 7. Why Each Design Choice Exists

- **Generator → Kafka → Backend:** decouples ingestion from processing. If the Backend restarts or lags, events queue in Kafka instead of being lost.
- **Backend ↔ ML Service split:** fraud prediction is a different workload (Python/ML) than orchestration (Node.js). Separating lets each be built, scaled, and deployed independently.
- **MongoDB + Redis together:** two different needs — permanent queryable storage (Mongo) vs. fast frequently-read aggregates (Redis). One store for both would be either slow (aggregating Mongo every load) or unsafe (Redis isn't durable storage).
- **Socket.io:** a monitoring dashboard is only useful if it reflects *now*. Push beats polling.
- **Isolation Forest (unsupervised):** fraud is rare and behaves like statistical outliers rather than a learnable "fraud pattern," so anomaly detection fits better than a supervised classifier here — and it doesn't need a balanced labeled training set.
- **Docker Compose:** each service isolated in its own container, whole stack up with one command — mirrors real microservice deployment.

---

## 8. Open Design Decisions (to resolve as we build)

These are deliberately not locked yet. We'll decide each when we reach the relevant service.

1. **Isolation Forest `contamination`** parameter and the **risk-score threshold** for flagging fraud — tune against `Class` during training.
2. **Risk score normalization** — Isolation Forest gives an anomaly score; decide how to map it to a clean 0.0–1.0.
3. **Kafka topology** — single topic `transactions`, single partition to start; revisit partitions/consumer groups if we simulate scale.
4. **MongoDB shape** — single `transactions` collection (chosen for now); whether to store full `features` for retraining.
5. **Redis daily reset** — how `fraudToday` resets (TTL vs. date-keyed counters).
6. **Backend resilience** — retry/dead-letter behavior if the ML service is down when a message is consumed.
7. **Generator replay speed** — 1 row/sec default; make it configurable via env var for demos.
8. **Security** — out of scope for the demo (no auth); stated explicitly.

---

## 9. Repository Layout (proposed)

```
fraud-detection-system/
├── ARCHITECTURE.md              ← this file
├── docker-compose.yml
├── .env.example
├── generator/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── generator.py
├── ml-service/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── train.py                 ← offline training, produces model.pkl
│   ├── model.pkl                ← trained Isolation Forest
│   └── app.py                   ← FastAPI /predict
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── kafkaConsumer.js
│       ├── mlClient.js
│       ├── db.js                ← Mongo
│       ├── cache.js             ← Redis
│       ├── socket.js
│       └── routes/
├── dashboard/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
└── data/
    └── creditcard.csv           ← gitignored (large)
```

---

## 10. Build Plan / Milestones

Build bottom-up so each layer can be tested before the next depends on it.

**Phase 0 — Scaffold**
- Repo layout, `docker-compose.yml` with all infra (Kafka, Mongo, Redis) + empty service stubs.
- `.env.example`, `.gitignore` (ignore `data/`, `model.pkl`, `node_modules`).
- Goal: `docker compose up` brings up infra cleanly.

**Phase 1 — ML Service**
- `train.py`: load CSV, train Isolation Forest, evaluate against `Class`, tune threshold, save `model.pkl`.
- `app.py`: FastAPI `/predict` loading the model.
- Goal: `curl` a feature payload, get back a sensible prediction + score.

**Phase 2 — Transaction Generator**
- Read CSV, enrich, publish to Kafka at 1 row/sec.
- Goal: see events landing on the `transactions` topic.

**Phase 3 — Backend Service**
- Kafka consumer → ML client → Mongo write → Redis update → Socket.io emit.
- REST routes (`/api/transactions`, `/api/stats`, `/api/health`).
- Goal: full pipeline works end-to-end, verified via Mongo/Redis contents and socket logs.

**Phase 4 — React Dashboard**
- Socket.io client for live feed, stats cards from `/api/stats`, transaction table with filters, fraud alerts, charts.
- Goal: watch transactions appear live; fraud flagged visibly.

**Phase 5 — Polish**
- Resolve open decisions (§8), tune model, error handling, README, demo script.

---

## 11. Status Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Scaffold | ⬜ Not started | |
| 1 — ML Service | ⬜ Not started | |
| 2 — Generator | ⬜ Not started | |
| 3 — Backend | ⬜ Not started | |
| 4 — Dashboard | ⬜ Not started | |
| 5 — Polish | ⬜ Not started | |

*Update this table as we go so the doc always reflects reality.*
