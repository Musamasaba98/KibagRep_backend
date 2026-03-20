import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// POST /api/competitor
export const logCompetitorIntel = asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  const company_id = req.user.company_id;

  if (!company_id) { res.status(400); throw new Error("User has no company"); }

  const {
    competitor_company,
    competitor_brand,
    competitor_sku,
    is_listed,
    price_to_trade,
    price_to_consumer,
    stock_quantity,
    notes,
    doctor_id,
    pharmacy_id,
  } = req.body;

  if (!competitor_company || !competitor_brand) {
    res.status(400);
    throw new Error("competitor_company and competitor_brand are required");
  }

  const record = await prisma.competitorIntel.create({
    data: {
      user_id,
      company_id,
      competitor_company,
      competitor_brand,
      competitor_sku:      competitor_sku ?? null,
      is_listed:           is_listed ?? false,
      price_to_trade:      price_to_trade ?? null,
      price_to_consumer:   price_to_consumer ?? null,
      stock_quantity:      stock_quantity ?? null,
      notes:               notes ?? null,
      doctor_id:           doctor_id ?? null,
      pharmacy_id:         pharmacy_id ?? null,
    },
    include: {
      doctor:   { select: { id: true, doctor_name: true } },
      pharmacy: { select: { id: true, pharmacy_name: true } },
    },
  });

  res.status(201).json({ success: true, data: record });
});

// GET /api/competitor
export const getCompetitorIntel = asyncHandler(async (req, res) => {
  const company_id = req.user.company_id;
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const skip  = (page - 1) * limit;
  const q     = (req.query.q || "").trim();

  const where = {
    company_id,
    ...(q ? {
      OR: [
        { competitor_company: { contains: q, mode: "insensitive" } },
        { competitor_brand:   { contains: q, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.competitorIntel.findMany({
      where,
      include: {
        user:     { select: { id: true, firstname: true, lastname: true } },
        doctor:   { select: { id: true, doctor_name: true, town: true } },
        pharmacy: { select: { id: true, pharmacy_name: true, town: true } },
      },
      orderBy: { observed_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.competitorIntel.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: records,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

// GET /api/competitor/summary — brand-level aggregation
export const getCompetitorSummary = asyncHandler(async (req, res) => {
  const company_id = req.user.company_id;
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const records = await prisma.competitorIntel.findMany({
    where: { company_id, observed_at: { gte: since } },
    select: {
      competitor_company: true,
      competitor_brand:   true,
      is_listed:          true,
      price_to_consumer:  true,
    },
  });

  // Group by brand
  const brandMap = {};
  for (const r of records) {
    const key = `${r.competitor_company}||${r.competitor_brand}`;
    if (!brandMap[key]) {
      brandMap[key] = {
        competitor_company: r.competitor_company,
        competitor_brand:   r.competitor_brand,
        sightings:          0,
        listed_count:       0,
        avg_price_consumer: null,
        prices:             [],
      };
    }
    brandMap[key].sightings++;
    if (r.is_listed) brandMap[key].listed_count++;
    if (r.price_to_consumer) brandMap[key].prices.push(r.price_to_consumer);
  }

  const summary = Object.values(brandMap).map((b) => ({
    ...b,
    avg_price_consumer: b.prices.length
      ? Math.round(b.prices.reduce((s, p) => s + p, 0) / b.prices.length)
      : null,
    prices: undefined,
  })).sort((a, b) => b.sightings - a.sightings);

  res.status(200).json({ success: true, data: summary });
});
