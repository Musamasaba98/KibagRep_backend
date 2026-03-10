# CHANGES.md — KibagRep Backend Decision & Phase Log

This file tracks architectural decisions, scope changes, and phased feature development for the KibagRep API.

---

## Origin — Why This Exists

### Real-World Experience
The founder worked as a medical representative at two Ugandan pharmaceutical companies — **Veeram** and **Abacus/Mega**. The contrast revealed exactly what was broken in pharma field force management.

**At Veeram:**
Daily Excel reports emailed to managers. Managers actually read and acted on them. The accountability loop worked because a human was in the chain. Weakness: no structure enforcement, impossible to aggregate, easy to falsify retrospectively.

**At Abacus/Mega — Phyzii system:**
- GPS was faked — reps checked in remotely
- Doctor lists changed arbitrarily — standard targets bypassed
- System logs were inconsistent — the termination dispute at Abacus was partly caused by unreliable system data that couldn't be trusted as evidence either way
- Managers had no reliable view of actual field activity

**The conclusion:** Phyzii captured inputs but never produced accountability. KibagRep enforces the full chain — GPS validation, locked call cycles, approval workflows, and an audit trail that is legally defensible.

### The Broader Market Problem
Every new medical rep in Uganda inherits a stale Excel doctor list. Doctors move facilities, retire, change phones. Companies waste weeks re-validating data every time a rep joins. No existing tool solves this at the source.

**KibagRep's solution:** Doctors and pharmacies self-manage their profiles on a shared platform. All pharma companies work off the same verified HCP database. Data stays fresh because the people it describes maintain it — not because a rep manually updates a spreadsheet.

### Business Model
KibagRep is a **multi-tenant SaaS with an HCP data layer**:
- **What pharma companies pay for:** Per-rep SFA seats + access to verified doctor/pharmacy database
- **What doctors get:** Control over who visits them, digital CME records, sample history
- **What pharmacies get:** A structured channel for reporting sales, reduced cold-call friction
- **KibagRep's moat:** The doctor and pharmacy database. Once it's verified and live, no competitor can replicate it without starting from scratch.

### Competitive Benchmark
- **Salesdoor:** Best UX of the three. Clear dashboards. USD-priced, US-market focused.
- **SaneForce:** Strong call cycle and target tracking. Enterprise-heavy and expensive.
- **Phyzii:** Used directly — failed on GPS integrity, report reliability, and data quality.

KibagRep builds on all three: Salesdoor's UX philosophy, SaneForce's structural enforcement, priced and built for Uganda.

---

## Phase 0 — Foundation (Partially Built)
**Goal:** Core API for master data, visit logging, and Excel report generation. Admin-operated.

### What's Built
- [x] Express + Prisma + PostgreSQL setup
- [x] User model with roles (Supervisor, Manager, MedicalRep, User, COUNTRY_MGR)
- [x] Doctor, Pharmacy, Facility, Company, Product, Team CRUD routes
- [x] DoctorActivity and PharmacyActivity logging endpoints
- [x] SampleDistribution tracking
- [x] StockTracking for pharmacies
- [x] DailyPlan and MonthlyPlan models
- [x] ExcelJS report generation (`/api/report/generate-report`)
- [x] bcrypt password hashing
- [x] Morgan request logging
- [x] Factory CRUD controllers pattern
- [x] `toSentenceCase` utility

### What's Missing (Phase 0 completion)
- [ ] JWT authentication middleware (login, token issue, refresh, logout)
- [ ] Role-based route protection (`requireRole` middleware)
- [ ] Tenant model and tenant middleware (multi-company scoping)
- [ ] GPS coordinates captured on DoctorActivity
- [ ] Report approval workflow (DRAFT → SUBMITTED → APPROVED/REJECTED)
- [ ] DailyReport model and endpoints
- [ ] Email notification on report submission (Nodemailer)
- [ ] Pagination on all list endpoints
- [ ] Zod input validation on all POST/PUT routes
- [ ] Seed script for Uganda doctor data from `Data/doctors_data.json`
- [ ] Standardized error response shape across all routes
- [ ] AuditLog written on every state change

### Stack (Phase 0 — no over-engineering)
- Node.js + Express, Prisma, PostgreSQL
- No Redis, no Docker, no message queue, no worker processes
- PM2 for production only

### Deliberately Excluded from Phase 0
| Excluded | Reason | When to add |
|----------|--------|-------------|
| Redis | No background jobs yet | Phase 1 when cron jobs and sync queues are added |
| Docker | Slows MVP iteration | Phase 1/2 for multi-service production |
| NestJS | 3x boilerplate, no benefit at this team size | Only if team grows and needs strict DI |
| Africa's Talking SMS | OTP not needed until doctor portal exists | Phase 1 |
| Campaign management | Need real visit data first | Phase 2 |
| Pharmacy portal | Need core rep flows first | Phase 1 |
| Doctor portal | Need core rep flows first | Phase 1 |

---

## Phase 1 — Authenticated, Enforced & Networked
**Goal:** Full auth. GPS enforcement. Call cycles locked. Doctor and pharmacy portals live. Expense claims running.

### New Backend Features

**Auth & Tenancy**
- [ ] JWT login, refresh token, logout for pharma staff
- [ ] SMS OTP auth for doctor and pharmacy portals (Africa's Talking)
- [ ] Tenant model — each pharma company is a tenant
- [ ] Tenant middleware — all internal routes inject and scope by `tenantId`
- [ ] Super admin route to manage all tenants

**Master Data**
- [ ] Bulk Excel upload endpoint for doctors and pharmacies (Sales Admin)
- [ ] Doctor tier per tenant (DoctorCompanyTier model)
- [ ] Seed script: load Uganda doctors from `Data/doctors_data.json`
- [ ] Facility GPS coordinates (used for check-in validation)

**Call Cycle Enforcement**
- [ ] CallCycle and CallCycleItem models and CRUD
- [ ] Supervisor approval endpoint: `POST /api/cycle/:id/approve`
- [ ] Lock endpoint: `POST /api/cycle/:id/lock` — after approval, no edits
- [ ] Auto-increment `visitsDone` on CallCycleItem when a visit is logged to that doctor
- [ ] Month-end flag: doctors with `visitsDone < frequency`

**Visit Logging & GPS**
- [ ] GPS distance calculation on check-in: compare rep GPS to facility GPS
- [ ] `gpsAnomalyFlag = true` if distance > 500m
- [ ] NCA visits require a reason string — not nullable
- [ ] Campaign link: visits can reference an active campaign via `campaignId`
- [ ] Competitor notes field on DoctorActivity

**Sample Accountability**
- [ ] SampleBalance model: issued / given / remaining per rep per product
- [ ] Issue samples endpoint: admin issues batch to rep, balance updates
- [ ] Give samples endpoint: rep gives to doctor, balance decrements, SampleDistribution created
- [ ] Doctor acknowledgment: doctor portal can mark sample as received

**Expense Claims**
- [ ] ExpenseClaim and ExpenseItem models and CRUD
- [ ] Supervisor approval/rejection with comment
- [ ] Finance export: approved claims per period as Excel

**Doctor Portal**
- [ ] Doctor claim profile: verify phone via OTP
- [ ] Update profile: specialty, facility, preferred visit days/times
- [ ] Opt-out of specific pharma company visits
- [ ] CME record: add/view events attended and credits earned
- [ ] Sample history view: what has been received and from whom

**Pharmacy Portal**
- [ ] Pharmacy claim profile: verify phone via OTP
- [ ] Monthly sell-out report submission: product, units sold, stock remaining
- [ ] View rep visit history for their pharmacy

**Report Flow**
- [ ] DailyReport model: DRAFT → SUBMITTED → APPROVED/REJECTED
- [ ] Rep submits report: `POST /api/approval/submit`
- [ ] Supervisor approves/rejects: `PUT /api/approval/:id/approve`
- [ ] Email notifications: Nodemailer on submit, on approval, on rejection

**Infrastructure additions**
- [ ] node-cron: daily morning reminder to reps (tomorrow's call cycle plan)
- [ ] node-cron: weekly report to managers (team summary)
- [ ] Zod validation on all POST/PUT endpoints
- [ ] Swagger/OpenAPI docs

---

## Phase 2 — Intelligence Layer
**Goal:** Campaign management. Doctor incentive compliance. Pharmacy sales consolidation. Competitor intelligence.

### New Backend Features

**Campaign Management**
- [ ] Campaign model: product, target tier, brief, date range, status
- [ ] Campaign assignment: auto-assign to reps by territory and team product
- [ ] Visit-campaign linkage: each visit can reference active campaigns
- [ ] Campaign performance endpoint: visits linked, detailing scores, doctor responses
- [ ] Pre/post comparison: pharmacy sell-out data before vs after campaign period

**Doctor Incentive & CME Compliance**
- [ ] DoctorIncentive model: type, value, date, rep, tenant
- [ ] NDA threshold check: flag if total value to a doctor exceeds configurable limit
- [ ] Compliance report endpoint: total spend per doctor, per company, per period
- [ ] Doctor portal: view all incentives received from all companies

**Pharmacy Sales Consolidation**
- [ ] Aggregate sell-out endpoint: total units per product per region per month
- [ ] Market share calculation: KibagRep products as % of total pharmacy category
- [ ] Stockout alert: pharmacy stock below threshold → create rep follow-up task
- [ ] Distribution gap endpoint: pharmacies not stocking a given product (for map overlay)

**Joint Field Work (JFW)**
- [ ] JointFieldWork model: rep, observer (supervisor), scores, feedback
- [ ] JFW scheduling and completion endpoints
- [ ] JFW frequency tracking per supervisor per quarter

**Analytics**
- [ ] GPS anomaly report: all flagged check-ins per tenant per period
- [ ] Doctor frequency analysis: over/under-visited doctors by tier
- [ ] Competitor intelligence summary: most common competitor products seen, by region and specialty
- [ ] E-detailing analytics: slides shown, duration, doctor response scores per visit

---

## Phase 3 — East Africa Expansion & Platform API
**Goal:** Multi-country. Medical device vertical. Public API.

### New Backend Features
- [ ] Country model: country-specific regulatory rules, currency, SMS gateway config
- [ ] Doctor DB expansion: Kenya, Tanzania, Rwanda HCP data
- [ ] Medical device product category: same visit/detailing flow, new product schema fields
- [ ] Public API with API key management for ERP/CRM integrations
- [ ] AI-powered visit note summarization (Claude API)
- [ ] AI reply suggestions for manager report feedback

---

## Decision Log

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-03-08 | Express over NestJS | NestJS adds 3x boilerplate with no benefit at this team size. Modular Express is faster to iterate. |
| 2026-03-08 | Factory CRUD controllers | Avoids repeating identical logic across 8+ resources. Complex business logic goes in service files. |
| 2026-03-08 | Prisma over raw SQL or Sequelize | Type-safe queries, migration management, excellent TypeScript integration. |
| 2026-03-08 | ExcelJS for reports | Managers and reps are familiar with Excel — matches the Veeram email-report workflow they already trust. |
| 2026-03-08 | No Docker for Phase 0 | Single developer, local database, one service. Docker adds no value and slows iteration. |
| 2026-03-08 | No Redis for Phase 0 | No background jobs or caching requirements yet. Add only when a proven bottleneck demands it. |
| 2026-03-08 | GPS stored as Float | Precision required for distance calculations in anomaly detection. String storage would break geo math. |
| 2026-03-08 | Report status as enum (DRAFT→SUBMITTED→APPROVED/REJECTED) | Enforces the accountability loop missing from Phyzii. State transitions are enforced server-side. |
| 2026-03-08 | Call cycle locks after supervisor approval | Prevents arbitrary doctor list changes — the #1 problem identified from field experience. Reps cannot modify a locked cycle. |
| 2026-03-08 | Doctor DB is shared, not tenant-scoped | A doctor is not owned by one pharma company. Multiple companies can have the same doctor on their call lists. Separating HCP data from tenant data is the core architectural decision. |
| 2026-03-08 | Doctor portal uses SMS OTP not password | Doctors won't remember a password to a system they use quarterly. OTP to registered phone is frictionless enough to drive adoption. |
| 2026-03-08 | Africa's Talking for SMS over Twilio | Local pricing, Uganda coverage including MTN/Airtel networks, UGX billing. Twilio is expensive and US-optimized. |
| 2026-03-08 | Seed from doctors_data.json | Real Uganda HCP data from direct field work. System has immediate real-world value on day one. |
| 2026-03-08 | Nodemailer for report notifications | Mirrors the Veeram email-report model that actually worked. Supervisor gets an email, reads it, responds. |
| 2026-03-08 | SampleBalance as a computed running total | `remaining = issued - given` is always consistent. Prevents reps from giving more samples than they've been issued. |
| 2026-03-08 | Campaign management in Phase 2 | Need real visit data (Phase 1) before campaign overlays are meaningful to measure. Sequence: measure first, then optimize. |
| 2026-03-08 | PharmacySalesReport as monthly self-report | The fastest path to sell-out data without POS integration. Pharmacy owners in Uganda are accessible and motivated — they want the rep to come with the right stock. |
