# CLAUDE.md — KibagRep Backend Rules

## Project Overview

**KibagRep API** is the backend for the KibagRep Medical Sales Force Automation platform and HCP (Healthcare Professional) data layer. It serves three distinct user groups through one API:

1. **Pharma company field forces** — reps, supervisors, managers, country managers (multi-tenant, per-company)
2. **Doctors** — self-managing their profiles, preferences, CME records, and incentive receipts
3. **Pharmacies** — self-reporting monthly sales, managing stock visibility

**Business model:** KibagRep owns and maintains the master doctor and pharmacy database for Uganda (and later East Africa). Pharma companies pay per rep seat to access verified HCP data and the SFA platform. Doctor and pharmacy data stays fresh because HCPs maintain it directly — not because a rep manually updates an Excel sheet.

**Core problems solved:**
- GPS faking: coordinates captured at check-in, cross-referenced against facility location
- Arbitrary doctor list changes: call cycles are supervisor-approved and locked per month
- Stale HCP data: doctors update their own profiles via self-service portal
- Pharmacy sales blindspot: pharmacies self-report sell-out data monthly
- Report accountability: DRAFT → SUBMITTED → APPROVED/REJECTED enforced, email alerts on every transition

See [CHANGES.md](./CHANGES.md) for phase roadmap and architectural decisions log.

---

## Engineering Principle

> Start with the simplest thing that works. Add complexity only when a real problem demands it. Redis, queues, Docker, and microservices are tools for scale — not starting points.

---

## Tech Stack

### Backend
- **Node.js + Express** — no NestJS overhead for MVP
- **Prisma ORM** — type-safe DB access, migration management
- **PostgreSQL** — single source of truth for all tenants
- **bcrypt** — password hashing
- **Nodemailer** — email alerts (report submissions, approvals, campaign assignments)
- **Africa's Talking** — SMS OTP for doctor/pharmacy portal auth (Phase 1)
- **ExcelJS** — Excel report generation (daily/monthly)
- **Morgan** — request logging
- **dotenv-safe** — enforced environment variables
- **Zod** — runtime input validation on all POST/PUT (Phase 1)
- **node-cron** — scheduled jobs: visit reminders, expiry checks, call cycle resets (Phase 1)

### Infrastructure (MVP)
- Node.js process directly — no Docker for dev
- PostgreSQL locally or managed (Supabase / Railway / Neon)
- PM2 for production process management
- No Redis until job queue volume justifies it

---

## Folder Structure

```
KibagRep_backend/
├── src/
│   ├── routes/                 # Express route definitions
│   ├── controllers/            # Route handlers (factory pattern for simple CRUD)
│   ├── services/               # Business logic (complex modules get their own service)
│   │   ├── visit.service.ts    # Visit logging, GPS validation, call cycle enforcement
│   │   ├── cycle.service.ts    # Call cycle management and locking
│   │   ├── report.service.ts   # Report generation and approval chain
│   │   ├── campaign.service.ts # Campaign management and rep assignment
│   │   ├── incentive.service.ts# CME, samples, branded items tracking
│   │   ├── pharmacy.service.ts # Pharmacy sales consolidation
│   │   └── doctor.service.ts   # Doctor portal logic
│   ├── middleware/             # Auth, role guard, tenant scope, error handling
│   ├── utils/                  # toSentenceCase, report generators, GPS distance calc
│   └── index.ts                # Express app entry point
├── prisma/
│   └── schema.prisma           # Full schema — all phases designed upfront
├── CLAUDE.md
└── CHANGES.md
```

---

## Multi-Tenancy Model

KibagRep serves multiple pharma companies. Each company is a **tenant**:
- Tenant data (rep activities, reports, campaigns, teams) is always scoped by `tenantId`
- The **doctor and pharmacy database is shared** — all tenants access the same verified HCP pool
- A doctor or pharmacy is never "owned" by one pharma company; they are on the platform independently
- Tenant middleware injects `req.tenantId` on every internal portal request
- Doctor/pharmacy portals do NOT use tenantId — they access the shared HCP layer directly

---

## API Route Map

### Existing Routes
| Prefix | Resource | Methods |
|--------|----------|---------|
| `/api/user` | Users | POST /addUser |
| `/api/doctor` | Doctor master data | GET, POST, PUT, DELETE |
| `/api/pharmacy` | Pharmacy master data | GET, POST, PUT, DELETE |
| `/api/facility` | Facility master data | GET, POST, PUT, DELETE |
| `/api/company` | Pharma companies (tenants) | GET, POST, PUT, DELETE |
| `/api/product` | Products | GET, POST, PUT, DELETE |
| `/api/team` | Sales teams | GET, POST, PUT, DELETE |
| `/api/sample` | Sample distributions | GET, POST, PUT, DELETE |
| `/api/stock` | Pharmacy stock tracking | GET, POST, PUT, DELETE |
| `/api/field-doctor` | Doctor visit activities | POST /add-doctor-activity |
| `/api/field-pharmacy` | Pharmacy visit activities | POST |
| `/api/report` | Report generation | GET /generate-report |

### Planned — Phase 1
| Prefix | Resource | Methods |
|--------|----------|---------|
| `/api/auth` | Login, refresh, logout | POST |
| `/api/auth/doctor` | Doctor OTP auth | POST /request-otp, POST /verify-otp |
| `/api/auth/pharmacy` | Pharmacy OTP auth | POST /request-otp, POST /verify-otp |
| `/api/visit` | Unified visit log | GET, POST |
| `/api/gps` | GPS check-in/check-out | POST |
| `/api/cycle` | Call cycle management | GET, POST, PUT, POST /approve, POST /lock |
| `/api/approval` | Report approval chain | GET, POST /submit, PUT /approve, PUT /reject |
| `/api/expense` | Expense claims | GET, POST, PUT /approve, PUT /reject |
| `/api/jfw` | Joint field work | GET, POST |
| `/api/notification` | Notifications | GET, POST /mark-read |
| `/api/doctor-portal` | Doctor self-service | GET /me, PUT /me, GET /cme, POST /cme |
| `/api/pharmacy-portal` | Pharmacy self-service | GET /me, PUT /me, POST /sales-report |
| `/api/competitor` | Competitor intel logs | GET, POST |
| `/api/territory` | Territory management | GET, POST, PUT |
| `/api/bulk-upload` | Excel bulk import | POST /doctors, POST /pharmacies |

### Planned — Phase 2
| Prefix | Resource | Methods |
|--------|----------|---------|
| `/api/campaign` | Campaign management | GET, POST, PUT, POST /assign |
| `/api/incentive` | Doctor incentives (CME, items, advisory) | GET, POST |
| `/api/pharmacy-sales` | Aggregated sell-out data | GET /summary, GET /by-product |
| `/api/analytics` | Aggregate analytics endpoints | GET /coverage, GET /competitor-summary |

---

## Database Schema (Prisma)

Full schema designed upfront for all phases. Unused tables cost nothing; migrations cost everything.

---

### Platform & Tenancy

```prisma
// Pharma company = one tenant. KibagRep itself can be a tenant (INTERNAL type).
model Tenant {
  id          String       @id @default(cuid())
  name        String       @unique
  slug        String       @unique       // "glaxo-ug", "cipla-ug"
  type        TenantType   @default(CLIENT)
  plan        SaasPlan     @default(STARTER)
  isActive    Boolean      @default(true)
  users       User[]
  teams       Team[]
  products    Product[]
  campaigns   Campaign[]
  createdAt   DateTime     @default(now())
}

enum TenantType { INTERNAL CLIENT }
enum SaasPlan   { STARTER GROWTH ENTERPRISE }
```

---

### Auth & Users (Internal — Pharma Staff)

```prisma
model User {
  id           String          @id @default(cuid())
  email        String          @unique
  phone        String?         @unique
  name         String
  passwordHash String
  role         Role            @default(MedicalRep)
  tenantId     String
  tenant       Tenant          @relation(fields: [tenantId], references: [id])
  isActive     Boolean         @default(true)
  supervisor   Supervisor?
  manager      Manager?
  medicalRep   MedicalRep?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}

enum Role {
  SUPER_ADMIN    // KibagRep platform admin — sees all tenants
  COUNTRY_MGR    // Country-level view across all regions
  SALES_ADMIN    // Configures master data, manages call cycles
  Manager        // Manages supervisors and teams
  Supervisor     // Manages reps directly
  MedicalRep     // Field user
}
```

---

### HCP Master Data (Shared — not tenant-scoped)

```prisma
// Doctors are platform-wide. Any pharma company's rep can visit any doctor.
// No single company "owns" a doctor record.
model Doctor {
  id              String               @id @default(cuid())
  name            String
  specialty       String?
  tier            DoctorTier?          // A, B, C — set per company in DoctorCompanyTier
  facilityId      String?
  facility        Facility?            @relation(fields: [facilityId], references: [id])
  town            String?
  region          String?
  gpsLat          Float?               // facility GPS for check-in validation
  gpsLng          Float?
  phone           String?
  isVerified      Boolean              @default(false)  // true when doctor has claimed profile
  isActive        Boolean              @default(true)
  portalAccess    DoctorPortal?        // self-service profile link
  activities      DoctorActivity[]
  samples         SampleDistribution[]
  incentives      DoctorIncentive[]
  callCycleItems  CallCycleItem[]
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
}

enum DoctorTier { A B C }

// Per-company tier — Company A may rate Dr. Kato as A-tier, Company B as B-tier
model DoctorCompanyTier {
  doctorId  String
  tenantId  String
  tier      DoctorTier
  @@id([doctorId, tenantId])
}

model DoctorPortal {
  id              String    @id @default(cuid())
  doctorId        String    @unique
  doctor          Doctor    @relation(fields: [doctorId], references: [id])
  preferredDays   String[]  // ["Monday", "Wednesday"]
  preferredTime   String?   // "08:00–10:00"
  optedOutTenants String[]  // tenantIds the doctor has opted out from
  cmeRecords      CmeRecord[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model CmeRecord {
  id            String       @id @default(cuid())
  portalId      String
  portal        DoctorPortal @relation(fields: [portalId], references: [id])
  eventName     String
  provider      String       // sponsoring company name
  credits       Float
  attendedAt    DateTime
  certificateUrl String?
  createdAt     DateTime     @default(now())
}

model Facility {
  id        String    @id @default(cuid())
  name      String
  type      String?   // hospital, clinic, health_center, private_clinic
  town      String?
  region    String?
  gpsLat    Float?
  gpsLng    Float?
  doctors   Doctor[]
  createdAt DateTime  @default(now())
}

model Pharmacy {
  id           String             @id @default(cuid())
  name         String
  town         String?
  region       String?
  gpsLat       Float?
  gpsLng       Float?
  phone        String?
  isVerified   Boolean            @default(false)
  isActive     Boolean            @default(true)
  portalAccess PharmacyPortal?
  activities   PharmacyActivity[]
  stock        StockTracking[]
  salesReports PharmacySalesReport[]
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
}

model PharmacyPortal {
  id         String   @id @default(cuid())
  pharmacyId String   @unique
  pharmacy   Pharmacy @relation(fields: [pharmacyId], references: [id])
  contactName String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// Pharmacy self-reports monthly sell-out data
model PharmacySalesReport {
  id         String   @id @default(cuid())
  pharmacyId String
  pharmacy   Pharmacy @relation(fields: [pharmacyId], references: [id])
  product    String
  unitsSold  Int
  unitsStock Int
  month      Int
  year       Int
  createdAt  DateTime @default(now())

  @@unique([pharmacyId, product, month, year])
}
```

---

### Tenant-Scoped Master Data

```prisma
model Product {
  id        String   @id @default(cuid())
  name      String
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
}

model Team {
  id        String       @id @default(cuid())
  name      String
  tenantId  String
  tenant    Tenant       @relation(fields: [tenantId], references: [id])
  products  Product[]
  members   MedicalRep[]
  createdAt DateTime     @default(now())
}
```

---

### Org Structure

```prisma
model MedicalRep {
  id              String             @id @default(cuid())
  userId          String             @unique
  user            User               @relation(fields: [userId], references: [id])
  supervisorId    String?
  supervisor      Supervisor?        @relation(fields: [supervisorId], references: [id])
  teamId          String?
  team            Team?              @relation(fields: [teamId], references: [id])
  territoryId     String?
  territory       Territory?         @relation(fields: [territoryId], references: [id])
  activities      DoctorActivity[]
  pharmacyActs    PharmacyActivity[]
  callCycles      CallCycle[]
  dailyPlans      DailyPlan[]
  monthlyPlans    MonthlyPlan[]
  expenseClaims   ExpenseClaim[]
  jfwVisits       JointFieldWork[]   @relation("JFWSubject")
  sampleBalance   SampleBalance[]
  createdAt       DateTime           @default(now())
}

model Supervisor {
  id        String       @id @default(cuid())
  userId    String       @unique
  user      User         @relation(fields: [userId], references: [id])
  managerId String?
  manager   Manager?     @relation(fields: [managerId], references: [id])
  reps      MedicalRep[]
  jfwVisits JointFieldWork[] @relation("JFWObserver")
  createdAt DateTime     @default(now())
}

model Manager {
  id          String       @id @default(cuid())
  userId      String       @unique
  user        User         @relation(fields: [userId], references: [id])
  supervisors Supervisor[]
  createdAt   DateTime     @default(now())
}

model Territory {
  id        String       @id @default(cuid())
  name      String
  tenantId  String
  region    String?
  gpsCenter Json?        // { lat, lng } center point for map
  reps      MedicalRep[]
  createdAt DateTime     @default(now())
}
```

---

### Call Cycle Management

```prisma
// A call cycle is a supervisor-approved monthly list of doctors per rep.
// Once locked, reps cannot change it without supervisor approval.
model CallCycle {
  id           String          @id @default(cuid())
  repId        String
  rep          MedicalRep      @relation(fields: [repId], references: [id])
  month        Int
  year         Int
  status       CycleStatus     @default(DRAFT)
  approvedById String?
  approvedAt   DateTime?
  lockedAt     DateTime?       // locked after approval — no more changes
  items        CallCycleItem[]
  createdAt    DateTime        @default(now())

  @@unique([repId, month, year])
}

model CallCycleItem {
  id          String     @id @default(cuid())
  cycleId     String
  cycle       CallCycle  @relation(fields: [cycleId], references: [id])
  doctorId    String
  doctor      Doctor     @relation(fields: [doctorId], references: [id])
  frequency   Int        // target visits this month (derived from tier)
  visitsDone  Int        @default(0) // auto-incremented on each logged visit
}

enum CycleStatus { DRAFT SUBMITTED APPROVED LOCKED }
```

---

### Visit Activity Logging

```prisma
model DoctorActivity {
  id              String       @id @default(cuid())
  repId           String
  rep             MedicalRep   @relation(fields: [repId], references: [id])
  doctorId        String
  doctor          Doctor       @relation(fields: [doctorId], references: [id])
  tenantId        String
  visitType       VisitType    @default(PLANNED)
  detailingMin    Int?
  productsShown   String[]
  campaignId      String?
  campaign        Campaign?    @relation(fields: [campaignId], references: [id])
  competitorNotes String?      // competitor products/activity observed
  outcome         String?
  doctorResponse  Int?         // 1–5 receptiveness score
  gpsLat          Float?
  gpsLng          Float?
  gpsAnomalyFlag  Boolean      @default(false)
  checkInAt       DateTime?
  checkOutAt      DateTime?
  visitDate       DateTime     @default(now())
  reportStatus    ReportStatus @default(DRAFT)
  createdAt       DateTime     @default(now())
}

model PharmacyActivity {
  id         String     @id @default(cuid())
  repId      String
  rep        MedicalRep @relation(fields: [repId], references: [id])
  pharmacyId String
  pharmacy   Pharmacy   @relation(fields: [pharmacyId], references: [id])
  tenantId   String
  visitType  VisitType  @default(PLANNED)
  orders     String[]
  stockNoted Json?      // { productName: qty } observed on shelf
  visitDate  DateTime   @default(now())
  createdAt  DateTime   @default(now())
}

enum VisitType    { PLANNED UNPLANNED NCA }
enum ReportStatus { DRAFT SUBMITTED APPROVED REJECTED }
```

---

### Sample Accountability Chain

```prisma
// Full chain: Company issues → Rep balance → Doctor receives
model SampleBalance {
  id        String     @id @default(cuid())
  repId     String
  rep       MedicalRep @relation(fields: [repId], references: [id])
  product   String
  tenantId  String
  issued    Int        @default(0)
  given     Int        @default(0)
  remaining Int        @default(0) // issued - given, auto-calculated
  updatedAt DateTime   @updatedAt
  @@unique([repId, product, tenantId])
}

model SampleDistribution {
  id              String     @id @default(cuid())
  repId           String
  rep             MedicalRep @relation(fields: [repId], references: [id])
  doctorId        String
  doctor          Doctor     @relation(fields: [doctorId], references: [id])
  tenantId        String
  product         String
  quantity        Int
  doctorAcknowledged Boolean @default(false)
  givenAt         DateTime   @default(now())
}

model StockTracking {
  id         String   @id @default(cuid())
  pharmacyId String
  pharmacy   Pharmacy @relation(fields: [pharmacyId], references: [id])
  product    String
  quantity   Int
  recordedAt DateTime @default(now())
}
```

---

### Doctor Incentives & CME

```prisma
model DoctorIncentive {
  id           String          @id @default(cuid())
  doctorId     String
  doctor       Doctor          @relation(fields: [doctorId], references: [id])
  tenantId     String
  repId        String?
  type         IncentiveType
  description  String
  value        Float?          // UGX value (for branded items or advisory fees)
  complianceOk Boolean         @default(true) // flagged if over NDA threshold
  givenAt      DateTime        @default(now())
  createdAt    DateTime        @default(now())
}

enum IncentiveType { CME_SPONSORSHIP BRANDED_ITEM ADVISORY_FEE EDUCATIONAL_EVENT SAMPLE_PACK }
```

---

### Marketing Campaigns

```prisma
model Campaign {
  id          String           @id @default(cuid())
  tenantId    String
  tenant      Tenant           @relation(fields: [tenantId], references: [id])
  name        String
  product     String
  targetTier  DoctorTier?      // null = all tiers
  brief       String           // what reps should communicate
  startDate   DateTime
  endDate     DateTime
  status      CampaignStatus   @default(DRAFT)
  activities  DoctorActivity[] // visits that referenced this campaign
  createdAt   DateTime         @default(now())
}

enum CampaignStatus { DRAFT ACTIVE COMPLETED CANCELLED }
```

---

### Expense Claims

```prisma
model ExpenseClaim {
  id           String        @id @default(cuid())
  repId        String
  rep          MedicalRep    @relation(fields: [repId], references: [id])
  tenantId     String
  period       String        // "2026-03" — month this claim covers
  items        ExpenseItem[]
  totalAmount  Float
  status       ClaimStatus   @default(DRAFT)
  approvedById String?
  approvedAt   DateTime?
  submittedAt  DateTime?
  createdAt    DateTime      @default(now())
}

model ExpenseItem {
  id          String       @id @default(cuid())
  claimId     String
  claim       ExpenseClaim @relation(fields: [claimId], references: [id])
  category    ExpenseCategory
  description String
  amount      Float
  receiptUrl  String?
  date        DateTime
}

enum ClaimStatus     { DRAFT SUBMITTED APPROVED REJECTED }
enum ExpenseCategory { TRANSPORT ACCOMMODATION MEALS PROMO_ITEMS OTHER }
```

---

### Joint Field Work

```prisma
model JointFieldWork {
  id          String     @id @default(cuid())
  repId       String
  rep         MedicalRep @relation("JFWSubject", fields: [repId], references: [id])
  observerId  String
  observer    Supervisor @relation("JFWObserver", fields: [observerId], references: [id])
  tenantId    String
  jfwDate     DateTime
  doctorsJoined Int      // how many visits the observer joined
  detailingScore Int?    // 1–5
  productKnowledge Int?  // 1–5
  doctorEngagement Int?  // 1–5
  feedback    String?
  createdAt   DateTime   @default(now())
}
```

---

### Planning & Reporting

```prisma
model DailyPlan {
  id        String     @id @default(cuid())
  repId     String
  rep       MedicalRep @relation(fields: [repId], references: [id])
  planDate  DateTime
  doctors   String[]
  notes     String?
  createdAt DateTime   @default(now())
}

model MonthlyPlan {
  id        String     @id @default(cuid())
  repId     String
  rep       MedicalRep @relation(fields: [repId], references: [id])
  month     Int
  year      Int
  targets   Json       // { doctorVisits: 200, pharmacyVisits: 50, samples: 100 }
  createdAt DateTime   @default(now())
}

model DailyReport {
  id           String       @id @default(cuid())
  repId        String
  rep          MedicalRep   @relation(fields: [repId], references: [id])
  tenantId     String
  reportDate   DateTime
  summary      String?
  status       ReportStatus @default(DRAFT)
  submittedAt  DateTime?
  reviewedById String?
  reviewedAt   DateTime?
  reviewNote   String?
  createdAt    DateTime     @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  tenantId   String?
  action     String   // "visit.created", "cycle.locked", "report.approved"
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())
}
```

---

## Core Modules

### 1. Auth & Tenancy
- JWT login/refresh/logout for pharma staff
- SMS OTP auth for doctor and pharmacy portals (Africa's Talking)
- Tenant middleware: injects `tenantId` on every internal request
- Role guard: `requireRole([Role.Supervisor, Role.Manager])` per route
- Super admin can view any tenant

### 2. HCP Master Data
- Shared doctor and pharmacy DB — no tenant ownership
- Doctor/pharmacy can claim and verify their profile
- Bulk Excel upload for Sales Admin onboarding
- GPS coordinates stored per facility for check-in validation
- Doctor tier set per tenant (DoctorCompanyTier)

### 3. Call Cycle Enforcement
- Rep drafts monthly call cycle from approved doctor list
- Supervisor reviews and approves — cycle locks, no changes after
- Each doctor visit auto-increments `visitsDone` on the cycle item
- System flags doctors with `visitsDone < frequency` at month end
- Unplanned visits outside the cycle require NCA reason

### 4. Visit Logging & GPS Validation
- Capture GPS at check-in
- Calculate distance from doctor's facility GPS
- If distance > threshold (e.g., 500m), set `gpsAnomalyFlag = true`
- Anomalies surface in supervisor and manager dashboards
- NCA requires a reason string — not skippable

### 5. Sample Accountability Chain
- Admin issues sample batch to rep → SampleBalance.issued increases
- Rep gives samples to doctor → SampleDistribution record created, SampleBalance.given increases
- Doctor can acknowledge receipt via doctor portal
- Month-end: reps reconcile remaining vs issued in SampleBalance

### 6. Doctor Incentive & CME Tracking
- Log every incentive given to a doctor: type, value, date, rep
- Flag if total value to a doctor in a period exceeds NDA threshold
- Doctor portal shows their CME credit history
- Aggregate compliance report per tenant per period

### 7. Marketing Campaign Management
- Campaign created by manager/marketing with target tier and brief
- Assigned to relevant reps based on territory and team
- Rep sees campaign brief in their dashboard
- Doctor visits linked to active campaigns via `campaignId`
- Post-campaign: compare visit quality scores and pharmacy sell-out data before/after

### 8. Pharmacy Sales Consolidation
- Pharmacy submits monthly sell-out via portal or SMS bot
- Aggregated sell-out dashboard: units sold per product per region per month
- Cross-referenced against rep stock observations (`StockTracking`)
- Market share calculation: KibagRep product sales as % of total pharmacy sales
- Stockout alert: pharmacy running low → assign rep follow-up task

### 9. Expense Claims
- Rep submits claim with itemized expenses and receipt photos
- Supervisor approves or rejects with comment
- Finance export: all approved claims per period (Excel)

### 10. Joint Field Work (JFW)
- Supervisor schedules JFW day with rep
- After field visit: supervisor scores rep on detailing quality, product knowledge, engagement
- Feedback stored and visible to rep and manager
- JFW frequency tracked — managers must complete minimum JFW per quarter

### 11. Report Generation
- ExcelJS: daily/monthly reports per rep, per team, per campaign
- Filters: rep, date range, product, region, campaign
- Pre-built templates matching Veeram email report format (familiar to managers)

---

## Hard Rules
- Never expose `passwordHash` in any API response
- Never skip role middleware on protected routes
- Never skip tenant scoping on internal portal routes
- Always paginate list endpoints (default limit: 50)
- GPS coordinates stored as Float — never as strings
- Report status must follow: DRAFT → SUBMITTED → APPROVED | REJECTED
- Call cycle status must follow: DRAFT → SUBMITTED → APPROVED → LOCKED
- Sample balance `remaining` is always computed (issued - given), never stored manually
- Doctor and pharmacy portals use separate auth tokens — never share with pharma company JWT
- Do not add Docker or Redis until a proven bottleneck demands it
- Factory CRUD controllers for simple resources only — complex logic in service files
- Never commit `.env` or credentials
