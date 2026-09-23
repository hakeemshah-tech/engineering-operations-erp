# 2. Implement a write-through Redis cache for hot read paths

- **Status:** Proposed
- **Date:** 2026-09-20
- **Deciders:** Backend team, Platform
- **Supersedes:** None
- **Related:** [ADR 001: ClickHouse for audit logs](001-use-clickhouse-for-logs.md)

> **Not implemented.** A Redis container is defined in `docker-compose.yml` and
> `REDIS_URL` is documented in `.env.example` so this work can begin without
> touching orchestration, but **no application code reads either today.** The
> in-process cache described under *Context* is what currently exists.

## Context

Three read paths run on nearly every request and hit MongoDB for data that
changes rarely.

**1. The active-user check.** [`middleware/auth.js`](../../backend/middleware/auth.js)
re-reads `user.isActive` on every authenticated request, so that deactivating a
user takes effect without waiting for token expiry. It is already cached, in a
`Map` in the Node process, with a 30-second TTL:

```js
const activeCache = new Map(); // userId -> { isActive, until }
const ACTIVE_TTL_MS = 30 * 1000;
```

This works well for a single process and is the right amount of machinery for
one. It does not survive contact with a second replica:

- Each replica keeps its own copy, so a deactivated user stays valid for up to
  30 seconds *per replica*, and `invalidateActiveCache()` only clears the
  process that happened to serve the offboarding request. The others keep
  honouring the session until their own TTL lapses.
- The cache is cold after every deploy and restart.
- It is unbounded: one entry per user seen since boot, never evicted.

**2. System settings.** `SystemSettings.getSettings()` backs attendance rules,
IP-lock configuration, retention windows and accounts defaults. It is read on
effectively every attendance operation and written perhaps a few times a month.

**3. Role weights.** Seniority comparisons resolve role documents to numeric
weights on permission-sensitive paths. The role set changes very rarely.

All three share a shape: **read-heavy, small, rarely written, and correctness-
sensitive when stale.** That last property is what makes a shared cache with
explicit invalidation the right tool, rather than a longer TTL.

## Decision

Introduce Redis as a shared cache for these paths, using **write-through with
explicit invalidation** rather than TTL-only expiry.

### Pattern

On read: return the cached value if present; otherwise load from MongoDB,
populate the cache, and return. On write: update MongoDB first, then update or
delete the cache key in the same handler. MongoDB remains the source of truth:
Redis is never written without a corresponding durable write, and the cache is
always safe to flush entirely.

A TTL is still set on every key, as a backstop against a missed invalidation
rather than as the primary correctness mechanism.

### Keyspace

| Key | Value | TTL | Invalidated on |
| --- | --- | --- | --- |
| `user:{id}:active` | boolean | 5 min | User deactivation, offboarding completion, role change |
| `settings:system` | settings document | 1 h | Any settings write |
| `role:weights` | role → weight map | 1 h | Role create/update/delete |

TTLs lengthen relative to today's 30 seconds precisely *because* invalidation
becomes explicit and reaches every replica. The current short TTL is
compensating for the absence of cross-process invalidation.

### Scope boundary

This ADR covers **reference data only**. Caching per-request business
data (attendance rows, journal entries, project lists) is explicitly out of
scope. Those are read-modify-write under concurrency, where a cache introduces
consistency problems disproportionate to the gain. The three paths above are
chosen because they are effectively read-only at request time.

### Degradation

Redis is a cache, not a dependency. Every read falls back to MongoDB when
Redis is unavailable, and a cache error is logged, not raised. **Losing Redis
must degrade latency, never correctness or availability**: this is the
property that makes the whole design acceptable, and any change that violates
it invalidates this ADR.

Because the cache holds authorization-relevant data, failure is handled by
falling back to the database, never by assuming a cached-but-unreachable value
was permissive.

## Alternatives considered

**Keep the in-process cache.** Zero new infrastructure, and entirely adequate
while the API runs as a single process. This remains the correct choice if
horizontal scaling is not planned: the ADR is really a prerequisite for
multi-replica deployment, not an optimization in its own right.

**Longer in-process TTLs.** Cheapest possible change, and strictly worse on the
dimension that matters: it widens the window in which a deactivated user
retains access. Rejected because the TTL is short *for a security reason*.

**Sticky sessions so a user always reaches the same replica.** Would make the
per-process cache coherent for a given user. Rejected because it constrains
load balancing, breaks down on replica restart, and does nothing for
`settings:system` or `role:weights`, which are global rather than per-user.

**Cache-aside with TTL only, no explicit invalidation.** Simpler to implement
and a common default. Rejected for the same reason as longer TTLs: the
staleness window for `user:{id}:active` is a security property. Explicit
invalidation is the point of this decision, not an embellishment.

**MongoDB change streams to drive invalidation.** More elegant, and removes the
need for handlers to remember to invalidate. Rejected as premature: it requires
a replica set, adds a consumer to operate, and the write paths needing
invalidation are few and well-known. Worth revisiting if the keyspace grows.

## Consequences

### Positive

- Deactivation propagates to every replica immediately instead of up to 30
  seconds per replica, a security improvement, and the main motivation.
- The API tier becomes horizontally scalable without per-replica cache drift.
- One fewer MongoDB read per authenticated request, and one fewer per
  attendance operation.
- Cache survives deploys and restarts, removing the cold-start read spike.
- Memory is bounded and evicted (`maxmemory` + `allkeys-lru`) rather than
  growing unboundedly in the Node heap.

### Negative

- **A new piece of infrastructure to run and monitor**, even though the
  application tolerates its absence.
- **Every write path that touches cached data must remember to invalidate.**
  This is the primary ongoing risk: a missed invalidation produces a stale
  authorization decision, and the failure is silent until the TTL lapses. It
  must be enforced by routing all such writes through a small number of
  functions that own both the database write and the invalidation, not left to
  per-handler discipline.
- Cache-key management becomes a real concern, including key versioning when a
  cached shape changes during a rolling deploy.
- Local development gains a dependency, mitigated by the fallback path and the
  compose setup.
- Debugging acquires a new question: is this value stale?

### Neutral

- No API contract changes.
- `docker-compose.yml` already provisions Redis with an LRU eviction policy and
  no persistence, which is the correct configuration for a pure cache: a cache
  that survives restart is a cache that can serve stale data after one.

## Revisit if

- The API stays single-replica for the foreseeable future: the in-process
  cache is then sufficient and this is unnecessary complexity.
- Missed invalidations occur in practice, which would argue for change streams.
- The cached keyspace grows beyond reference data, which would mean the scope
  boundary above has eroded and needs re-drawing.
