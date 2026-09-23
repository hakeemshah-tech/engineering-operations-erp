# Engineering Operations ERP

A production-grade ERP platform for a construction and engineering services
business, covering the full commercial lifecycle: lead capture, estimation and
quotation, project delivery, procurement, inventory, HR and attendance, and
double-entry accounting with an external ledger integration.

Built as a MERN monorepo: a React 19 SPA and an Express 5 / MongoDB API,
orchestrated with npm workspaces and Turborepo.

[![CI/CD](https://github.com/hakeemshah-tech/engineering-operations-erp/actions/workflows/ci-cd.yml/badge.svg)](../../actions/workflows/ci-cd.yml)

> **Portfolio snapshot.** This is a sanitized extract of a private production
> system. See [Governance & NDA Compliance](#-governance--nda-compliance) at
> the bottom for what was removed and why.

---

## Contents

- [Project overview](#project-overview)
- [System architecture](#system-architecture)
- [Core features](#core-features)
- [Local setup](#local-setup)
- [Repository layout](#repository-layout)
- [Commands](#commands)
- [Engineering standards](#engineering-standards)
- [Governance & NDA Compliance](#-governance--nda-compliance)

---

## Project overview

The platform replaces a set of disconnected spreadsheets and a standalone
accounting package with one system where a lead becomes a quotation, a
quotation becomes a project, a project consumes materials and labour, and all
of it lands in a balanced double-entry ledger without manual re-keying.

**Domain modules**

| Module | Covers |
| --- | --- |
| **Sales** | Leads, site visits, quotations, revisions, variations |
| **Projects** | Project records, site teams, labour budgets |
| **Procurement** | Material requests, purchase requests, purchase orders, suppliers, three-way match |
| **Inventory** | Stores, materials, brands, stock movement |
| **HR** | Employees, onboarding/offboarding, documents, leave, holidays, alerts |
| **Attendance** | GPS + selfie punch, geofencing, office IP lock, supervisor marking |
| **Accounts** | Chart of accounts, journal entries, supplier bills, sales claims, salary runs, VAT reporting, Tally sync |

### Tenancy model

The system is **single-tenant by deployment**: one organization per deployment,
with its own database and its own API process. This is enforced in the schema,
not merely by convention: `Company` rejects a second profile at the model
layer ([`models/Company.js`](backend/models/Company.js)):

```js
if (count > 0) {
  return next(new Error('A company profile already exists. Only one company profile is allowed.'));
}
```

Isolation is therefore absolute: there is no tenant discriminator that a
query can forget, and no class of cross-tenant data leak, because there is no
second tenant in the database to leak to. The cost is per-tenant operational
overhead: each organization is a separate deployment to run and upgrade.

Moving to shared-database multi-tenancy would mean a tenant key on every
collection, tenant scoping enforced at the Mongoose layer rather than in
handlers, tenant-prefixed cache keys, and per-tenant sequence generators for
document numbering. That is a substantial change and is **not** implemented
here; the current design deliberately trades deployment density for isolation.

---

## System architecture

```
┌────────────────────────┐                        ┌────────────────────────┐
│  frontend/             │   JSON over HTTPS      │  backend/              │
│  React 19 SPA          │ ◄────────────────────► │  Express 5 API         │
│                        │   Bearer JWT           │                        │
│  React Router 7        │                        │  Mongoose 8 ODM        │
│  axios + interceptors  │                        │  JWT auth + RBAC       │
│  CSS design tokens     │                        │  node-cron sweeps      │
│  Vite 7 build          │                        │  multer uploads        │
└────────────────────────┘                        └───────────┬────────────┘
                                                              │
                                                  ┌───────────▼────────────┐
                                                  │  MongoDB               │
                                                  └───────────┬────────────┘
                                                              │ XML vouchers
                                                  ┌───────────▼────────────┐
                                                  │  Tally Prime (external)│
                                                  └────────────────────────┘
```

### Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, React Router 7, axios, react-window, react-quill |
| Styling | Plain CSS with a custom-property design system (`design-system/tokens.css`) |
| Client state | React hooks + `localStorage`; no global store |
| Backend | Node.js 20+, Express 5, Mongoose 8 |
| Database | MongoDB 7 |
| Auth | JWT (`jsonwebtoken`), bcrypt password hashing |
| Scheduling | `node-cron` in-process |
| Monorepo | npm workspaces + Turborepo |
| Quality | ESLint 9 (flat config), Prettier, Jest, Husky + lint-staged |
| Containers | Docker Compose (client, API, MongoDB, Redis) |

> **On styling and state:** this project uses a hand-rolled CSS custom-property
> design system rather than Tailwind, and React's built-in state primitives
> rather than Redux. Both are deliberate (see
> [Core features](#state-management)) and neither library is a dependency.
> The table above reflects what is actually installed.

### Workspace data flow

The two workspaces share **no code**, only the HTTP contract. They build,
test, version and deploy independently.

```
        ┌──────────── npm workspaces (single lockfile, hoisted node_modules) ───────────┐
        │                                                                               │
   frontend/                                                                       backend/
        │                                                                               │
   vite build ──► static bundle ──► nginx ──► browser ──HTTP──► Express ──► Mongoose ──► MongoDB
        │                                                                               │
        └──────────── turbo run build / lint / test (cached, parallel) ─────────────────┘
```

Turborepo runs tasks across both workspaces in parallel and caches results by
input hash, so an unchanged workspace is skipped on re-run rather than rebuilt.

**One boundary is worth calling out:** Vite inlines `VITE_*` variables at
*build* time. `VITE_API_BASE_URL` is baked into the bundle, so pointing the SPA
at a different API is a rebuild, not a restart, which is why it is a Docker
build argument rather than a runtime environment variable.

For event flows, indexing strategy and the integration idempotency design, see
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Core features

### Role-based access control

Authorization is enforced in two layers, both server-side.

**Route-level.** [`middleware/auth.js`](backend/middleware/auth.js) verifies the
bearer token, then [`middleware/rbac.js`](backend/middleware/rbac.js) applies
`requireRole` (all of) or `requireAnyRole` (any of) per route.

**Row-level.** Role checks answer *may this user call this endpoint*; they do
not answer *which records*. For attendance, `scopeAttendanceToProjects`
resolves the caller's reachable set before the handler runs:

- A **project engineer** may mark supervisors and site workers, on projects
  where they are the assigned engineer.
- A **site supervisor** may mark site workers only, not peer supervisors.
- **HR, managers and admins** are unscoped.

The scope is computed from project membership on the server, so a client
cannot widen it by editing a request parameter.

Two further properties:

- **No fallback secret.** `jwt.verify` is called with `process.env.JWT_SECRET`
  and nothing else, and the process refuses to boot without it. A default
  signing key shipped in source is a publicly known signing key.
- **Revocation without waiting for expiry.** Every request re-checks
  `user.isActive` behind a 30-second cache, so offboarding a user ends their
  session within a minute.

Frontend guards (`RoleGate`) hide navigation the user cannot act on. They are
UX, not security: every guard has a server-side counterpart.

### State management

No Redux, no Zustand, no global store.

- **Server state** is fetched per screen and held in component state. Screens
  are the cache boundary.
- **Session state** (token, user) lives in `localStorage`, read through
  [`lib/roles.js`](frontend/src/lib/roles.js).
- **Cross-cutting concerns** live in the axios interceptor
  ([`lib/api.js`](frontend/src/lib/api.js)): the bearer token is attached to
  every request, `Content-Type` is stripped for `FormData` so the browser can
  set its own multipart boundary, and any `401` clears the session and returns
  to login.

This fits the access pattern: screens are largely independent CRUD surfaces
with little shared mutable state. The honest cost is duplicated fetch logic and
no cross-screen cache. If screens start sharing data, a server-state library
(TanStack Query) is the targeted fix - a global store would be solving a
different problem.

### Audit logging

Append-only, written on the request path in the same handler as the mutation,
so an action and its record share the request's fate. Split across three
collections by access pattern (deletion history, cross-module activity, and
the unified read view), each indexed for its own query shape.

See [ARCHITECTURE.md §2.3](ARCHITECTURE.md#23-audit-logging), and
[ADR 001](docs/adr/001-use-clickhouse-for-logs.md) for where this is headed.

### Accounting integrity

- **Balanced or rejected.** `JournalEntry` validates debits against credits to
  four decimal places before any write. An unbalanced voucher cannot reach the
  database from any code path.
- **Decimal128 throughout.** No floats in money arithmetic.
- **Double-posting guard.** A partial unique index makes
  `(purchase order, GRN, supplier bill)` journalizable exactly once, enforced
  by the database, not by a handler check.
- **Idempotent external sync.** Tally acknowledgements are matched by payload
  checksum against a recorded attempt, so replays are inert and stale
  acknowledgements are refused. See
  [ARCHITECTURE.md §4](ARCHITECTURE.md#4-idempotency-in-the-tally-integration).

### Attendance and privacy

GPS geofencing (haversine distance against a per-location radius), optional
office IP locking, and selfie capture on punch in/out.

Selfies are biometric data tied to GPS coordinates and are treated as such: the
static file mount returns `403` for `/uploads/attendance/**`, so they are
reachable only through a scoped endpoint, and a nightly sweep deletes them past
the configured retention window while leaving the surrounding audit trail
intact.

---

## Local setup

### Prerequisites

- **Docker** with Compose v2 (the only requirement for the container route)
- **Node.js ≥ 20.19** and npm ≥ 10 (for the local route)

### Option A: Docker Compose (recommended)

Brings up the React client, the Node API, MongoDB and Redis together.

```bash
git clone https://github.com/hakeemshah-tech/engineering-operations-erp.git
cd engineering-operations-erp

# 1. Create the root env file. Compose reads this one directly.
cp .env.example .env

# 2. Set JWT_SECRET - compose refuses to start without it.
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#    …paste the output into .env as JWT_SECRET=…

# 3. Build and start everything.
docker compose up --build
```

| Service | URL |
| --- | --- |
| Client | http://localhost:5173 |
| API | http://localhost:5000 |
| Health probe | http://localhost:5000/health |
| MongoDB | mongodb://localhost:27017 |
| Redis | redis://localhost:6379 |

Seed the first admin account (the seed script refuses to run without a
password - there is no default):

```bash
docker compose exec -e SEED_ADMIN_PASSWORD='<choose-a-password>' api npm run seed:roles
docker compose exec -e SEED_ADMIN_PASSWORD='<choose-a-password>' api npm run seed
docker compose exec api npm run seed:coa     # chart of accounts
```

Useful operations:

```bash
docker compose logs -f api        # follow API logs
docker compose ps                 # container health
docker compose down               # stop, keep data
docker compose down -v            # stop and delete volumes
```

> Changing `VITE_API_BASE_URL` requires `docker compose up --build`, not a
> restart: Vite inlines it at build time.

### Option B: Local Node

Requires a MongoDB instance you can reach.

```bash
npm install                       # once, at the root - installs both workspaces

cp .env.example backend/.env      # keep the [BACKEND] block, set MONGODB_URI + JWT_SECRET
cp .env.example frontend/.env     # keep the [FRONTEND] block

npm run dev                       # starts API and client together
```

Or individually:

```bash
npm run dev:backend               # API on :5000
npm run dev:frontend              # Vite dev server on :5173
```

> Install from the **repository root**, never from inside a workspace: this is
> an npm workspace with a single hoisted `node_modules` and one lockfile.
> The root `.npmrc` sets `legacy-peer-deps=true` because React 19 is used with
> `react-quill@2`, which still declares a React 18 peer.

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| `JWT_SECRET is not set` on boot | Expected. Set it in `.env` - there is deliberately no default. |
| `MONGODB_URI is not set` on boot | Same fail-fast guard. |
| Client loads, every API call fails | `VITE_API_BASE_URL` wrong, or baked in at build time. Rebuild. |
| `SEED_ADMIN_PASSWORD is not set` | Expected. Pass one; the seed will not invent a default. |
| Port already in use | Override `CLIENT_PORT` / `API_PORT` / `MONGO_PORT` / `REDIS_PORT` in `.env`. |

---

## Repository layout

```
.
├── frontend/                 # React 19 SPA (workspace)
│   ├── src/
│   │   ├── components/       # Feature components, grouped by module
│   │   │   ├── accounts/     # Ledger, journals, Tally sync, VAT
│   │   │   ├── dashboards/   # Role-specific dashboards
│   │   │   ├── hr/           # Employees, attendance, leave, offboarding
│   │   │   ├── locations/    # Geofence locations and groups
│   │   │   ├── punch/        # GPS + selfie attendance capture
│   │   │   └── settings/     # Admin configuration
│   │   ├── design-system/    # Shared primitives + CSS tokens
│   │   ├── lib/              # api client, roles, JWT, Google Maps
│   │   └── utils/
│   ├── Dockerfile            # Multi-stage → nginx
│   └── nginx.conf            # SPA fallback + cache headers
│
├── backend/                  # Express 5 API (workspace)
│   ├── config/               # Tally hierarchy whitelist
│   ├── middleware/           # auth, rbac, accounts-role guards
│   ├── models/               # ~30 Mongoose schemas
│   ├── routes/               # 34 route modules (accounts/ nested)
│   ├── services/             # Cross-module orchestration
│   ├── utils/
│   │   ├── accounts/         # Decimal math, numbering, three-way match
│   │   └── tally/            # XML voucher builders, checksums
│   ├── __tests__/            # Jest unit tests
│   └── uploads/              # Runtime file storage (contents gitignored)
│
├── docs/adr/                 # Architecture Decision Records
├── .github/
│   ├── workflows/ci-cd.yml   # Lint, test, build, image build
│   └── CODEOWNERS            # Review routing
├── .husky/pre-commit         # lint-staged
├── ARCHITECTURE.md           # Data flows, indexing, idempotency
├── docker-compose.yml        # client + api + mongo + redis
├── turbo.json                # Task graph and caching
└── .env.example              # Single source for all environment templates
```

---

## Commands

Run from the repository root.

| Command | Does |
| --- | --- |
| `npm install` | Install both workspaces (single lockfile) |
| `npm run dev` | Start API and client in parallel |
| `npm run build` | Build all workspaces via Turborepo |
| `npm run lint` | ESLint across both workspaces |
| `npm test` | Jest suite |
| `npm run format` | Prettier write across the repo |
| `npm run docker:up` | `docker compose up --build` |
| `npm run docker:down` | Stop and remove volumes |

Workspace-scoped:

```bash
npm run <script> --workspace backend
npm run <script> --workspace frontend
```

Backend data scripts: `seed`, `seed:roles`, `seed:coa`,
`backfill:role-weights`, `backfill:operational-scope`,
`backfill:control-ledger-names`.

---

## Engineering standards

**CI/CD:** [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) runs
on every push: backend ESLint, Jest with a coverage artifact, and a Vite
production build with the bundle uploaded as an artifact. Container images are
built on `main` behind a green pipeline, with GitHub Actions layer caching.

**Pre-commit:** Husky runs `lint-staged`, formatting and fixing only staged
files. The hook is skipped in CI and in production installs
([`.husky/install.mjs`](.husky/install.mjs)).

**Formatting:** [`.editorconfig`](.editorconfig) for editors,
[`.prettierrc.json`](.prettierrc.json) for the formatter.

**Code ownership:** [`.github/CODEOWNERS`](.github/CODEOWNERS) routes reviews:
`frontend/` to the UI team, `backend/` to the backend team, shared
orchestration and docs to both.

### A note on lint state

The backend lints clean at `error` severity and CI gates on it.

The frontend carries a **documented lint baseline**: ESLint was retrofitted
onto the UI layer after the fact, and ~250 pre-existing findings (dead locals,
redundant regex escapes, pass-through `try`/`catch` wrappers) are set to
`warn` rather than `error` in
[`frontend/eslint.config.js`](frontend/eslint.config.js). Each category was
reviewed before being parked; none are bugs. They are warnings so that
`npm run lint` stays green and *new* problems are visible instead of drowning
in noise, and the intent is to ratchet each rule back to `error` as the backlog
clears. This is recorded here rather than left for a reader to discover.

---

## 🔐 Governance & NDA Compliance

This repository represents a sanitized, standalone snapshot of a production-grade enterprise application. 

To strictly comply with Non-Disclosure Agreements (NDA) and corporate security policies, the original Git history, proprietary business logic, client-specific configurations, and infrastructure-as-code (IaC) pipelines have been completely stripped from this public release. 

As a result, this repository is published as a single-commit snapshot for portfolio demonstration purposes. It highlights architectural decisions, component structure, state management, and API design patterns while protecting the intellectual property of the original stakeholders.
