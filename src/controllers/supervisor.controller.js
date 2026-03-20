import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// GET /api/supervisor/team-performance
// Returns per-rep KPIs for the supervisor's company: visits, cycle adherence,
// GPS anomalies, days since last visit, pending items.
export const getTeamPerformance = asyncHandler(async (req, res) => {
  const { company_id } = req.user;

  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo    = new Date(Date.now() - 7  * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month      = now.getMonth() + 1;
  const year       = now.getFullYear();

  const reps = await prisma.user.findMany({
    where:  { company_id, role: "MedicalRep" },
    select: { id: true, firstname: true, lastname: true, role: true },
    orderBy: { firstname: "asc" },
  });

  const data = await Promise.all(
    reps.map(async (rep) => {
      const [
        visitsToday,
        visitsWeek,
        visitsMonth,
        lastActivity,
        gpsCount,
        pendingReports,
        pendingExpenses,
        cycle,
      ] = await Promise.all([
        prisma.doctorActivity.count({
          where: { user_id: rep.id, date: { gte: todayStart } },
        }),
        prisma.doctorActivity.count({
          where: { user_id: rep.id, date: { gte: weekAgo } },
        }),
        prisma.doctorActivity.count({
          where: { user_id: rep.id, date: { gte: monthStart } },
        }),
        prisma.doctorActivity.findFirst({
          where:   { user_id: rep.id },
          orderBy: { date: "desc" },
          select:  { date: true },
        }),
        prisma.doctorActivity.count({
          where: { user_id: rep.id, gps_anomaly: true, date: { gte: weekAgo } },
        }),
        prisma.dailyReport.count({
          where: { user_id: rep.id, status: "SUBMITTED" },
        }),
        prisma.expenseClaim.count({
          where: { user_id: rep.id, status: "SUBMITTED" },
        }),
        prisma.callCycle.findUnique({
          where: { user_id_month_year: { user_id: rep.id, month, year } },
          include: {
            items: { select: { frequency: true, visits_done: true } },
          },
        }),
      ]);

      const totalTarget = cycle?.items.reduce((s, i) => s + i.frequency, 0) ?? 0;
      const totalDone   = cycle?.items.reduce((s, i) => s + i.visits_done, 0) ?? 0;
      const cycleAdherencePct =
        totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : null;

      const daysSinceLast = lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity.date).getTime()) / 86_400_000)
        : null;

      return {
        user: rep,
        visits_today:          visitsToday,
        visits_this_week:      visitsWeek,
        visits_this_month:     visitsMonth,
        cycle_visits_done:     totalDone,
        cycle_total_target:    totalTarget,
        cycle_adherence_pct:   cycleAdherencePct,
        last_visit_date:       lastActivity?.date ?? null,
        days_since_last_visit: daysSinceLast,
        gps_anomaly_count_week: gpsCount,
        pending_reports:       pendingReports,
        pending_expenses:      pendingExpenses,
      };
    })
  );

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
