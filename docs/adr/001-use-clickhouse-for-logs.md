# 1. Use ClickHouse for audit-log storage and analytics

- **Status:** Proposed
- **Date:** 2026-09-20
- **Deciders:** Backend team, Platform
- **Supersedes:** None
- **Related:** [ADR 002: Write-through Redis cache](002-implement-write-through-redis-cache.md)

> **Not implemented.** This records a decision and its reasoning. Audit logs
> are currently stored in MongoDB as described under *Context*. No ClickHouse
> code exists in this repository.

## Context

The platform keeps three append-only audit collections in MongoDB:

| Collection        | Purpose                                    |
| ----------------- | ------------------------------------------ |
| `AuditLog`        | Deletions and estimation-module history    |
| `GeneralAuditLog` | Cross-module activity, keyed by `module`   |
| `UnifiedAuditLog` | Read-side view backing the audit UI        |

This works, and for point lookups ("show me the history of this purchase
order"), it will keep working. Three pressures push against it over time:

**1. Write amplification.** Audit rows are written on the request path, in the
same handler as the mutation they describe. Each of the five indexes on
`GeneralAuditLog` must be updated on every insert. Audit writes are pure
overhead on user-facing latency, and that overhead grows with each index added
to support a new report.

**2. Analytical queries are the wrong shape for the storage engine.** The
questions asked of audit data are aggregate and time-bounded: approval
throughput by module per week, actions per user over a quarter, an activity
histogram across a date range. These scan large row counts and touch two or
three columns. A row-store reads whole documents to answer them, and the
working set competes with operational data for the same page cache. Adding
indexes to compensate makes pressure (1) worse: the two problems tighten
against each other.

**3. Unbounded growth against operational storage.** Audit data is the fastest-
growing collection group and the one that is never deleted. It is retained for
compliance, so it accumulates indefinitely in the same deployment that serves
attendance punches and journal postings. Storage sizing for the operational
database ends up driven by data that is almost never read.

Retention is also a compliance requirement, which makes "just prune it" the
wrong answer and makes tamper-evidence a real requirement rather than a nicety.

## Decision

Move audit-log **storage and querying** to ClickHouse, keeping MongoDB as the
operational store for everything else.

Specifically:

- Audit events are written to ClickHouse, using `MergeTree` partitioned by
  month and ordered by `(module, performed_at)` to match the dominant query
  shape.
- The write path is asynchronous. Handlers enqueue an event and return;
  a batching writer flushes to ClickHouse on an interval or at a batch-size
  threshold, since ClickHouse strongly prefers batched inserts over row-at-a-time.
- Retention is expressed as a `TTL` clause on the table rather than as
  application code.
- The existing audit-read endpoints keep their response contracts. The storage
  swap is invisible to the SPA.

### Migration

1. Dual-write to MongoDB and ClickHouse; MongoDB remains the read source.
2. Backfill history, then reconcile row counts per module per day.
3. Move reads to ClickHouse behind a feature flag, per endpoint.
4. After a full retention cycle of clean reconciliation, stop the Mongo writes
   and archive the collections.

Each step is independently reversible, which matters because audit data is the
evidence trail used to investigate the system itself. There is no cut-over
during which audit history is unavailable.

## Alternatives considered

**Keep everything in MongoDB, add indexes as needed.** The status quo. Zero
operational cost and no new failure mode: this is the option to stay on if
audit volume plateaus. Rejected on the assumption it will not: every new index
taxes the write path, and index count is exactly what grows as reporting
demand grows.

**MongoDB time-series collections.** A smaller step that would genuinely help
storage density and TTL handling. Rejected because it does not address the
analytical query shape: aggregations still read whole documents, and the
operational and analytical workloads still share a deployment. It would defer
this decision rather than resolve it, which is a legitimate choice if the team
wants to avoid a second datastore.

**PostgreSQL with partitioning.** Mature, well-understood, and a reasonable
destination, especially if the team already runs Postgres. Rejected here
because the workload is append-only with columnar aggregate reads and no join
requirement, which is precisely where a column store's compression and scan
speed pay off, and because introducing a second general-purpose relational
store invites operational data to migrate into it piecemeal.

**Managed observability platform (Datadog, ELK).** Strong tooling, minimal
operational burden. Rejected because these are *business* audit records under a
compliance retention obligation, not application telemetry. Per-GB pricing over
multi-year retention is poorly aligned, and putting the compliance evidence
trail behind a third-party SaaS contract creates a data-residency question that
does not currently exist.

## Consequences

### Positive

- Aggregate queries over the audit history become fast enough to expose
  directly in the UI rather than pre-computing.
- Columnar compression on highly repetitive fields (`module`, `action`,
  `entityType`) substantially reduces storage for the largest dataset.
- Operational MongoDB stops growing with audit volume, so its sizing tracks
  actual operational data.
- Removing audit indexes from the hot write path reduces mutation latency
  across every module.
- Retention becomes a declarative table property instead of application code.

### Negative

- **A second datastore to run, back up, monitor and upgrade.** This is the real
  cost of the decision and should not be understated: it is a standing
  operational commitment, not a one-off migration.
- **Audit writes become asynchronous**, so an event can be enqueued and lost if
  the process dies before the batch flushes. This is the central trade-off:
  audit durability is weakened in exchange for write throughput. Mitigation is a
  durable local queue, and the residual risk must be explicitly accepted by
  whoever owns the compliance requirement. **If that risk is not acceptable,
  this ADR should be rejected rather than amended.**
- ClickHouse has no meaningful `UPDATE`/`DELETE`. Append-only audit data fits
  this, but it forecloses any future requirement to amend a record in place.
- Cross-store joins are gone: enriching an audit row with a current employee
  name becomes an application-side lookup.
- The team takes on a new query dialect and a new set of operational failure
  modes.

### Neutral

- The audit API contract is unchanged, so the SPA is unaffected.
- Point lookups by entity will be *adequate* rather than fast; this is a
  workload ClickHouse is not optimized for, and it is not the dominant pattern.

## Revisit if

- Audit volume plateaus: the status-quo option becomes correct again.
- Asynchronous audit writes prove unacceptable to compliance review.
- The team shrinks to the point where a second datastore is not sustainable.
