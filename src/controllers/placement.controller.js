import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// GET /api/placement?month=&year= — all placement targets for the company
export const getPlacementTargets = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year = parseInt(req.query.year) || now.getFullYear();

  const targets = await prisma.stockPlacementTarget.findMany({
    where: { company_id, month, year },
    include: {
      pharmacy: { select: { id: true, pharmacy_name: true, town: true, location: true } },
      product:  { select: { id: true, product_name: true } },
    },
    orderBy: [{ pharmacy: { pharmacy_name: "asc" } }, { product: { product_name: "asc" } }],
  });

  res.json({ success: true, data: targets, month, year });
});

// POST /api/placement — upsert a single placement target
export const upsertPlacementTarget = asyncHandler(async (req, res) => {
  const { company_id, id: set_by } = req.user;
  const { pharmacy_id, product_id, month, year, target_units } = req.body;

  if (!pharmacy_id || !product_id || !month || !year) {
    return res.status(400).json({ success: false, message: "pharmacy_id, product_id, month, year required" });
  }

  const target = await prisma.stockPlacementTarget.upsert({
    where: {
      company_id_pharmacy_id_product_id_month_year: {
        company_id, pharmacy_id, product_id,
        month: Number(month), year: Number(year),
      },
    },
    update: { target_units: Number(target_units) || 0, set_by },
    create: {
      company_id, pharmacy_id, product_id,
      month: Number(month), year: Number(year),
      target_units: Number(target_units) || 0,
      set_by,
    },
  });

  res.json({ success: true, data: target });
});

// POST /api/placement/bulk — upsert many targets at once
export const bulkUpsertPlacementTargets = asyncHandler(async (req, res) => {
  const { company_id, id: set_by } = req.user;
  const { items, month, year } = req.body;
  // items: [{ pharmacy_id, product_id, target_units }]

  if (!items?.length || !month || !year) {
    return res.status(400).json({ success: false, message: "items, month, year required" });
  }

  const upserts = items.map(({ pharmacy_id, product_id, target_units }) =>
    prisma.stockPlacementTarget.upsert({
      where: {
        company_id_pharmacy_id_product_id_month_year: {
          company_id, pharmacy_id, product_id,
          month: Number(month), year: Number(year),
        },
      },
      update: { target_units: Number(target_units) || 0, set_by },
      create: {
        company_id, pharmacy_id, product_id,
        month: Number(month), year: Number(year),
        target_units: Number(target_units) || 0,
        set_by,
      },
    })
  );

  await prisma.$transaction(upserts);
  res.json({ success: true, message: `${items.length} placement targets saved` });
});
