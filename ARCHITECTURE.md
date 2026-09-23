# Architecture

How this system is put together, and why. This document covers the parts that
are not obvious from reading a single file: how work propagates between
modules, how the data layer is indexed for the access patterns that actually
occur, and how the accounting integration stays safe under retries.

> **Scope note.** Everything described under *Implemented* exists in this
> repository and can be traced to the files cited. Sections marked *Planned*
> describe decisions that have been recorded but not yet built: they are
> written up in [`docs/adr/`](docs/adr/) and called out explicitly so this
> document is never read as describing infrastructure that isn't here.

---

## 1. System shape

```
┌──────────────────────┐        HTTPS / JSON          ┌───────────────────────┐
│   React 19 SPA       │ ───────────────────────────► │  Express 5 API        │
│   (frontend/)        │ ◄─────────────────────────── │  (backend/)           │
│                      │   Bearer JWT on every call   │                       │
│  • React Router 7    │                              │  • auth + RBAC        │
│  • axios interceptor │                              │  • 34 route modules   │
│  • CSS design tokens │                              │  • node-cron sweeps   │
└──────────────────────┘                              └───────────┬───────────┘
                                                                  │ Mongoose 8
                                                      ┌───────────▼───────────┐
                                                      │      MongoDB          │
                                                      │  ~30 collections      │
                                                      └───────────┬───────────┘
                                                                  │ XML export
                                                      ┌───────────▼───────────┐
                                                      │  Tally Prime (external│
                                                      │  accounting system)   │
                                                      └───────────────────────┘
```

The two workspaces are deployed independently. The SPA is a static bundle
served by nginx; the API is a long-lived Node process. They share nothing but
the HTTP contract: there is no SSR, no shared module, and no build-time
coupling between them.

### Why a monolithic API

The API is a single Express process rather than a set of services. That is a
deliberate fit to the domain: almost every write crosses module boundaries
(an attendance punch touches projects, employees, holidays, leave and system
settings within one request), and the transactional boundary is a single
MongoDB deployment. Splitting these into services would convert in-process
function calls into distributed transactions without buying any independent
scaling benefit at the current load.

The module boundaries are still explicit (`routes/`, `models/`, `services/`,
`utils/<domain>/`), so the seams exist if that calculus ever changes.

---

## 2. Data flows

### 2.1 Request-driven domain flows

The primary flows are synchronous and request-scoped. The longest is the
procure-to-pay chain, which is worth tracing because it explains most of the
accounting model:

```
PurchaseRequest ──approve──► PurchaseOrder ──receive (GRN)──► SupplierBill
                                                                    │
                                                        three-way match
                                                     (PO ↔ GRN ↔ Bill)
                                                                    │
                                                                    ▼
                                                             JournalEntry
                                                          (balanced, POSTED)
                                                                    │
                                                          Tally XML voucher
```

Each arrow is an explicit state transition guarded by role checks, not an
implicit side effect. The three-way match
([`utils/accounts/threeWayMatch.js`](backend/utils/accounts/threeWayMatch.js))
is the gate: a supplier bill cannot be journalized unless its quantities and
amounts reconcile against the purchase order and the goods-receipt note.

`JournalEntry` enforces its own invariants in a `pre('validate')` hook rather
than trusting callers: debits must equal credits to four decimal places, no
line may carry both a debit and a credit, and any non-`MANUAL` source must
name the document it came from
([`models/JournalEntry.js`](backend/models/JournalEntry.js)). An unbalanced
voucher cannot reach the database from any code path.

Money is stored as `Decimal128`, never as a float. All arithmetic goes through
[`utils/accounts/decimalHelpers.js`](backend/utils/accounts/decimalHelpers.js),
which quantizes to four decimal places at every step. The balance comparison
deliberately rounds to a fixed precision so that binary float drift introduced
anywhere upstream cannot reject an otherwise balanced voucher.

### 2.2 Scheduled sweeps: the event layer

Time-based and threshold-based events are produced by cron sweeps registered
at boot in [`utils/hrCron.js`](backend/utils/hrCron.js), which is required
only after the Mongo connection is established:

| Schedule      | Sweep                | Emits                                          |
| ------------- | -------------------- | ---------------------------------------------- |
| `0 2 * * *`   | Document expiry      | `HRAlert` per expiring passport/visa/labour card/Emirates ID/insurance/medical |
| `15 2 * * *`  | Budget overrun       | `HRAlert` when aggregated labour cost exceeds a project's budget |
| `30 2 * * *`  | Selfie retention     | Deletes attendance selfies past the retention window |
| `55 23 * * *` | Daily status         | Fills `Attendance` rows with `absent`/`weekend`/`holiday`/`leave` |
| `0 3 * * MON` | Probation / contract | `HRAlert` for probation and contract end dates |

These are the system's domain events, and `HRAlert` is the event log the UI
consumes. Three properties make the design work:

**Idempotent by construction.** Every sweep checks for an existing *open*
alert of the same `(employee, alertType, relatedDocument)` before creating
one. Re-running a sweep (after a crash, a redeploy, or a manual invocation)
produces no duplicates. The alert is the deduplication key; there is no
separate "already processed" table to fall out of sync.

**Bucketed, not continuous.** Expiry alerts fire on crossing the 90/60/30/14/7/0
day boundaries rather than every day, so a document expiring in three months
produces six alerts over its lifetime, not ninety.

**Never destructive to recorded facts.** The daily status sweep will not touch
a row that has time logs (a real punch always wins over a derived status)
and only overwrites statuses that are themselves auto-derived (`not_marked`,
`absent`, `weekend`, `holiday`, `leave`). A manual HR override is never
clobbered by a sweep that runs later.

Each sweep is wrapped in `safeRun`, so a failure logs and is contained rather
than taking down the scheduler with it.

**Current limitation.** These are in-process `node-cron` timers. Running two
API replicas runs every sweep twice. The idempotency checks above mean this
produces no duplicate alerts, but it does duplicate the read load, and the
selfie-retention sweep would race on file deletion. Moving to a single
scheduled worker, or a distributed lock, is a prerequisite for horizontal
scaling of the API tier.

### 2.3 Audit logging

Auditing is split across three collections by access pattern, not by accident:

- **`AuditLog`**: deletion and estimation-module history, indexed for
  "what was deleted, by whom, when".
- **`GeneralAuditLog`**: cross-module activity, indexed by `module` and actor.
- **`UnifiedAuditLog`**: the read-side view that the UI queries.

Audit rows are append-only. They are written on the request path, in the same
handler as the mutation, so an action and its record share the request's fate.

---

## 3. Indexing strategy

Indexes here are chosen per access pattern. The rules the schema follows:

### 3.1 Compound indexes ordered for the actual query

Mongo can use a prefix of a compound index, so field order encodes the
supported queries. `Attendance` carries the clearest examples
([`models/Attendance.js`](backend/models/Attendance.js)):

```js
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ supervisor: 1, date: -1 });
attendanceSchema.index({ markedBy: 1, date: -1 });
attendanceSchema.index({ 'projectAllocations.projectId': 1 });
```

The `{ employee, date }` index does double duty: it serves the per-employee
history query *and* enforces "one attendance row per employee per day" as a
database constraint rather than an application check. Two concurrent punch
requests cannot create two rows: the second gets a duplicate-key error.

The descending `date` on the supervisor and `markedBy` indexes matches how
those screens read: newest first, paginated. An ascending index would serve
the equality predicate but force a sort.

### 3.2 Partial unique indexes for conditional constraints

The strongest example is the supplier-bill guard
([`models/JournalEntry.js`](backend/models/JournalEntry.js)):

```js
journalEntrySchema.index(
  { 'source.purchaseOrder': 1, 'source.grnNumber': 1, 'source.supplierBill': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'source.kind': 'SUPPLIER_BILL',
      'source.purchaseOrder': { $exists: true },
      'source.supplierBill': { $exists: true },
    },
  }
);
```

This is the double-posting guard for accounts payable: the same
`(purchase order, GRN, supplier bill)` triple can be journalized exactly once.
The `partialFilterExpression` is what makes it usable: without it, every
manual journal entry with no source references would collide on a single
all-null key. The constraint applies only to the rows it is about.

The same technique appears as `{ unique: true, sparse: true }` on
`Company.registrationNumber` and `Company.trn`: unique when present, unconstrained
when absent.

### 3.3 Indexing the expiry sweeps

The HR sweeps scan by date threshold, so every document expiry field is indexed
individually ([`models/Employee.js`](backend/models/Employee.js)):

```js
employeeSchema.index({ 'documents.passport.expiryDate': 1 });
employeeSchema.index({ 'documents.visa.expiryDate': 1 });
// … labourCard, emiratesId, insurance
```

These exist for the nightly cron, not for user-facing queries. They are the
difference between a range scan and a collection scan on every sweep.

Similarly, `{ 'timeLogs.timeOut': 1, 'timeLogs.timeIn': 1 }` on `Attendance`
exists specifically so the selfie-retention sweep can find old logs cheaply.

### 3.4 Text indexes for operator search

`CompanyDocument` and `Credential` carry text indexes across their
human-readable fields:

```js
companyDocumentSchema.index({ documentName: 'text', description: 'text', tags: 'text' });
```

One text index per collection is a MongoDB limit, so these are composed
deliberately rather than added per field.

### 3.5 What is *not* indexed

Low-cardinality flags are not indexed on their own: an index on a boolean
that splits the collection in half is rarely worth its write cost. Where such
fields appear in an index (`{ isActive: 1 }` on `AccountGroup`), it is because
the collection is small and almost every read filters on it.

---

## 4. Idempotency in the Tally integration

The accounting system of record is Tally Prime, an external desktop
application. The ERP posts journal entries to it as XML vouchers. This is the
one integration boundary the ERP does not control, so it is designed on the
assumption that **every step can be retried and any acknowledgement may
arrive twice, late, or not at all.**

### 4.1 The attempt ledger

Nothing about the sync is stored as a mutable flag on the journal entry alone.
Every action appends a row to `VoucherSyncTrack`
([`models/VoucherSyncTrack.js`](backend/models/VoucherSyncTrack.js)):

```js
{
  journalEntry: ObjectId,   // which voucher
  attemptNo:    Number,     // monotonic per journal entry
  action:       'XML_GENERATED' | 'DOWNLOADED' | 'ACK_SYNCED' | 'FAILED',
  xmlPayload:   String,     // exact bytes handed out
  xmlChecksum:  String,     // content hash, indexed
  agentId:      String,     // which agent acknowledged
  performedBy:  ObjectId,
}
```

`JournalEntry.tallySyncStatus` is a denormalized cache of the latest state for
list queries. The attempt ledger is the truth. This means a disputed sync can
always be reconstructed: which bytes were generated, when, by whom, and what
came back.

### 4.2 Checksum-matched acknowledgement

The acknowledgement endpoint
([`routes/accounts/tallySync.js`](backend/routes/accounts/tallySync.js)) is
the closest thing to a webhook in the system: it is called by an external
agent after it imports a voucher:

```
POST /api/accounts/tally-sync/:id/ack   { checksum, agentId? }
```

It does **not** trust the caller's claim that the import succeeded. It
requires the caller to present the checksum of the payload it actually
imported, and matches that against a prior `DOWNLOADED` attempt for the same
journal entry. No matching attempt means a `400`: the acknowledgement is
rejected, not recorded.

This gives three guarantees:

1. **Content-addressed, not ID-addressed.** An ack proves which *bytes* were
   imported. If the voucher was regenerated after the agent downloaded it
   (because an account mapping changed), the stale checksum no longer matches a
   current attempt and the ack is refused. The operator is forced to re-download
   rather than silently marking a superseded voucher as synced.

2. **Replay is inert.** A duplicate ack finds the same attempt, appends
   another `ACK_SYNCED` row, and sets `tallySyncStatus` to `SYNCED`, which it
   already was. The operation is idempotent because the terminal state is
   idempotent, and the duplicate is preserved in the ledger rather than hidden.

3. **Re-download is safe and visible.** Regenerating XML for an
   already-downloaded entry is explicitly allowed and produces a new attempt
   with an incremented `attemptNo`. Crucially, it will *not* downgrade a
   `SYNCED` entry back to `DOWNLOADED`: once Tally has the voucher, an
   operator fetching a copy does not reopen the sync.

### 4.3 Why not push directly to Tally

Tally Prime runs on an operator's desktop, typically behind NAT with no stable
inbound address. The export is therefore pull-based: the ERP makes vouchers
available, an agent (or a human) fetches them, and the ack closes the loop.
The checksum protocol is what makes that asynchronous, unordered, at-least-once
channel safe.

---

## 5. Authorization

### 5.1 Two-layer model

**Layer 1: authentication.** [`middleware/auth.js`](backend/middleware/auth.js)
verifies the bearer token against `JWT_SECRET`. There is no fallback secret:
`jwt.verify` is called with `process.env.JWT_SECRET` directly, and the process
refuses to boot if that variable is unset. A hardcoded default would be a
publicly known signing key.

The same middleware re-checks `user.isActive` on every request, behind a
30-second in-process cache. Deactivating a user (offboarding, termination)
takes effect within a minute without waiting for token expiry, at the cost of
one indexed lookup per user per 30 seconds.

**Layer 2: role checks.** [`middleware/rbac.js`](backend/middleware/rbac.js)
provides `requireRole` (all of) and `requireAnyRole` (any of), applied
per-route.

### 5.2 Row-level scoping

Role checks answer "may this user call this endpoint". They do not answer
"which rows". For attendance (where a supervisor may mark some employees but
not others), `scopeAttendanceToProjects` resolves the caller's reachable set
*before* the handler runs and attaches it to the request:

- `req.scopedProjectIds`: projects visible to the caller
- `req.scopedWorkerUserIds`: users the caller may write attendance for
- `req.scopedEmployeeIds`: employees reachable via project assignment

The rules encode a real organizational constraint: a project engineer may mark
supervisors *and* site workers on their assigned projects; a site supervisor
may mark site workers only, and specifically not peer supervisors. Because the
scope is computed server-side from project membership, a client cannot widen it
by manipulating a request parameter.

The set is resolved through two paths (project membership arrays and
`Employee.assignedProjects`), because the two drift in practice: a worker may
have an employee record before a user account exists, or be assigned through
a different flow. Covering both avoids a class of "employee is invisible to
their own supervisor" bugs.

### 5.3 Role weights

Roles carry numeric weights ([`utils/roleWeight.js`](backend/utils/roleWeight.js))
so that seniority comparisons ("may this user override that user's record")
are a numeric test rather than a hardcoded role list that drifts as roles are
added.

---

## 6. Frontend architecture

### 6.1 State

There is no global state container. The application uses React's built-in
primitives:

- **Server state** is fetched per-screen with `useEffect` + axios and held in
  local component state. Screens are the cache boundary.
- **Session state** (token, user) lives in `localStorage`, read through
  [`lib/roles.js`](frontend/src/lib/roles.js).
- **Cross-cutting concerns** (auth headers, 401 handling) are centralized in
  the axios interceptor rather than in components.

This is a deliberate fit for the access pattern: screens are largely
independent CRUD surfaces with little shared mutable state between them. The
cost is duplicated fetch logic across components and no cross-screen cache; a
server-state library would be the natural next step if screens start sharing
data, and that is a more targeted fix than a global store.

### 6.2 The API boundary

[`lib/api.js`](frontend/src/lib/api.js) is the single HTTP entry point. Every
call goes through it, which is what makes two policies enforceable in one
place:

- The bearer token is attached on every request, and `Content-Type` is
  *removed* for `FormData` so the browser can set its own multipart boundary,
  a subtle failure mode when file upload is bolted onto a JSON client.
- Any `401` clears the stored session and returns the user to login, so an
  expired or revoked token cannot leave the UI in a half-authenticated state.

Both an axios instance and a `fetch` helper are exported; they share the same
base URL and auth behaviour.

### 6.3 Routing and guards

`RoleGate` ([`components/RoleGate.jsx`](frontend/src/components/RoleGate.jsx))
wraps routes and redirects unauthorized users. Its role helpers live in
`lib/roles.js`: a module that exports both a component and plain functions
disables React Fast Refresh for everything importing it.

**These guards are UX, not security.** They hide navigation the user cannot
act on. Every one of them has a server-side counterpart, and the server never
trusts the client's view of a role.

### 6.4 Styling

Plain CSS with a custom property design system
([`design-system/tokens.css`](frontend/src/design-system/tokens.css)). Theming
is a `data-theme` attribute on `<html>`, set from `localStorage` by an inline
script in `index.html` *before* first paint to avoid a flash of the wrong
theme.

---

## 7. File handling

Uploads are written to disk by `multer` under `backend/uploads/<domain>/` and
served statically, with one carve-out.

Attendance selfies are biometric data tied to GPS coordinates. The static
mount explicitly returns `403` for `/uploads/attendance/**`
([`index.js`](backend/index.js)), so those files are reachable *only* through
a gated endpoint that applies the same scoping rules as the rest of the
attendance module. Everything else under `/uploads` is served directly.

Retention is enforced rather than assumed: the nightly sweep unlinks selfie
files past the configured window and clears their URLs, while leaving the
surrounding audit trail (timestamps, distance, IP) intact. The evidence that
a punch happened outlives the image of the person who made it.

> **Deployment note.** Local disk means the API is stateful. The compose setup
> mounts a named volume; a multi-replica deployment needs object storage
> behind the same interface.

---

## 8. Planned

Recorded decisions that are **not** implemented in this repository:

| Decision | ADR | Status |
| --- | --- | --- |
| ClickHouse for audit-log analytics | [001](docs/adr/001-use-clickhouse-for-logs.md) | Proposed |
| Write-through Redis cache | [002](docs/adr/002-implement-write-through-redis-cache.md) | Proposed |

The Redis container in `docker-compose.yml` and the `REDIS_URL` variable in
`.env.example` exist so the cache work can start without touching the
orchestration. **No application code reads them today.**
