import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// GET /api/supervisor/team-performance
// Returns per-rep KPIs for the supervisor's company: visits, cycle adherence,
// GPS anomalies, days since last visit, pending items.
// Uses batched groupBy queries (8 fixed DB round-trips regardless of team size).
export const getTeamPerformance = asyncHandler(async (req, res) => {
  const { company_id } = req.user;

  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo    = new Date(Date.now() - 7  * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month      = now.getMonth() + 1;
  const year       = now.getFullYear();

  const reps = await prisma.user.findMany({
    where:   { company_id, role: "MedicalRep" },
    select:  { id: true, firstname: true, lastname: true, role: true },
    orderBy: { firstname: "asc" },
  });

  if (reps.length === 0) return res.json({ success: true, data: [] });

  const repIds = reps.map((r) => r.id);

  // 8 queries total — independent of team size
  const [
    todayCounts,
    weekCounts,
    monthCounts,
    lastActivities,
    gpsCounts,
    pendingReportCounts,
    pendingExpenseCounts,
    cycles,
  ] = await Promise.all([
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, date: { gte: todayStart } },
      _count: { id: true },
    }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, date: { gte: weekAgo } },
      _count: { id: true },
    }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, date: { gte: monthStart } },
      _count: { id: true },
    }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds } },
      _max: { date: true },
    }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, gps_anomaly: true, date: { gte: weekAgo } },
      _count: { id: true },
    }),
    prisma.dailyReport.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, status: "SUBMITTED" },
      _count: { id: true },
    }),
    prisma.expenseClaim.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, status: "SUBMITTED" },
      _count: { id: true },
    }),
    prisma.callCycle.findMany({
      where:   { user_id: { in: repIds }, month, year },
      include: { items: { select: { frequency: true, visits_done: true } } },
    }),
  ]);

  // Build O(1) lookup maps
  const mk = (arr, key, val) => Object.fromEntries(arr.map((r) => [r[key], val(r)]));
  const todayMap   = mk(todayCounts,         "user_id", (r) => r._count.id);
  const weekMap    = mk(weekCounts,           "user_id", (r) => r._count.id);
  const monthMap   = mk(monthCounts,          "user_id", (r) => r._count.id);
  const lastMap    = mk(lastActivities,       "user_id", (r) => r._max.date);
  const gpsMap     = mk(gpsCounts,            "user_id", (r) => r._count.id);
  const reportMap  = mk(pendingReportCounts,  "user_id", (r) => r._count.id);
  const expenseMap = mk(pendingExpenseCounts, "user_id", (r) => r._count.id);
  const cycleMap   = mk(cycles,              "user_id", (r) => r);

  const data = reps.map((rep) => {
    const cycle       = cycleMap[rep.id];
    const totalTarget = cycle?.items.reduce((s, i) => s + i.frequency, 0) ?? 0;
    const totalDone   = cycle?.items.reduce((s, i) => s + i.visits_done, 0) ?? 0;
    const cycleAdherencePct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : null;

    const lastDate      = lastMap[rep.id] ?? null;
    const daysSinceLast = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000)
      : null;

    return {
      user:                    rep,
      visits_today:            todayMap[rep.id]   ?? 0,
      visits_this_week:        weekMap[rep.id]    ?? 0,
      visits_this_month:       monthMap[rep.id]   ?? 0,
      cycle_visits_done:       totalDone,
      cycle_total_target:      totalTarget,
      cycle_adherence_pct:     cycleAdherencePct,
      last_visit_date:         lastDate,
      days_since_last_visit:   daysSinceLast,
      gps_anomaly_count_week:  gpsMap[rep.id]    ?? 0,
      pending_reports:         reportMap[rep.id]  ?? 0,
      pending_expenses:        expenseMap[rep.id] ?? 0,
    };
  });

  res.json({ success: true, data });
});

// GET /api/supervisor/team-map?days=3
// Returns GPS activity points for all company reps, grouped by rep
export const getTeamMap = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  if (!company_id) return res.json({ success: true, data: [] });

  const days = Math.min(parseInt(req.query.days) || 3, 30);
  const since = new Date(Date.now() - days * 86_400_000);

  const reps = await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true, firstname: true, lastname: true },
    orderBy: { firstname: "asc" },
  });

  const data = await Promise.all(
    reps.map(async (rep) => {
      const [activities, total_visits] = await Promise.all([
        prisma.doctorActivity.findMany({
          where: {
            user_id: rep.id,
            date: { gte: since },
            gps_lat: { not: null },
            gps_lng: { not: null },
          },
          select: {
            id: true,
            date: true,
            gps_lat: true,
            gps_lng: true,
            gps_anomaly: true,
            nca_reason: true,
            doctor: { select: { doctor_name: true, town: true } },
            focused_product: { select: { product_name: true } },
          },
          orderBy: { date: "desc" },
          take: 100,
        }),
        prisma.doctorActivity.count({
          where: { user_id: rep.id, date: { gte: since } },
        }),
      ]);
      return { user: rep, activities, total_visits };
    })
  );

  res.json({ success: true, data });
});
