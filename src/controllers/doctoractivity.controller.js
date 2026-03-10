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

export const getTodayActivities = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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

  // Atomic: create activity + increment visits_done on matching cycle item
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
  const [activities, total, repSummary] = await Promise.all([
    prisma.doctorActivity.findMany({
      where: { user_id: { in: userIds }, date: { gte: since } },
      include: {
        user: { select: { id: true, firstname: true, lastname: true, role: true } },
        doctor: { select: { id: true, doctor_name: true, town: true } },
        focused_product: { select: { id: true, product_name: true } },
      },
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.doctorActivity.count({ where: { user_id: { in: userIds }, date: { gte: since } } }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: userIds }, date: { gte: since } },
      _count: { id: true },
      _sum: { samples_given: true },
    }),
  ]);
  const usersMap = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstname: true, lastname: true, role: true } });
  const usersById = Object.fromEntries(usersMap.map((u) => [u.id, u]));
  const summary = repSummary.map((r) => ({ user: usersById[r.user_id], visits: r._count.id, samples: r._sum.samples_given ?? 0 }));
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
