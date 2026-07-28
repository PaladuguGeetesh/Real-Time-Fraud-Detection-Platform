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
│  orchestrator       │        {prediction, score}     │ XGBoost          │
└──┬──────────┬───────┘                                └──────────────────┘
   │ write    │ update
   ▼          ▼
┌────────┐  ┌────────┐
│ MySQL  │  │ Redis  │  (permanent record)  (hot aggregates)
└────────┘  └────────┘
   │
   │ push newTransaction (SSE)
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
| 2 | **Kafka** | apache/kafka:4.3.1 (KRaft mode) | Decouple producer from consumer; buffer events |
| 3 | **Backend Service** | Node.js + Express | Orchestrate: consume → call ML → persist → cache → push |
| 4 | **ML Service** | Python + FastAPI | Predict fraud from features; return prediction + risk score |
| 5 | **MySQL** | Official image | Permanent system of record for every processed transaction |
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

**Important modeling note:** we ship **XGBoost** (supervised), chosen after benchmarking against Isolation Forest and three other supervised models — see `ML_METHODOLOGY.md` for the full comparison and rationale. `Class` labels are used to *train* XGBoost directly, since labels genuinely exist for this dataset and, in real fraud systems, eventually arrive too (via chargebacks/disputes). That still doesn't mean the label is available at prediction time: `Class` is held aside from the live event and is never sent to the ML service on `POST /predict` — the model only ever sees `Time`, `V1`–`V28`, `Amount`. Sending the label to the service would still be cheating and unrealistic, even though it was used at training time; a real production model doesn't know the label yet when it scores a transaction.

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
- `bankId` is included from the start for multi-tenancy readiness (§12.1). Single-tenant now defaults it to `"bank_default"`; real per-bank values are assigned when multi-tenancy is built. Threading an already-present field later is trivial; retrofitting a missing one is not.
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
  "modelVersion": "xgboost-v1"
}
```

### 5.4 Stored Transaction — Backend → MySQL

The merged record (system of record). Table: `transactions`, written and read exclusively through a `TransactionRepository` (§7.1) — never via ad hoc queries scattered through the codebase.

| Column | Type | Notes |
|--------|------|-------|
| `transactionId` | `VARCHAR`, PK | |
| `bankId` | `VARCHAR` | multi-tenancy readiness, see §12.1 |
| `timestamp` | `DATETIME` | |
| `amount` | `DECIMAL` | |
| `merchant` | `VARCHAR` | promoted from `metadata` to its own column — see below |
| `country` | `VARCHAR` | promoted from `metadata` to its own column — see below |
| `cardType` | `VARCHAR` | promoted from `metadata` to its own column |
| `device` | `VARCHAR` | promoted from `metadata` to its own column |
| `prediction` | `VARCHAR` | `"fraud"` \| `"safe"` |
| `riskScore` | `FLOAT` | |
| `modelVersion` | `VARCHAR` | |
| `groundTruth` | `TINYINT` | the real `Class` — carried for **evaluation/display only**; the Backend must **never** send it to the ML service (§5.1 rule stands) |
| `predictionCorrect` | `BOOLEAN` | `prediction == (groundTruth ? "fraud" : "safe")`, computed by the Backend at write time and stored so the dashboard shows live accuracy without recomputing on every read (resolves §8 item 9) |
| `features` | `JSON` | `Time`, `V1`–`V28`, `Amount` as one JSON blob — kept for audit/retrain |

Two shape decisions worth calling out:
- `metadata` (merchant/country/cardType/device) becomes individual top-level columns rather than a nested blob, because the dashboard filters on `country` and `merchant` (§5.7) — a relational engine can't efficiently filter/index into a JSON field the way it can a plain column.
- `features` stays a single JSON column rather than 30 individual columns (`Time`, `V1`–`V28`, `Amount`), because those fields are always written and read back wholesale for audit/retraining and never queried into individually — 30 extra columns would buy nothing.

### 5.5 Aggregate Stats — Backend → Redis

Pre-computed, dashboard-facing. Keys:

| Key | Type | Meaning |
|-----|------|---------|
| `stats:totalProcessed` | counter | total transactions ever processed |
| `stats:fraudCount:<YYYY-MM-DD>` | counter | frauds flagged on that date (date-keyed, not TTL-reset -- avoids midnight-reset timing edge cases) |
| `stats:correctCount` | counter | predictions matching `groundTruth`, used to compute `accuracyRate` |
| `stats:topRisk` | sorted set | top 20 riskiest transactions (`transactionId` as member, `riskScore` as score), trimmed on every write |

`getStats()` reads these back into `{ totalProcessed, fraudToday, fraudRate, accuracyRate, topRisk }`, where `fraudRate = fraudToday / totalProcessed` and `accuracyRate = correctCount / totalProcessed`.

**Design note:** the original plan tracked `stats:avgRiskScore`, a running average of every transaction's risk score. In practice this was uninformative: with ~99.8% of transactions legitimately safe (near-zero risk score), the average across *all* transactions stayed permanently near zero regardless of how well the model was actually catching fraud -- it couldn't move enough to mean anything. `fraudRate` and `accuracyRate` are normalized, comparable rates instead: they answer "what fraction of traffic is fraud" and "what fraction of predictions are correct," which is what the dashboard actually needs to show analysts.

### 5.6 Real-Time Push — Backend → Dashboard

`GET /api/stream` — Server-Sent Events (`Content-Type: text/event-stream`). The Backend pushes named events down one long-lived HTTP connection per connected browser:

```
event: newTransaction
data: {"transactionId": "txn_a1b2c3d4", ...}

event: statsUpdate
data: {"totalProcessed": 1024, ...}

```

Same event names and payload shapes as originally planned for Socket.io — only the transport changed. `newTransaction`'s payload is the Stored Transaction object (5.4, minus bulky `features`); `statsUpdate`'s payload is the Redis aggregates (5.5). The browser's native `EventSource` API reconnects automatically on disconnect, so the Dashboard doesn't need to hand-roll reconnect logic.

### 5.7 REST APIs — Backend (for the dashboard to pull history)

Routes (`routes/apiRoutes.js`) map each path to a controller, which calls the relevant service/repository — no direct database or Redis calls in route handlers. `/api/health` is the one exception: answered directly in the route with no controller, since a static `{status:"ok"}` response has no logic to separate out (see `PHASE3_BACKEND_JOURNEY.md` §2).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/transactions?limit=&page=&prediction=&country=` | paginated/filterable history — `transactionsController.js` → `TransactionRepository` |
| GET | `/api/stats` | current aggregates — `statsController.js` → `cache.js` (Redis) |
| GET | `/api/health` | service health check — answered directly in `routes/apiRoutes.js` |

---

## 6. End-to-End Flow (numbered)

1. Generator reads one row from the CSV.
2. Generator fabricates metadata (merchant, country, device, card type) + a transaction ID.
3. Generator merges row + metadata into one event object.
4. Generator publishes the event to Kafka topic `transactions`.
5. Backend consumes the message from Kafka.
6. Backend sends **only** the ML features (`Time`, `V1`–`V28`, `Amount`) to the ML service via `POST /predict`.
7. ML service returns `{prediction, riskScore, modelVersion}`.
8. Backend writes the full merged record to MySQL via the repository layer.
9. Backend updates the aggregate stats in Redis.
10. Backend pushes `newTransaction` over SSE.
11. React dashboard receives the event and updates the UI live — no refresh.

---

## 7. Why Each Design Choice Exists

- **Generator → Kafka → Backend:** decouples ingestion from processing. If the Backend restarts or lags, events queue in Kafka instead of being lost.
- **Backend ↔ ML Service split:** fraud prediction is a different workload (Python/ML) than orchestration (Node.js). Separating lets each be built, scaled, and deployed independently.
- **MySQL + Redis together:** two different needs — permanent queryable storage (MySQL) vs. fast frequently-read aggregates (Redis). One store for both would be either slow (aggregating MySQL every load) or unsafe (Redis isn't durable storage). Relational over document store: financial transaction records are the canonical ACID/relational use case, and real payment systems keep their system of record relational for exactly that reason. The actual query patterns here — filter by prediction/country, count today's frauds, pull recent transactions — are natural SQL (`WHERE`, `COUNT`, `ORDER BY ... LIMIT`), not the deeply-nested, schema-flexible documents a document store is suited for. Honest tradeoff: MySQL was chosen over PostgreSQL primarily for developer familiarity — Postgres has stronger JSONB support (indexable, queryable nested fields) and would be the better pick on pure technical merit. That's acceptable here because the one nested blob we store (`features`, §5.4) is never queried into — it's written and read back wholesale, so MySQL's weaker JSON support costs us nothing in practice.
- **SSE (Server-Sent Events):** a monitoring dashboard is only useful if it reflects *now* — push beats polling. Chosen over Socket.io because the data flow here is purely server-to-client (live transaction and stat updates); nothing requires the dashboard to push data back over the same channel. SSE is plain HTTP (`text/event-stream`), so it scales more simply: standard load balancers and reverse proxies understand and pass through a long-lived HTTP response natively, whereas Socket.io's WebSocket-first transport needs a Redis adapter to fan events out across multiple Backend instances and sticky sessions at the load balancer to keep a client pinned to the instance holding its connection.
- **XGBoost (supervised):** `Class` labels are genuinely available for this dataset and, in real fraud systems, eventually arrive too (via chargebacks/disputes) — so a supervised model can legitimately learn from them rather than only detecting statistical outliers. The measured gap was decisive, not marginal: XGBoost reached ~0.88 AUPRC versus Isolation Forest's ~0.28 after equivalent feature engineering and tuning, roughly 3x better fundamental ranking ability. Full model comparison and rationale in `ML_METHODOLOGY.md`.
- **Docker Compose:** each service isolated in its own container, whole stack up with one command — mirrors real microservice deployment.

### 7.1 The Repository Pattern

All data access goes through a repository interface — e.g. a `TransactionRepository` with `save()`, `findRecent()`, `findByPrediction()` methods — rather than the Kafka consumer and REST routes making direct database calls scattered through the codebase.

**Benefits:**
- The persistence implementation is swappable: routes and the consumer depend on the interface, not on MySQL specifically.
- All data access lives in one place instead of being scattered across consumer and route handlers, making it easier to audit and change.
- Easier to test: routes/consumer logic can be tested against a fake/in-memory repository without a real database.

**Honest limits:** a repository interface reduces the *cost* of switching databases; it doesn't eliminate it. A second implementation still has to be written, a schema still has to be designed for the new store, and existing data still has to be migrated — none of that is free just because the interface is swappable. It's also easy to accidentally leak database-specific behavior into the interface (e.g. a method that assumes SQL pagination semantics, or a filter shape that only makes sense for a relational `WHERE` clause) — when that happens, the abstraction is less portable than it looks on paper.

---

## 8. Open Design Decisions (to resolve as we build)

These are deliberately not locked yet. We'll decide each when we reach the relevant service.

1. **Isolation Forest `contamination`** parameter and the **risk-score threshold** for flagging fraud — tune against `Class` during training.
2. **Risk score normalization** — Isolation Forest gives an anomaly score; decide how to map it to a clean 0.0–1.0.
3. **Kafka topology** — single topic `transactions`, single partition to start; revisit partitions/consumer groups if we simulate scale.
4. ~~MongoDB shape~~ **RESOLVED:** MySQL, single `transactions` table (full column list in §5.4), accessed exclusively through a `TransactionRepository` (§7.1) rather than direct queries scattered through the codebase. `features` (`Time`, `V1`–`V28`, `Amount`) stored as one JSON column rather than 30 individual columns, since those fields are only ever read/written wholesale for audit/retraining, never queried into individually.
5. **Redis daily reset** — how `fraudToday` resets (TTL vs. date-keyed counters).
6. **Backend resilience** — retry/dead-letter behavior if the ML service is down when a message is consumed.
7. **Generator replay speed / behavior** — 1 row/sec default, configurable via env var (`PUBLISH_INTERVAL_SECONDS`) for demos. At end of dataset, loop back to the start (continuous demo stream) rather than stopping. Reading strategy: load the CSV once into memory (150MB fits comfortably) rather than streaming row-by-row — simpler, and size doesn't justify streaming.
   - **Fraud injection for demo visibility:** because fraud is only 0.17% of the data, a faithful replay leaves long dead stretches where the dashboard shows no fraud and looks broken. To fix this *without faking model behavior*, the Generator splits the dataset into two pools at load time (`Class==1` fraud rows, `Class==0` legit rows) and injects a **real** fraud row every `FRAUD_INJECTION_EVERY_N` transactions (env var, default 15; set to 0 to disable and replay authentically). This controls the *pacing of the input stream* only — the ML model still independently decides fraud/safe on every transaction. Legitimate for a demo tool as long as it's stated plainly; what's off-limits is tampering with the model's *output*, which this does not do.
8. **Security** — out of scope for the demo (no auth); stated explicitly.
9. ~~Live prediction-vs-`groundTruth` comparison~~ **RESOLVED:** the Backend computes a `predictionCorrect` boolean (`prediction == (groundTruth ? "fraud" : "safe")`) at write time and stores it alongside the record (§5.4), so the dashboard reads live accuracy directly instead of recomputing it on every request. This is only possible because we replay a labeled historical dataset — a real production system wouldn't have the label at prediction time (it arrives weeks later via chargebacks). `groundTruth` still travels *around* the ML service, never into it (§5.1 rule stands).

---

## 9. Repository Layout (proposed)

```
fraud-detection-system/
├── ARCHITECTURE.md              ← this file
├── docker-compose.yml
├── .env.example
├── generator-service/
│   ├── requirements.txt
│   ├── generator.py             ← the real service: continuous stream + fraud injection
│   ├── build_event.py           ← event-construction logic (features, tiered metadata); reused by generator.py
│   ├── test_produce.py          ← minimal Kafka producer connectivity check
│   └── test_consume.py          ← minimal Kafka consumer connectivity check (--tail N to spot-check recent events)
├── ml-service/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── train.py                 ← offline training, produces model.pkl
│   ├── model.pkl                ← trained XGBoost model (xgboost-v1)
│   └── app.py                   ← FastAPI /predict
├── backend-service/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── config.js            ← centralized env vars/constants (PORT, ML_SERVICE_URL, Kafka/Redis settings, etc.)
│       ├── server.js            ← app bootstrap: mounts routes, starts listener/stats broadcaster/Kafka consumer
│       ├── kafkaConsumer.js     ← Kafka connect/subscribe/run only; delegates each message to services/transactionProcessor.js
│       ├── routes/
│       │   └── apiRoutes.js     ← URL → handler mapping only (health, stats, transactions, stream)
│       ├── controllers/
│       │   ├── statsController.js        ← GET /api/stats
│       │   ├── transactionsController.js ← GET /api/transactions
│       │   └── streamController.js       ← GET /api/stream (SSE headers, connection register/unregister)
│       ├── services/
│       │   ├── mlClient.js               ← calls ML Service's /predict
│       │   ├── cache.js                  ← Redis aggregate stats
│       │   ├── sseClients.js             ← in-memory SSE connection registry
│       │   ├── statsBroadcaster.js       ← periodic statsUpdate broadcast (debounced on totalProcessed)
│       │   └── transactionProcessor.js   ← Kafka-message pipeline: score → save → update stats → broadcast
│       ├── repository/
│       │   └── transactionRepository.js  ← thin Prisma wrapper (§7.1): save/findRecent/findById/findPaginated
│       └── scripts/             ← standalone manual verification scripts, not part of the runtime path
│           ├── testRepository.js
│           ├── testGetStats.js
│           └── testMlClient.js
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
- Repo layout, `docker-compose.yml` with all infra (Kafka, MySQL, Redis) + empty service stubs.
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
- Kafka consumer → ML client → repository write (MySQL) → Redis update → SSE push.
- REST routes (`/api/transactions`, `/api/stats`, `/api/health`), served from the repository layer (§7.1).
- Goal: full pipeline works end-to-end, verified via MySQL/Redis contents and the SSE stream.

**Phase 4 — React Dashboard**
- `EventSource` client for live feed, stats cards from `/api/stats`, transaction table with filters, fraud alerts, charts.
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
| 3 — Backend | ✅ Complete | Kafka -> XGBoost -> MySQL/Redis/SSE fully wired and verified; restructured into modular routes/controllers/services layout; see PHASE3_BACKEND_JOURNEY.md for full build log and failure-mode analysis |
| 4 — Dashboard | ⬜ Not started | |
| 5 — Polish | ⬜ Not started | |
| Future — Multi-tenancy + JWT | ⬜ Planned | See §12.1 |

*Update this table as we go so the doc always reflects reality.*

---

## 12. Future Work

### 12.1 Multi-Tenancy + JWT Authentication (planned, not yet built)

**Goal:** turn the single-tenant pipeline into a multi-bank platform where each bank logs in and sees only its own transactions, fraud stats, and dashboard — sharing one set of infrastructure but with fully isolated data.

**Why deferred:** it ripples through every service (Generator, Kafka, Backend, MySQL, Redis, SSE, Dashboard) and adds an auth subsystem. Building it before the core pipeline works single-tenant would tangle five new concerns together and make debugging much harder. Multi-tenancy here is largely *additive* — a `bankId` threaded through, scoped queries, per-bank SSE connection routing, and an auth middleware — so it layers cleanly onto a proven pipeline rather than requiring a rewrite.

**Design-now decisions (so single-tenant code is multi-tenant-ready):**
- The §5.1 event contract includes a `bankId` field from the start, defaulting to `"bank_default"` until real banks exist. Threading a value that already exists everywhere later is trivial; retrofitting a missing field is not.
- Planned per-bank data isolation scheme (documented now, implemented later):
  - **MySQL:** every transaction record carries `bankId`; every query filters on it, enforced at the repository layer (§7.1) rather than left to each call site. A query missing the filter would leak across tenants — the filter must always be present.
  - **Redis:** bank-scoped keys, e.g. `stats:bank_hdfc:fraudToday` rather than `stats:fraudToday`.
  - **SSE:** the Backend maintains an in-memory registry mapping `bankId` to the list of open SSE response objects for that bank's connected dashboards (e.g. a `Map<bankId, Response[]>`); when an event needs pushing, the Backend writes it only to the connections registered under that transaction's `bankId`, so no bank's dashboard ever receives another's data. This security property is unaffected by the SSE-vs-Socket.io choice — `bankId` is always read from the verified JWT (never a client-supplied value), and the registry is keyed by that verified value at connection time.
  - **Kafka:** one `transactions` topic with `bankId` as a message field (simpler than a topic-per-bank for a handful of banks); the Backend routes by the field.

**JWT authentication plan:**
- `POST /login` verifies bank credentials and issues a signed JWT encoding `{ bankId }`.
- The dashboard sends the token in the `Authorization` header on every REST request and when opening the SSE connection.
- Backend middleware verifies the token's signature and reads `bankId` **from the verified token only** — never from the request body or a URL parameter. This is the load-bearing security property: letting the client state its own `bankId` would let any bank request another's data. The signed token is the sole source of identity.

**Build sequencing when the time comes:**
1. Split the dataset into 3–4 bank partitions in the Generator; tag events with real `bankId`s.
2. Thread `bankId` through Backend persistence, caching, and the per-bank SSE connection registry.
3. Add the JWT login endpoint + verification middleware.
4. Add login screen + per-bank views + token handling to the Dashboard.
5. Verify isolation explicitly: confirm Bank A cannot see Bank B's data via any route, including manipulated requests.

This supersedes §8 item 8's "no auth" note — auth moves from out-of-scope to planned future work, deliberately sequenced after the core pipeline is proven.

### 12.2 Collaborative Analyst Features (would require migrating from SSE to WebSockets)

**What:** features requiring genuinely bidirectional, continuous real-time interaction between multiple simultaneously-connected analysts — for example, multiple analysts viewing the same dashboard seeing each other's live actions instantly (one analyst marking a transaction "reviewed" appears on every other analyst's screen without a refresh), live presence indicators (who else is currently viewing this dashboard), or a live collaborative notes/chat thread attached to a flagged transaction.

**Why deferred:** considered unlikely for this project's scope. SSE correctly fits the current requirement — server-to-client only, no case needs the dashboard to push data back over the same channel — and building bidirectional infrastructure for a feature that isn't planned would be premature complexity. Same reasoning already applied to deferring a separate data-service microservice: don't build for a requirement that doesn't exist yet.

**Migration path, if ever needed:** contained to the transport layer. The Backend's event-producing logic (Kafka consumer, ML client, MySQL repository, Redis stats) is decoupled from how updates reach the browser — the same separation-of-concerns principle as the repository pattern (§7.1) — so swapping the SSE endpoint for a WebSocket/Socket.io connection would not require touching any of that logic. Only the transport layer and the frontend's event-receiving code would change, plus whatever new bidirectional events the feature specifically needs (e.g. a `markReviewed` message sent client → server).

**What does NOT require this:** ordinary dashboard actions — filtering, pagination, an analyst triggering an escalation email — do not need bidirectional infrastructure. Those remain ordinary REST calls regardless of transport choice, since the interaction is a discrete request/response, not continuous shared state.
