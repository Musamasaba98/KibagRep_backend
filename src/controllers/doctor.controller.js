import { deleteOne, getAll, getOne, updateOne } from "./factory.controller.js";
import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
export const createDoctor = asyncHandler(async (req, res, next) => {
  const { doctor_name, speciality, location, town, contact, facility } =
    req.body;
  try {
    const item = await prisma.doctor.create({
      data: {
        doctor_name,
        speciality,
        location,
        town,
        contact,
        facility: {
          connect: {
            id: facility,
          },
        },
      },
    });
    if (!item) {
      return next(new Error(`The facility has failed to create.`));
    }
    res.status(201).send({ status: "success", data: item });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});
export const getDoctor = getOne("doctor");
export const deleteDoctor = deleteOne("doctor");
export const updateDoctor = updateOne("doctor");

// GET /api/doctor — doctor list
// ?scope=company (default) → only doctors approved for the user's company
// ?scope=all              → full KibagRep master list (for reps to recommend from)
export const getAllDoctor = asyncHandler(async (req, res) => {
  const companyId = req.user?.company_id ?? null;
  const scope = req.query.scope ?? "company";

  if (scope === "company" && companyId) {
    // Return only doctors on this company's approved list
    const companyDoctors = await prisma.companyDoctor.findMany({
      where: { company_id: companyId },
      include: {
        doctor: {
          include: {
            company_tiers: {
              where: { company_id: companyId },
              select: { tier: true, visit_frequency: true, notes: true },
            },
          },
        },
      },
      orderBy: { doctor: { doctor_name: "asc" } },
    });

    const data = companyDoctors.map((cd) => ({
      company_id: cd.company_id,
      doctor_id: cd.doctor_id,
      added_at: cd.added_at,
      doctor: {
        ...cd.doctor,
        company_tier: cd.doctor.company_tiers?.length ? cd.doctor.company_tiers[0] : null,
        company_tiers: undefined,
      },
    }));

    return res.status(200).json({ success: true, data });
  }

  // scope=all — full master directory, with company tier if available
  const doctors = await prisma.doctor.findMany({
    include: companyId
      ? {
          company_tiers: { where: { company_id: companyId }, select: { tier: true, visit_frequency: true, notes: true } },
          company_doctors: companyId ? { where: { company_id: companyId }, select: { company_id: true } } : false,
        }
      : undefined,
    orderBy: { doctor_name: "asc" },
  });

  const data = doctors.map(({ company_tiers, company_doctors, ...rest }) => ({
    ...rest,
    company_tier: company_tiers?.length ? company_tiers[0] : null,
    on_company_list: !!(company_doctors?.length),
  }));

  res.status(200).json({ success: true, data });
});

// PUT /api/doctor/:id/tier — upsert this company's tier classification for a doctor
export const setDoctorTier = asyncHandler(async (req, res) => {
  const doctor_id = req.params.id;
  const company_id = req.user?.company_id;
  const { tier, visit_frequency, notes } = req.body;

  if (!company_id) {
    res.status(400);
    throw new Error("User is not associated with a company");
  }

  const record = await prisma.doctorCompanyTier.upsert({
    where: { doctor_id_company_id: { doctor_id, company_id } },
    update: {
      tier,
      visit_frequency: visit_frequency ?? null,
      notes: notes ?? null,
      classified_by: req.user.id,
    },
    create: {
      doctor_id,
      company_id,
      tier,
      visit_frequency: visit_frequency ?? null,
      notes: notes ?? null,
      classified_by: req.user.id,
    },
  });

  res.status(200).json({ success: true, data: record });
});

// GET /api/doctor/search?q=kato
export const searchDoctors = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) {
    return res.status(200).json({ success: true, data: [] });
  }
  const doctors = await prisma.doctor.findMany({
    where: {
      OR: [
        { doctor_name: { contains: q, mode: "insensitive" } },
        { town: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      doctor_name: true,
      town: true,
      location: true,
      speciality: true,
      contact: true,
    },
    orderBy: { doctor_name: "asc" },
    take: 20,
  });
  res.status(200).json({ success: true, data: doctors });
});
