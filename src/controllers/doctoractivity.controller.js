import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

function gpsDistanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GPS_ANOMALY_THRESHOLD_M = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const getTodayActivities = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const activities = await prisma.doctorActivity.findMany({
    where: { user_id: userId, date: { gte: today, lt: tomorrow } },
    include: {
      doctor: { select: { id: true, doctor_name: true, town: true } },
      focused_product: { select: { id: true, product_name: true } },
    },
    orderBy: { date: "desc" },
  });
  res.status(200).json({ success: true, data: activities });
});

export const createDoctorActivity = asyncHandler(async (req, res) => {
  const { doctor_id, products_detailed, focused_product_id, samples_given, outcome, gps_lat, gps_lng } = req.body;
  const user_id = req.user.id;
  if (!doctor_id || !focused_product_id) {
    res.status(400);
    throw new Error("doctor_id and focused_product_id are required");
  }
  let gps_anomaly = false;
  if (gps_lat != null && gps_lng != null) {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctor_id }, select: { gps_lat: true, gps_lng: true } });
    if (doctor?.gps_lat != null && doctor?.gps_lng != null) {
      gps_anomaly = gpsDistanceMetres(gps_lat, gps_lng, doctor.gps_lat, doctor.gps_lng) > GPS_ANOMALY_THRESHOLD_M;
    }
  }
  const connectProducts = Array.isArray(products_detailed) ? products_detailed.map((id) => ({ id })) : [];

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [doctorActivity] = await prisma.$transaction([
    prisma.doctorActivity.create({
      data: {
        user: { connect: { id: user_id } },
        doctor: { connect: { id: doctor_id } },
        products_detailed: { connect: connectProducts },
        focused_product: { connect: { id: focused_product_id } },
        samples_given: samples_given ?? 0,
        outcome: outcome ?? null,
        gps_lat: gps_lat ?? null,
        gps_lng: gps_lng ?? null,
        gps_anomaly,
        visit_status: "VISITED",
      },
      include: {
        doctor: { select: { id: true, doctor_name: true } },
        focused_product: { select: { id: true, product_name: true } },
      },
    }),
    prisma.callCycleItem.updateMany({
      where: { doctor_id, cycle: { user_id, month, year } },
      data: { visits_done: { increment: 1 } },
    }),
  ]);

  res.status(201).json({ success: true, data: doctorActivity, gps_anomaly });
});

// POST /api/field-doctor/log-missed
// Log a missed / rescheduled / skipped visit — no product required
export const logMissedVisit = asyncHandler(async (req, res) => {
  const { doctor_id, visit_status, miss_reason, gps_lat, gps_lng } = req.body;
  const user_id = req.user.id;

  const validStatuses = ["MISSED", "RESCHEDULED", "SKIPPED"];
  if (!doctor_id) { res.status(400); throw new Error("doctor_id is required"); }
  if (!validStatuses.includes(visit_status)) {
    res.status(400);
    throw new Error("visit_status must be MISSED, RESCHEDULED, or SKIPPED");
  }

  const activity = await prisma.doctorActivity.create({
    data: {
      user:        { connect: { id: user_id } },
      doctor:      { connect: { id: doctor_id } },
      samples_given: 0,
      visit_status,
      miss_reason:  miss_reason ?? null,
      gps_lat:      gps_lat ?? null,
      gps_lng:      gps_lng ?? null,
    },
    include: {
      doctor: { select: { id: true, doctor_name: true } },
    },
  });

  res.status(201).json({ success: true, data: activity });
});

// GET /api/field-doctor/backlog
// Returns unvisited cycle doctors where visits_done < expected pace for today
export const getBacklog = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Get current cycle
  const cycle = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: {
      items: {
        include: {
          doctor: { select: { id: true, doctor_name: true, town: true, speciality: true, cadre: true } },
        },
      },
    },
  });

  if (!cycle || !cycle.items.length) {
    return res.status(200).json({ success: true, data: [], total: 0 });
  }

  // Working days elapsed in the month (Mon–Sat, up to today)
  const daysInMonth = new Date(year, month, 0).getDate();
  let workDaysElapsed = 0;
  let totalWorkDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d);
    if (day.getDay() !== 0) {
      totalWorkDays++;
      if (d <= now.getDate()) workDaysElapsed++;
    }
  }

  // Expected visits_done by today = (workDaysElapsed / totalWorkDays) * frequency
  const backlog = cycle.items
    .map((item) => {
      const expected = Math.floor((workDaysElapsed / totalWorkDays) * item.frequency);
      const behind = Math.max(0, expected - item.visits_done);
      return { ...item, expected_by_today: expected, visits_behind: behind };
    })
    .filter((item) => item.visits_behind > 0)
    .sort((a, b) => b.visits_behind - a.visits_behind);

  res.status(200).json({ success: true, data: backlog, total: backlog.length });
});

// GET /api/field-doctor/mtd-stats
// MTD coverage: daily call avg, unique doctors visited, doctor coverage %
export const getMtdStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthStart = startOfMonth();

  const [activities, cycle] = await Promise.all([
    prisma.doctorActivity.findMany({
      where: {
        user_id: userId,
        date: { gte: monthStart },
        visit_status: "VISITED",
      },
      select: { doctor_id: true, date: true },
    }),
    prisma.callCycle.findUnique({
      where: { user_id_month_year: { user_id: userId, month, year } },
      select: { items: { select: { doctor_id: true, frequency: true, visits_done: true } } },
    }),
  ]);

  // Working days elapsed (Mon-Sat up to today)
  let workDaysElapsed = 0;
  for (let d = 1; d <= now.getDate(); d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) workDaysElapsed++;
  }

  const uniqueDoctorsVisited = new Set(activities.map((a) => a.doctor_id)).size;
  const totalCycleDoctors = cycle?.items?.length ?? 0;
  const totalVisitsMtd = activities.length;
  const dailyCallAvg = workDaysElapsed > 0 ? +(totalVisitsMtd / workDaysElapsed).toFixed(1) : 0;
  const doctorCoveragePct = totalCycleDoctors > 0
    ? Math.round((uniqueDoctorsVisited / totalCycleDoctors) * 100)
    : null;

  // Missed/skipped count this month
  const missedCount = await prisma.doctorActivity.count({
    where: {
      user_id: userId,
      date: { gte: monthStart },
      visit_status: { in: ["MISSED", "SKIPPED", "RESCHEDULED"] },
    },
  });

  res.status(200).json({
    success: true,
    data: {
      total_visits_mtd: totalVisitsMtd,
      unique_doctors_visited: uniqueDoctorsVisited,
      total_cycle_doctors: totalCycleDoctors,
      doctor_coverage_pct: doctorCoveragePct,
      daily_call_avg: dailyCallAvg,
      work_days_elapsed: workDaysElapsed,
      missed_count: missedCount,
    },
  });
});

export const getActivityHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 30;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip = (page - 1) * limit;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const [activities, total] = await Promise.all([
    prisma.doctorActivity.findMany({
      where: { user_id: userId, date: { gte: since } },
      include: {
        doctor: { select: { id: true, doctor_name: true, town: true, location: true } },
        focused_product: { select: { id: true, product_name: true } },
        products_detailed: { select: { id: true, product_name: true } },
      },
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.doctorActivity.count({ where: { user_id: userId, date: { gte: since } } }),
  ]);
  res.status(200).json({ success: true, data: activities, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
});

export const getCompanyFeed = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const skip = (page - 1) * limit;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const currentUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { company_id: true } });
  const companyUsers = currentUser?.company_id
    ? await prisma.user.findMany({ where: { company_id: currentUser.company_id }, select: { id: true } })
    : [];
  const userIds = companyUsers.map((u) => u.id);
  const where = userIds.length
    ? { user_id: { in: userIds }, date: { gte: since } }
    : { id: "none" };

  const [activities, total, allForSummary] = await Promise.all([
    prisma.doctorActivity.findMany({
      where,
      include: {
        user: { select: { id: true, firstname: true, lastname: true, role: true } },
        doctor: { select: { id: true, doctor_name: true, town: true } },
        focused_product: { select: { id: true, product_name: true } },
      },
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.doctorActivity.count({ where }),
    prisma.doctorActivity.findMany({
      where,
      select: { user_id: true, samples_given: true },
    }),
  ]);

  const usersMap = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstname: true, lastname: true, role: true } });
  const usersById = Object.fromEntries(usersMap.map((u) => [u.id, u]));

  const summaryMap = {};
  for (const a of allForSummary) {
    if (!summaryMap[a.user_id]) summaryMap[a.user_id] = { visits: 0, samples: 0 };
    summaryMap[a.user_id].visits++;
    summaryMap[a.user_id].samples += a.samples_given ?? 0;
  }
  const summary = Object.entries(summaryMap).map(([user_id, stats]) => ({
    user: usersById[user_id],
    visits: stats.visits,
    samples: stats.samples,
  }));
  res.status(200).json({ success: true, data: activities, summary, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
});

export const logNca = asyncHandler(async (req, res) => {
  const { doctor_id, focused_product_id, nca_reason, gps_lat, gps_lng } = req.body;
  const user_id = req.user.id;

  let gps_anomaly = false;
  if (gps_lat != null && gps_lng != null) {
    const doctor = await prisma.doctor.findUnique({
      where: { id: doctor_id },
      select: { gps_lat: true, gps_lng: true },
    });
    if (doctor?.gps_lat != null && doctor?.gps_lng != null) {
      gps_anomaly =
        gpsDistanceMetres(gps_lat, gps_lng, doctor.gps_lat, doctor.gps_lng) >
        GPS_ANOMALY_THRESHOLD_M;
    }
  }

  const activity = await prisma.doctorActivity.create({
    data: {
      user:            { connect: { id: user_id } },
      doctor:          { connect: { id: doctor_id } },
      focused_product: { connect: { id: focused_product_id } },
      samples_given:   0,
      nca_reason:      nca_reason ?? null,
      visit_status:    "VISITED",  // NCA is still a contact attempt — counts as visited
      gps_lat:         gps_lat ?? null,
      gps_lng:         gps_lng ?? null,
      gps_anomaly,
    },
    include: {
      doctor:          { select: { id: true, doctor_name: true } },
      focused_product: { select: { id: true, product_name: true } },
    },
  });

  res.status(201).json({ success: true, data: activity });
});
