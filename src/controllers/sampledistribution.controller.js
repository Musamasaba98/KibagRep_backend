import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

const INCLUDE = {
  doctor:  { select: { id: true, doctor_name: true, location: true, town: true } },
  product: { select: { id: true, product_name: true } },
  user:    { select: { id: true, firstname: true, lastname: true } },
};

// POST /api/sample — rep logs samples given to a doctor
export const createSampleDistribution = asyncHandler(async (req, res) => {
  const { doctor_id, product_id, samples_given } = req.body;
  const user_id = req.user.id; // always from token, never from body

  if (!doctor_id || !product_id || samples_given == null) {
    res.status(400);
    throw new Error("doctor_id, product_id and samples_given are required");
  }

  const sample = await prisma.sampleDistribution.create({
    data: {
      user:          { connect: { id: user_id } },
      doctor:        { connect: { id: doctor_id } },
      product:       { connect: { id: product_id } },
      samples_given: Number(samples_given),
    },
    include: INCLUDE,
  });

  res.status(201).json({ success: true, data: sample });
});

// GET /api/sample/my — rep's own distribution history
export const getMyDistributions = asyncHandler(async (req, res) => {
  const samples = await prisma.sampleDistribution.findMany({
    where:   { user_id: req.user.id },
    include: INCLUDE,
    orderBy: { date: "desc" },
    take:    200,
  });
  res.json({ success: true, data: samples });
});

// GET /api/sample/team — supervisor/manager sees company-scoped distributions
export const getTeamDistributions = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.json({ success: true, data: [] });

  const companyUserIds = (
    await prisma.user.findMany({ where: { company_id: companyId }, select: { id: true } })
  ).map(u => u.id);

  const samples = await prisma.sampleDistribution.findMany({
    where:   { user_id: { in: companyUserIds } },
    include: INCLUDE,
    orderBy: { date: "desc" },
    take:    500,
  });
  res.json({ success: true, data: samples });
});

// GET /api/sample/:id — must belong to requesting user's company
export const getSampleDistribution = asyncHandler(async (req, res) => {
  const sample = await prisma.sampleDistribution.findUnique({
    where:   { id: req.params.id },
    include: { ...INCLUDE, user: { select: { id: true, company_id: true, firstname: true, lastname: true } } },
  });
  if (!sample) { res.status(404); throw new Error("Not found"); }

  const isSelf        = sample.user_id === req.user.id;
  const isSameCompany = sample.user.company_id === req.user.company_id;
  if (!isSelf && !isSameCompany) { res.status(403); throw new Error("Access denied"); }

  res.json({ success: true, data: sample });
});

// PUT /api/sample/:id — rep can only edit their own records
export const updateSampleDistribution = asyncHandler(async (req, res) => {
  const sample = await prisma.sampleDistribution.findUnique({ where: { id: req.params.id } });
  if (!sample) { res.status(404); throw new Error("Not found"); }
  if (sample.user_id !== req.user.id) { res.status(403); throw new Error("Access denied"); }

  const { samples_given } = req.body;
  const updated = await prisma.sampleDistribution.update({
    where:   { id: req.params.id },
    data:    { samples_given: Number(samples_given) },
    include: INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// DELETE /api/sample/:id — supervisor/manager of same company, or SUPER_ADMIN
export const deleteSampleDistribution = asyncHandler(async (req, res) => {
  const sample = await prisma.sampleDistribution.findUnique({
    where:   { id: req.params.id },
    include: { user: { select: { company_id: true } } },
  });
  if (!sample) { res.status(404); throw new Error("Not found"); }
  if (sample.user.company_id !== req.user.company_id && req.user.role !== "SUPER_ADMIN") {
    res.status(403); throw new Error("Access denied");
  }
  await prisma.sampleDistribution.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
