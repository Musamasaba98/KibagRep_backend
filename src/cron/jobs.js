import cron from "node-cron";
import prisma from "../config/prisma.config.js";
import { sendMail } from "../utils/mailer.js";
import { sendPushToUsers } from "../controllers/push.controller.js";

// ─── Daily morning reminder to reps (08:00 EAT = 05:00 UTC) ─────────────

cron.schedule("0 5 * * *", async () => {
  console.log("[cron] Running daily rep reminder…");
  try {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();

    const cycles = await prisma.callCycle.findMany({
      where: {
        month,
        year,
        status: { in: ["APPROVED", "LOCKED"] },
      },
      include: {
        user: { select: { email: true, firstname: true } },
        items: {
          include: { doctor: { select: { doctor_name: true, town: true } } },
        },
      },
    });

    for (const cycle of cycles) {
      // Doctors not yet fully visited
      const pending = cycle.items.filter((i) => i.visits_done < i.frequency);
      if (pending.length === 0) continue;

      const doctorList = pending
        .slice(0, 10)
        .map(
          (i) =>
            `<li>${i.doctor.doctor_name} — ${i.doctor.town} (${i.visits_done}/${i.frequency} visits done)</li>`
        )
        .join("");

      await sendMail({
        to: cycle.user.email,
        subject: "Your call plan reminder — KibagRep",
        html: `<p>Hi ${cycle.user.firstname},</p>
<p>You have <strong>${pending.length}</strong> doctor(s) still due for visits this month:</p>
<ul>${doctorList}</ul>
<p>Have a productive day!</p>`,
      });
    }
  } catch (err) {
    console.error("[cron] Daily reminder failed:", err.message);
  }
});

// ─── Weekly summary to managers (Monday 07:00 EAT = 04:00 UTC) ──────────

cron.schedule("0 4 * * 1", async () => {
  console.log("[cron] Running weekly manager summary…");
  try {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

    const managers = await prisma.user.findMany({
      where: { role: { in: ["Manager", "SUPER_ADMIN"] } },
      select: { id: true, email: true, firstname: true, company_id: true },
    });

    for (const manager of managers) {
      const [reportCount, activityCount] = await Promise.all([
        prisma.dailyReport.count({
          where: {
            status: "SUBMITTED",
            user: { company_id: manager.company_id },
            created_at: { gte: weekAgo },
          },
        }),
        prisma.doctorActivity.count({
          where: {
            user: { company_id: manager.company_id },
            date: { gte: weekAgo },
          },
        }),
      ]);

      if (reportCount === 0 && activityCount === 0) continue;

      await sendMail({
        to: manager.email,
        subject: "Weekly field summary — KibagRep",
        html: `<p>Hi ${manager.firstname},</p>
<p>Team activity for the past 7 days:</p>
<ul>
  <li><strong>${activityCount}</strong> doctor visits logged</li>
  <li><strong>${reportCount}</strong> daily reports pending review</li>
</ul>
<p>Log in to KibagRep to review and approve.</p>`,
      });
    }
  } catch (err) {
    console.error("[cron] Weekly summary failed:", err.message);
  }
});

// ─── Shared helper — reps without a submitted/approved report today ──────────
const getRepsWithoutReportToday = async () => {
  // EAT midnight = UTC 21:00 previous day. "Today" in EAT = UTC date shifted by +3h.
  const nowUTC = new Date();
  const eatMs  = nowUTC.getTime() + 3 * 60 * 60 * 1000;
  const eatNow = new Date(eatMs);
  const eatDateStr = eatNow.toISOString().slice(0, 10); // "2026-06-04"
  const dayStart = new Date(eatDateStr + "T00:00:00+03:00");
  const dayEnd   = new Date(eatDateStr + "T23:59:59+03:00");

  // Reps who have an APPROVED or SUBMITTED report today
  const submitted = await prisma.dailyReport.findMany({
    where: {
      report_date: { gte: dayStart, lte: dayEnd },
      status: { in: ["SUBMITTED", "APPROVED"] },
    },
    select: { user_id: true },
  });
  const submittedIds = new Set(submitted.map((r) => r.user_id));

  // All active reps
  const reps = await prisma.user.findMany({
    where: { role: "MedicalRep" },
    select: { id: true },
  });

  return reps.map((r) => r.id).filter((id) => !submittedIds.has(id));
};

// ─── 6pm EAT (15:00 UTC) Mon–Sat — first reminder ───────────────────────────
cron.schedule("0 15 * * 1-6", async () => {
  const ids = await getRepsWithoutReportToday().catch(() => []);
  if (!ids.length) return;
  const { sent } = await sendPushToUsers(ids, {
    title: "Daily Report Reminder",
    body: "Don't forget to submit your daily report before midnight.",
    url: "/rep-page/reports",
    tag: "daily-report",
  }).catch(() => ({ sent: 0 }));
  console.log(`[cron] 6pm reminder → ${sent} push(es) sent to ${ids.length} rep(s)`);
});

// ─── 10pm EAT (19:00 UTC) Mon–Sat — second reminder ─────────────────────────
cron.schedule("0 19 * * 1-6", async () => {
  const ids = await getRepsWithoutReportToday().catch(() => []);
  if (!ids.length) return;
  const { sent } = await sendPushToUsers(ids, {
    title: "Report Still Pending ⚠",
    body: "Your daily report hasn't been submitted. You have until midnight.",
    url: "/rep-page/reports",
    tag: "daily-report",
  }).catch(() => ({ sent: 0 }));
  console.log(`[cron] 10pm reminder → ${sent} push(es) sent to ${ids.length} rep(s)`);
});

// ─── 11:30pm EAT (20:30 UTC) Mon–Sat — final warning ────────────────────────
cron.schedule("30 20 * * 1-6", async () => {
  const ids = await getRepsWithoutReportToday().catch(() => []);
  if (!ids.length) return;
  const { sent } = await sendPushToUsers(ids, {
    title: "Last Chance — 30 Minutes Left 🚨",
    body: "After midnight you'll need supervisor approval to submit your report.",
    url: "/rep-page/reports",
    tag: "daily-report",
    urgent: true,
  }).catch(() => ({ sent: 0 }));
  console.log(`[cron] 11:30pm final warning → ${sent} push(es) sent to ${ids.length} rep(s)`);
});

// ─── Midnight EAT (21:00 UTC) Mon–Sat — lock window ─────────────────────────
// No push at midnight — window is now closed. Reps who still haven't submitted
// will see a locked state on the Reports page and must request supervisor approval.
cron.schedule("0 21 * * 1-6", async () => {
  const ids = await getRepsWithoutReportToday().catch(() => []);
  if (ids.length) {
    console.log(`[cron] Midnight — ${ids.length} rep(s) missed the report deadline`);
    // Future: create a system notification or flag on the rep profile
  }
});

console.log("[cron] Jobs registered: morning reminder (05:00 UTC), weekly summary (Mon 04:00 UTC), evening reminders (15:00 / 19:00 / 20:30 / 21:00 UTC)");
