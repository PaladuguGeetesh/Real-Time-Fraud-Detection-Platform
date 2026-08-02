# Real-Time Credit Card Fraud Detection & Monitoring System

A simulation of how a payment company (Stripe/PayPal-style) monitors card transactions in real time: transactions stream in one at a time, an ML model scores each for fraud, every result is stored, and a live dashboard shows it to fraud analysts with no page refresh. There's no live transaction feed available for a demo project like this, so the system replays the Kaggle Credit Card Fraud Detection dataset as if it were happening now, at roughly one transaction per second.

It's built as a genuine event-driven microservices system, not a monolith with service names attached to it — each service has exactly one responsibility and everything communicates over a message broker and well-defined APIs, all running in Docker.

**Tech stack at a glance:** Kafka (event backbone) · Node.js/Express (orchestration) · Python/FastAPI (ML serving) · XGBoost (the fraud model) · MySQL (system of record) · Redis (hot aggregates) · React (dashboard) · Docker Compose (deployment).

## Quickstart

Requires Docker and Docker Compose. From a fresh clone:

```bash
docker compose up -d --build
```

That's the entire setup. A first cold start typically takes a couple of minutes — most of the time goes into pulling base images and installing dependencies (Kafka's image, npm/pip installs, the dashboard's production build). Every subsequent restart is much faster, since Docker caches those layers.

Once it's up:
- **Dashboard:** [http://localhost:5173](http://localhost:5173)
- **Backend health check:** [http://localhost:4000/api/health](http://localhost:4000/api/health) → `{"status":"ok"}`

To watch it start up: confirm `kafka`, `mysql`, `redis`, and `ml-service` show `healthy` (they have healthchecks backing them), and `backend-service`, `generator-service`, and `dashboard-service` show `running` (no healthcheck configured for these — `running` is the expected, correct state for them).

```bash
docker compose ps
docker compose logs -f backend-service
```

To stop everything (data persists — MySQL and Kafka both use named volumes):

```bash
docker compose stop
```

## Architecture at a Glance

```
Generator → Kafka (transactions) → ML Scoring
                                       │
                                       ▼
                          Kafka (scored-transactions)
                                       │
                ┌──────────────┬───────┴───────┬──────────────┐
                ▼              ▼               ▼              ▼
            MySQL          Redis          Dashboard        Audit Log
            Writer        Updater        Broadcaster        Writer
                                              │
                                              ▼
                                     React Dashboard
                                (live feed + separate search page)
```

The Generator replays the dataset onto a `transactions` topic. A scoring consumer reads it, calls the ML service, and republishes the result — original data plus the prediction — onto a second topic, `scored-transactions`. Four independent consumers read that second topic in parallel: one writes the permanent record to MySQL, one updates hot aggregate stats in Redis, one pushes live updates to connected dashboards over Server-Sent Events, and one writes a compliance-style audit record for every transaction flagged as fraud. The dashboard itself is two views: a live feed that updates in real time as new transactions arrive, and a separate search page for querying historical data on demand.

## Key Design Decisions

- **Kafka over a simple queue** — a durable, replayable log lets multiple independent consumer groups read the same event stream at their own pace, which a point-to-point queue doesn't support.
- **A second Kafka topic decoupling scoring from everything downstream** — splitting `scored-transactions` off from `transactions` means MySQL writes, Redis updates, the dashboard push, and the audit log all run as fully independent consumers, so a slowdown or outage in any one of them never blocks or delays the others.
- **Tiered failure handling instead of one policy everywhere** — the three consumers writing to durable state (scoring, MySQL, the audit log) retry forever with capped backoff since nothing there can be allowed to go missing, while the two producing regenerable views (Redis stats, the live dashboard push) skip and log on failure instead, since blocking the whole pipeline over a stats cache or a live push isn't worth it.
- **Server-Sent Events over WebSockets** — the dashboard only ever needs server-to-client updates, and SSE is plain HTTP, which scales more simply than standing up WebSocket infrastructure for a channel that never needs to carry traffic the other way.
- **The live feed and search are separate pages, not one combined view** — the live feed is a continuously-updating real-time stream while search is a discrete, on-demand historical query; merging them would mean paginated, filtered results reshuffling underneath a live-scrolling feed, so they're kept as two independent views instead.

## Resetting to a Clean State

```bash
./reset.sh
```

This flushes Redis and truncates the MySQL transaction and audit-log tables back to empty, after an explicit `y/N` confirmation prompt so it can't run by accident. It checks that MySQL and Redis are actually up first, and prints the resulting row/key counts afterward so you can see the reset actually worked. Use it between demo runs, after a load test, or any time you want a clean baseline without tearing down and rebuilding the whole stack — the running services keep working throughout and just resume accumulating data from zero.

## Known Limitations

- **Redis stat drift after an outage isn't self-corrected.** If Redis is unreachable while transactions are still being processed, those updates are skipped rather than queued — the running totals stay permanently undercounted by whatever was missed. This is a cosmetic accuracy gap, not data loss, since MySQL and the audit log are independent of Redis and stay fully correct regardless.
- **The ML scoring step doesn't distinguish failure types during an outage.** Every failed prediction call is retried with the same backoff regardless of cause, so a sustained ML service outage retries each transaction individually instead of the system recognizing "the service itself is down" as one event and pausing accordingly. Nothing is lost either way — this only affects how efficiently a long outage is handled, not correctness.
- **Kafka topic retention is currently left at Kafka's 7-day default**, rather than a value deliberately sized for this system. The durable business record already lives in MySQL and the audit log indefinitely, so this only affects how long raw events stay replayable from Kafka itself, not data durability.

## Project Structure

```
fraud-detection-system/
├── docker-compose.yml     ← brings up all 7 services
├── reset.sh                ← wipes Redis + MySQL back to a clean state
├── data/                   ← the source dataset (gitignored, not checked in)
├── generator-service/      ← Python: replays the dataset onto Kafka
├── ml-service/              ← Python/FastAPI: serves the XGBoost fraud model
├── backend-service/         ← Node.js: five Kafka consumers (scoring, MySQL, Redis, dashboard push, audit log) + REST API
└── dashboard-service/       ← React: the analyst-facing live feed and search UI
```

`kafka`, `mysql`, and `redis` are the other three services in `docker-compose.yml` — they run from official Docker images with no custom code or local folder of their own.
