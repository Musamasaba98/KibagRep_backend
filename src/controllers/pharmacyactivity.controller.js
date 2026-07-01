import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const GPS_ANOMALY_THRESHOLD_M = 100;

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

// POST /api/field-pharmacy/add-pharmacy-activity
export const createPharmacyActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { pharmacy_id, products_observed, outcome, gps_lat, gps_lng, queued_at, staff_met_ids } = req.body;

  if (!pharmacy_id) {
    res.status(400);
    throw new Error("pharmacy_id is required");
  }

  // products_observed: [{ product_id, qty }]
  const observed = Array.isArray(products_observed) ? products_observed : [];

  const stockNoted = {};
  for (const item of observed) {
    if (item.product_id && item.qty > 0) stockNoted[item.product_id] = item.qty;
  }

  const connectProducts = observed
    .filter((i) => i.product_id)
    .map((i) => ({ id: i.product_id }));

  let gps_anomaly = false;
  if (gps_lat != null && gps_lng != null) {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: pharmacy_id },
      select: { latitude: true, longitude: true },
    });
    if (pharmacy?.latitude != null && pharmacy?.longitude != null) {
      gps_anomaly = gpsDistanceMetres(gps_lat, gps_lng, pharmacy.latitude, pharmacy.longitude) > GPS_ANOMALY_THRESHOLD_M;
    }
  }

  const activity = await prisma.pharmacyActivity.create({
    data: {
      user:     { connect: { id: userId } },
      pharmacy: { connect: { id: pharmacy_id } },
      products_in_stock: connectProducts.length > 0 ? { connect: connectProducts } : undefined,
      stock_noted: Object.keys(stockNoted).length > 0 ? stockNoted : undefined,
      outcome:        outcome ?? null,
      gps_lat:        gps_lat ?? null,
      gps_lng:        gps_lng ?? null,
      queued_at:      queued_at ? new Date(queued_at) : null,
      timing_anomaly: queued_at ? (new Date(queued_at).getHours() >= 21) : false,
      gps_anomaly,
      ...(Array.isArray(staff_met_ids) && staff_met_ids.length > 0
        ? { staff_met: { create: staff_met_ids.map((staff_id) => ({ staff_id })) } }
        : {}),
    },
    include: {
      pharmacy: { select: { id: true, pharmacy_name: true, town: true, location: true } },
    },
  });

  res.status(201).json({ success: true, data: activity });
});

// GET /api/field-pharmacy/history?days=30&limit=200
export const getPharmacyActivityHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const days   = parseInt(req.query.days  ?? "30");
  const limit  = parseInt(req.query.limit ?? "200");
  const since  = new Date(Date.now() - days * 86_400_000);

  const activities = await prisma.pharmacyActivity.findMany({
    where:   { user_id: userId, date: { gte: since } },
    include: { pharmacy: { select: { id: true, pharmacy_name: true, town: true, location: true } } },
    orderBy: { date: "desc" },
    take:    limit,
  });

  res.json({ success: true, data: activities });
});
