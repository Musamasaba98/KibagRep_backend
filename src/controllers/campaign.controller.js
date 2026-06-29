import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const CAMPAIGN_INCLUDE = {
  product: { select: { id: true, product_name: true } },
  creator: { select: { id: true, firstname: true, lastname: true, role: true } },
};

// GET /api/campaign — all campaigns for the company
export const getCampaigns = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const campaigns = await prisma.campaign.findMany({
    where: {
      company_id: req.user.company_id,
      ...(status ? { status } : {}),
    },
    include: CAMPAIGN_INCLUDE,
    orderBy: { created_at: "desc" },
  });
  res.json({ success: true, data: campaigns });
});

// POST /api/campaign — create a campaign
export const createCampaign = asyncHandler(async (req, res) => {
  const { name, brief, product_id, start_date, end_date, status, target_all, team_ids } = req.body;
  if (!name || !brief || !start_date || !end_date) {
    res.status(400);
    throw new Error("name, brief, start_date and end_date are required");
  }
  const campaign = await prisma.campaign.create({
    data: {
      company_id: req.user.company_id,
      name,
      brief,
      product_id: product_id || null,
      start_date: new Date(start_date),
      end_date:   new Date(end_date),
      status:     status ?? "ACTIVE",
      target_all: target_all ?? true,
      team_ids:   team_ids ?? [],
      created_by: req.user.id,
    },
    include: CAMPAIGN_INCLUDE,
  });
  res.status(201).json({ success: true, data: campaign });
});

// PUT /api/campaign/:id — update a campaign
export const updateCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing || existing.company_id !== req.user.company_id) {
    res.status(404);
    throw new Error("Campaign not found");
  }
  const { name, brief, product_id, start_date, end_date, status, target_all, team_ids } = req.body;
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...(name        !== undefined && { name }),
      ...(brief       !== undefined && { brief }),
      ...(product_id  !== undefined && { product_id: product_id || null }),
      ...(start_date  !== undefined && { start_date: new Date(start_date) }),
      ...(end_date    !== undefined && { end_date:   new Date(end_date)   }),
      ...(status      !== undefined && { status }),
      ...(target_all  !== undefined && { target_all }),
      ...(team_ids    !== undefined && { team_ids }),
    },
    include: CAMPAIGN_INCLUDE,
  });
  res.json({ success: true, data: campaign });
});

// DELETE /api/campaign/:id — cancel (soft-delete via status)
export const deleteCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing || existing.company_id !== req.user.company_id) {
    res.status(404);
    throw new Error("Campaign not found");
  }
  await prisma.campaign.update({ where: { id }, data: { status: "CANCELLED" } });
  res.json({ success: true });
});

// GET /api/campaign/active — lightweight list for reps (name + brief + product)
export const getActiveCampaigns = asyncHandler(async (req, res) => {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      company_id: req.user.company_id,
      status: "ACTIVE",
      start_date: { lte: now },
      end_date:   { gte: now },
    },
    select: {
      id: true, name: true, brief: true,
      start_date: true, end_date: true,
      product: { select: { id: true, product_name: true } },
    },
    orderBy: { start_date: "desc" },
  });
  res.json({ success: true, data: campaigns });
});
