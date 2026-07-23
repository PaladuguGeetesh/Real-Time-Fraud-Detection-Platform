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
  "bankId": "bank_default",
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
- `bankId` is included from the start for multi-tenancy readiness (§12). Single-tenant now defaults it to `"bank_default"`; real per-bank values are assigned when multi-tenancy is built. Threading an already-present field later is trivial; retrofitting a missing one is not.
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
7. **Generator replay speed / behavior** — 1 row/sec default, configurable via env var (`PUBLISH_INTERVAL_SECONDS`) for demos. At end of dataset, loop back to the start (continuous demo stream) rather than stopping. Reading strategy: load the CSV once into memory (150MB fits comfortably) rather than streaming row-by-row — simpler, and size doesn't justify streaming.
   - **Fraud injection for demo visibility:** because fraud is only 0.17% of the data, a faithful replay leaves long dead stretches where the dashboard shows no fraud and looks broken. To fix this *without faking model behavior*, the Generator splits the dataset into two pools at load time (`Class==1` fraud rows, `Class==0` legit rows) and injects a **real** fraud row every `FRAUD_INJECTION_EVERY_N` transactions (env var, default 15; set to 0 to disable and replay authentically). This controls the *pacing of the input stream* only — the ML model still independently decides fraud/safe on every transaction. Legitimate for a demo tool as long as it's stated plainly; what's off-limits is tampering with the model's *output*, which this does not do.
8. **Security** — out of scope for the demo (no auth); stated explicitly.
9. **Live prediction-vs-`groundTruth` comparison (PHASE 3 — REMEMBER THIS)** — the event carries `groundTruth` (real `Class`) *around* the ML service, never into it (§5.1 rule stands). In Phase 3, decide how the Backend compares the model's prediction against `groundTruth` to drive a live "model was right/wrong" / accuracy display on the dashboard. This is only possible because we replay a labeled historical dataset — a real production system wouldn't have the label at prediction time (it arrives weeks later via chargebacks). Design deliberately in Phase 3; the Generator (Phase 2) only carries the field through, compares nothing.

---

## 9. Repository Layout (proposed)

```
fraud-detection-system/
├── ARCHITECTURE.md              ← this file
├── docker-compose.yml
├── .env.example
├── generator/
│   ├── requirements.txt
│   ├── generator.py             ← the real service: continuous stream + fraud injection
│   ├── build_event.py           ← event-construction logic (features, tiered metadata); reused by generator.py
│   ├── test_produce.py          ← minimal Kafka producer connectivity check
│   └── test_consume.py          ← minimal Kafka consumer connectivity check (--tail N to spot-check recent events)
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
- **Tech decisions:**
  - **Language:** Python (reuses Phase 1 comfort; pandas reads the CSV).
  - **Kafka client:** `kafka-python-ng` — pure Python, simplest install (no `librdkafka` system dependency), near-identical API to the original `kafka-python`. NOTE: originally chose `kafka-python`, but it's unmaintained (last release 2020) and breaks on Python 3.12 (`kafka.vendor.six.moves` ModuleNotFoundError at import). Switched to the actively-maintained community fork `kafka-python-ng`, a near drop-in replacement. May still revisit the official `confluent-kafka` later as optional polish (more production-grade, needs `librdkafka`), but not required at 1 msg/sec.
  - **Kafka broker (Docker):** KRaft mode (Zookeeper-free) — single container, one config, modern default. Avoids the legacy two-container Kafka+Zookeeper setup.
  - **Metadata generation:** curated lists + random sampling (not Faker) — gives control over which merchants/countries/card-types appear so the Phase 4 dashboard looks intentional; zero extra dependencies; easy to add fraud-skewed weighting later.

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
| 0 — Scaffold | 🔶 Partial | Kafka (KRaft) compose being set up as part of Phase 2; full multi-service compose comes later |
| 1 — ML Service | ✅ Complete | XGBoost shipped (xgboost-v1); see ML_METHODOLOGY.md for full model comparison and rationale |
| 2 — Generator | ✅ Complete | Single-tenant; publishes real dataset transactions to Kafka continuously (loops back to the start at the end); tiered realistic metadata (merchant chosen relative to Amount); configurable fraud injection via `FRAUD_INJECTION_EVERY_N` (default 15, 0 to disable) |
| 3 — Backend | ⬜ Not started | Remember §8 item 9 (groundTruth comparison) when starting |
| 4 — Dashboard | ⬜ Not started | |
| 5 — Polish | ⬜ Not started | |
| Future — Multi-tenancy + JWT | ⬜ Planned | See §12 |

*Update this table as we go so the doc always reflects reality.*

---

## 12. Future Work: Multi-Tenancy + JWT Authentication (planned, not yet built)

**Goal:** turn the single-tenant pipeline into a multi-bank platform where each bank logs in and sees only its own transactions, fraud stats, and dashboard — sharing one set of infrastructure but with fully isolated data.

**Why deferred:** it ripples through every service (Generator, Kafka, Backend, Mongo, Redis, Socket.io, Dashboard) and adds an auth subsystem. Building it before the core pipeline works single-tenant would tangle five new concerns together and make debugging much harder. Multi-tenancy here is largely *additive* — a `bankId` threaded through, scoped queries, Socket.io rooms, and an auth middleware — so it layers cleanly onto a proven pipeline rather than requiring a rewrite.

**Design-now decisions (so single-tenant code is multi-tenant-ready):**
- The §5.1 event contract includes a `bankId` field from the start, defaulting to `"bank_default"` until real banks exist. Threading a value that already exists everywhere later is trivial; retrofitting a missing field is not.
- Planned per-bank data isolation scheme (documented now, implemented later):
  - **Mongo:** every transaction record carries `bankId`; every query filters on it. A query missing the filter would leak across tenants — the filter must always be present.
  - **Redis:** bank-scoped keys, e.g. `stats:bank_hdfc:fraudToday` rather than `stats:fraudToday`.
  - **Socket.io:** each dashboard joins a room named for its `bankId`; the Backend emits transaction events *to that room only*, so no bank's dashboard ever receives another's data.
  - **Kafka:** one `transactions` topic with `bankId` as a message field (simpler than a topic-per-bank for a handful of banks); the Backend routes by the field.

**JWT authentication plan:**
- `POST /login` verifies bank credentials and issues a signed JWT encoding `{ bankId }`.
- The dashboard sends the token in the `Authorization` header on every REST request and on the Socket.io connection.
- Backend middleware verifies the token's signature and reads `bankId` **from the verified token only** — never from the request body or a URL parameter. This is the load-bearing security property: letting the client state its own `bankId` would let any bank request another's data. The signed token is the sole source of identity.

**Build sequencing when the time comes:**
1. Split the dataset into 3–4 bank partitions in the Generator; tag events with real `bankId`s.
2. Thread `bankId` through Backend persistence, caching, and Socket.io rooms.
3. Add the JWT login endpoint + verification middleware.
4. Add login screen + per-bank views + token handling to the Dashboard.
5. Verify isolation explicitly: confirm Bank A cannot see Bank B's data via any route, including manipulated requests.

This supersedes §8 item 8's "no auth" note — auth moves from out-of-scope to planned future work, deliberately sequenced after the core pipeline is proven.
