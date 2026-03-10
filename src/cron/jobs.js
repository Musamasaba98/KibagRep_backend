import cron from "node-cron";
import prisma from "../config/prisma.config.js";
import { sendMail } from "../utils/mailer.js";

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

console.log("[cron] Jobs registered: daily rep reminder (05:00 UTC), weekly manager summary (Mon 04:00 UTC)");
