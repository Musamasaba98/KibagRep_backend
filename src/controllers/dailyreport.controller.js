import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";
import { sendMail } from "../utils/mailer.js";
import { writeAudit } from "../utils/audit.js";

function dayStart(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// GET /api/daily-report/today
export const getTodayReport = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = dayStart();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const [visitsCount, pharmCount, samplesAgg] = await Promise.all([
    prisma.doctorActivity.count({ where: { user_id: userId, date: { gte: today, lt: tomorrow } } }),
    prisma.pharmacyActivity.count({ where: { user_id: userId, date: { gte: today, lt: tomorrow } } }),
    prisma.doctorActivity.aggregate({
      where: { user_id: userId, date: { gte: today, lt: tomorrow } },
      _sum: { samples_given: true },
    }),
  ]);

  let report = await prisma.dailyReport.findUnique({
    where: { user_id_report_date: { user_id: userId, report_date: today } },
  });

  if (!report) {
    report = await prisma.dailyReport.create({
      data: {
        user: { connect: { id: userId } },
        report_date: today,
        visits_count: visitsCount + pharmCount,
        samples_count: samplesAgg._sum.samples_given ?? 0,
      },
    });
  } else if (report.status === 'DRAFT') {
    // Always refresh counts while still a draft so the rep sees live totals
    report = await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        visits_count: visitsCount + pharmCount,
        samples_count: samplesAgg._sum.samples_given ?? 0,
      },
    });
  }

  res.status(200).json({ success: true, data: report });
});

// POST /api/daily-report/submit
export const submitReport = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { summary, jfw_observer_id } = req.body;
  const today = dayStart();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const [visitsCount, pharmCount, samplesAgg, user] = await Promise.all([
    prisma.doctorActivity.count({ where: { user_id: userId, date: { gte: today, lt: tomorrow } } }),
    prisma.pharmacyActivity.count({ where: { user_id: userId, date: { gte: today, lt: tomorrow } } }),
    prisma.doctorActivity.aggregate({
      where: { user_id: userId, date: { gte: today, lt: tomorrow } },
      _sum: { samples_given: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstname: true, lastname: true, company_id: true } }),
  ]);

  const report = await prisma.dailyReport.upsert({
    where: { user_id_report_date: { user_id: userId, report_date: today } },
    create: {
      user: { connect: { id: userId } },
      report_date: today,
      summary: summary ?? null,
      visits_count: visitsCount + pharmCount,
      samples_count: samplesAgg._sum.samples_given ?? 0,
      status: "SUBMITTED",
      jfw_observer_id: jfw_observer_id ?? null,
    },
    update: {
      summary: summary ?? undefined,
      visits_count: visitsCount + pharmCount,
      samples_count: samplesAgg._sum.samples_given ?? 0,
      status: "SUBMITTED",
      jfw_observer_id: jfw_observer_id ?? null,
    },
  });

  // Notify supervisors in the same company
  if (user?.company_id) {
    const supervisors = await prisma.user.findMany({
      where: { company_id: user.company_id, role: { in: ["Supervisor", "Manager"] } },
      select: { email: true },
    });
    const repName = `${user.firstname} ${user.lastname}`;
    const dateStr = today.toDateString();
    await Promise.all(supervisors.map((s) =>
      sendMail({
        to: s.email,
        subject: `Daily Report Submitted — ${repName} (${dateStr})`,
        html: `<p><strong>${repName}</strong> submitted their daily report for <strong>${dateStr}</strong>.</p>
               <p>Visits: ${visitsCount} &nbsp;|&nbsp; Samples: ${samplesAgg._sum.samples_given ?? 0}</p>
               ${summary ? `<p><em>${summary}</em></p>` : ""}
               <p>Please log in to review and approve.</p>`,
      })
    ));
  }

  await writeAudit({ actorId: userId, action: "report.submitted", entityType: "DailyReport", entityId: report.id });

  res.status(200).json({ success: true, data: report });
});

// GET /api/daily-report/my?days=30
export const getMyReports = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const reports = await prisma.dailyReport.findMany({
    where: { user_id: userId, report_date: { gte: since } },
    orderBy: { report_date: "desc" },
  });

  res.status(200).json({ success: true, data: reports });
});

// GET /api/daily-report/pending  — supervisor
export const getPendingReports = asyncHandler(async (req, res) => {
  const currentUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { company_id: true },
  });
  if (!currentUser?.company_id) return res.status(200).json({ success: true, data: [] });

  const companyUserIds = (
    await prisma.user.findMany({ where: { company_id: currentUser.company_id }, select: { id: true } })
  ).map((u) => u.id);

  const reports = await prisma.dailyReport.findMany({
    where: { user_id: { in: companyUserIds }, status: "SUBMITTED" },
    include: { user: { select: { id: true, firstname: true, lastname: true, role: true } } },
    orderBy: { report_date: "desc" },
  });

  res.status(200).json({ success: true, data: reports });
});

// PUT /api/daily-report/:id/approve
export const approveReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user.id;

  const report = await prisma.dailyReport.findUnique({
    where: { id },
    include: { user: { select: { email: true, firstname: true, lastname: true } } },
  });
  if (!report) { res.status(404); throw new Error("Report not found"); }
  if (report.status !== "SUBMITTED") { res.status(400); throw new Error("Report is not in SUBMITTED state"); }

  const updated = await prisma.dailyReport.update({
    where: { id },
    data: { status: "APPROVED", reviewed_by: reviewerId, reviewed_at: new Date() },
  });

  await Promise.all([
    sendMail({
      to: report.user.email,
      subject: `Your daily report was approved`,
      html: `<p>Hi ${report.user.firstname},</p>
             <p>Your daily report for <strong>${report.report_date.toDateString()}</strong> has been <strong style="color:green">approved</strong>.</p>`,
    }),
    writeAudit({ actorId: reviewerId, action: "report.approved", entityType: "DailyReport", entityId: id }),
  ]);

  res.status(200).json({ success: true, data: updated });
});

// PUT /api/daily-report/:id/reject
export const rejectReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const reviewerId = req.user.id;

  const report = await prisma.dailyReport.findUnique({
    where: { id },
    include: { user: { select: { email: true, firstname: true, lastname: true } } },
  });
  if (!report) { res.status(404); throw new Error("Report not found"); }
  if (report.status !== "SUBMITTED") { res.status(400); throw new Error("Report is not in SUBMITTED state"); }

  const updated = await prisma.dailyReport.update({
    where: { id },
    data: { status: "REJECTED", reviewed_by: reviewerId, reviewed_at: new Date(), review_note: note ?? null },
  });

  await Promise.all([
    sendMail({
      to: report.user.email,
      subject: `Your daily report needs revision`,
      html: `<p>Hi ${report.user.firstname},</p>
             <p>Your daily report for <strong>${report.report_date.toDateString()}</strong> was <strong style="color:red">rejected</strong>.</p>
             ${note ? `<p><strong>Reason:</strong> ${note}</p>` : ""}
             <p>Please revise and resubmit.</p>`,
    }),
    writeAudit({ actorId: reviewerId, action: "report.rejected", entityType: "DailyReport", entityId: id, metadata: { note } }),
  ]);

  res.status(200).json({ success: true, data: updated });
});

// GET /api/daily-report/observers — supervisors/managers in same company (for JFW selection)
export const getCompanyObservers = asyncHandler(async (req, res) => {
  const currentUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { company_id: true },
  });
  if (!currentUser?.company_id) return res.status(200).json({ success: true, data: [] });

  const observers = await prisma.user.findMany({
    where: {
      company_id: currentUser.company_id,
      role: { in: ["Supervisor", "Manager", "COUNTRY_MGR"] },
    },
    select: { id: true, firstname: true, lastname: true, role: true },
    orderBy: [{ role: "asc" }, { firstname: "asc" }],
  });

  res.status(200).json({ success: true, data: observers });
});

// GET /api/daily-report/:id/activities
// Returns every DoctorActivity logged by the rep on the report's date.
// Scoped to the supervisor's company so a supervisor can never peek at another company.
export const getReportActivities = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  const report = await prisma.dailyReport.findUnique({
    where: { id },
    include: { user: { select: { id: true, company_id: true } } },
  });

  if (!report || report.user.company_id !== company_id) {
    res.status(404);
    throw new Error("Report not found");
  }

  const start = dayStart(new Date(report.report_date));
  const end   = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);

  const activities = await prisma.doctorActivity.findMany({
    where: { user_id: report.user_id, date: { gte: start, lt: end } },
    include: {
      doctor:           { select: { id: true, doctor_name: true, speciality: true, location: true, town: true } },
      focused_product:  { select: { id: true, product_name: true } },
      products_detailed: { select: { id: true, product_name: true } },
    },
    orderBy: { date: "asc" },
  });

  res.json({ success: true, data: activities });
});

// GET /api/daily-report/company?days=30&status=SUBMITTED,APPROVED
export const getCompanyReports = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  if (!company_id) return res.status(200).json({ success: true, data: [] });

  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const allowed = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
  const statusFilter = req.query.status
    ? req.query.status.split(',').filter(s => allowed.includes(s))
    : allowed;

  const companyUserIds = (
    await prisma.user.findMany({ where: { company_id }, select: { id: true } })
  ).map(u => u.id);

  const reports = await prisma.dailyReport.findMany({
    where: { user_id: { in: companyUserIds }, report_date: { gte: since }, status: { in: statusFilter } },
    include: { user: { select: { id: true, firstname: true, lastname: true, role: true } } },
    orderBy: { report_date: 'desc' },
    take: 200,
  });

  res.status(200).json({ success: true, data: reports });
});

// GET /api/daily-report/jfw — reports where I was the JFW observer
export const getJfwReports = asyncHandler(async (req, res) => {
  const reports = await prisma.dailyReport.findMany({
    where: { jfw_observer_id: req.user.id },
    include: { user: { select: { id: true, firstname: true, lastname: true } } },
    orderBy: { report_date: 'desc' },
    take: 100,
  });

  res.status(200).json({ success: true, data: reports });
});
