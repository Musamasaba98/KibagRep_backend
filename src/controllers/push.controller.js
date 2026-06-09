import webpush from "web-push";
import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@kibagrep.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// POST /api/push/subscribe
export const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400); throw new Error("Invalid subscription object");
  }
  // Upsert by endpoint — same browser re-subscribing updates keys
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth, user_id: req.user.id },
    create: { user_id: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.status(201).json({ success: true });
});

// DELETE /api/push/subscribe
export const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, user_id: req.user.id } });
  }
  res.json({ success: true });
});

// POST /api/push/test — sends a test notification to the calling user's subscribed devices
export const testPush = asyncHandler(async (req, res) => {
  const { sent, failed } = await sendPushToUsers([req.user.id], {
    title: "Test Notification 🔔",
    body: "Push notifications are working correctly on this device.",
    url: "/rep-page",
    tag: "test",
  });
  if (sent === 0 && failed === 0) {
    res.status(404); throw new Error("No push subscriptions found for this account. Enable notifications first.");
  }
  res.json({ success: true, sent, failed });
});

// Internal utility — called by the cron job
export const sendPushToUsers = async (userIds, payload) => {
  const subs = await prisma.pushSubscription.findMany({
    where: { user_id: { in: userIds } },
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      ).catch(async (err) => {
        // 410 Gone = subscription expired/revoked — clean it up
        if (err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
        throw err;
      })
    )
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { sent, failed };
};
