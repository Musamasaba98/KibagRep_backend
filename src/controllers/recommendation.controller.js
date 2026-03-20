import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

// POST /api/doctor/recommend
// Rep recommends a doctor from the master list to be added to their company's approved list.
export const recommendDoctor = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const companyId = req.user?.company_id;

  if (!companyId) {
    res.status(400);
    throw new Error("User is not associated with a company");
  }

  const { doctor_id } = req.body;
  if (!doctor_id) {
    res.status(400);
    throw new Error("doctor_id is required");
  }

  // Check the doctor exists
  const doctor = await prisma.doctor.findUnique({ where: { id: doctor_id } });
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  // Check if already on company list
  const existing = await prisma.companyDoctor.findUnique({
    where: { company_id_doctor_id: { company_id: companyId, doctor_id } },
  });
  if (existing) {
    return res.status(200).json({ success: true, message: "Doctor is already on your company list", data: existing });
  }

  // Check if a pending recommendation already exists
  const pendingRec = await prisma.doctorRecommendation.findFirst({
    where: { company_id: companyId, doctor_id, status: "PENDING" },
  });
  if (pendingRec) {
    return res.status(200).json({ success: true, message: "A pending recommendation already exists", data: pendingRec });
  }

  const recommendation = await prisma.doctorRecommendation.create({
    data: {
      company_id: companyId,
      user_id: userId,
      doctor_id,
    },
    include: { doctor: { select: { doctor_name: true, town: true, speciality: true } } },
  });

  res.status(201).json({ success: true, data: recommendation });
});

// POST /api/doctor/report-clinician
// Rep reports an unknown clinician not yet in KibagRep master list.
export const reportNewClinician = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const companyId = req.user?.company_id;

  if (!companyId) {
    res.status(400);
    throw new Error("User is not associated with a company");
  }

  const { clinician_name, clinician_cadre, clinician_location, clinician_contact } = req.body;
  if (!clinician_name) {
    res.status(400);
    throw new Error("clinician_name is required");
  }

  const recommendation = await prisma.doctorRecommendation.create({
    data: {
      company_id: companyId,
      user_id: userId,
      clinician_name,
      clinician_cadre: clinician_cadre ?? null,
      clinician_location: clinician_location ?? null,
      clinician_contact: clinician_contact ?? null,
    },
  });

  res.status(201).json({ success: true, data: recommendation });
});

// POST /api/doctor/recommendations/:id/visit
// Called when a rep logs an unplanned visit to an unknown clinician recommendation.
// Auto-flags for supervisor review at 3 visits.
export const incrementUnplannedVisit = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rec = await prisma.doctorRecommendation.findUnique({ where: { id } });
  if (!rec) {
    res.status(404);
    throw new Error("Recommendation not found");
  }

  const newCount = rec.unplanned_visit_count + 1;
  const updated = await prisma.doctorRecommendation.update({
    where: { id },
    data: { unplanned_visit_count: newCount },
  });

  res.status(200).json({ success: true, data: updated, flagged: newCount >= 3 });
});

// GET /api/doctor/recommendations
// Supervisors/Managers see PENDING recommendations for their company.
// Reps see their own submitted recommendations.
export const getRecommendations = asyncHandler(async (req, res) => {
  const companyId = req.user?.company_id;
  const userId = req.user?.id;
  const role = req.user?.role;
  const status = req.query.status ?? undefined;

  if (!companyId) {
    res.status(400);
    throw new Error("User is not associated with a company");
  }

  const isReviewer = ["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"].includes(role);

  const where = {
    company_id: companyId,
    status: status ?? "PENDING",  // default to PENDING — only show actionable items
    ...(!isReviewer ? { user_id: userId } : {}),
  };

  const recommendations = await prisma.doctorRecommendation.findMany({
    where,
    include: {
      doctor: { select: { id: true, doctor_name: true, town: true, speciality: true, cadre: true } },
      recommended_by: { select: { id: true, firstname: true, lastname: true, role: true } },
    },
    orderBy: { created_at: "desc" },
  });

  res.status(200).json({ success: true, data: recommendations });
});

// PUT /api/doctor/recommendations/:id/approve
// Supervisor/Manager approves recommendation → creates CompanyDoctor record atomically.
export const approveRecommendation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user?.id;
  const companyId = req.user?.company_id;
  const role = req.user?.role;

  if (!["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"].includes(role)) {
    res.status(403);
    throw new Error("Only supervisors or managers can approve recommendations");
  }

  const rec = await prisma.doctorRecommendation.findUnique({ where: { id } });
  if (!rec) {
    res.status(404);
    throw new Error("Recommendation not found");
  }
  if (rec.status !== "PENDING") {
    res.status(400);
    throw new Error(`Recommendation is already ${rec.status}`);
  }
  if (!rec.doctor_id) {
    res.status(400);
    throw new Error("Cannot approve a new clinician report — forward to KibagRep to add to master list first");
  }

  const [updated] = await prisma.$transaction([
    prisma.doctorRecommendation.update({
      where: { id },
      data: { status: "APPROVED", reviewed_by: reviewerId, reviewed_at: new Date() },
    }),
    prisma.companyDoctor.upsert({
      where: { company_id_doctor_id: { company_id: rec.company_id, doctor_id: rec.doctor_id } },
      update: {},
      create: { company_id: rec.company_id, doctor_id: rec.doctor_id, added_by: reviewerId },
    }),
  ]);

  res.status(200).json({ success: true, data: updated });
});

// PUT /api/doctor/recommendations/:id/reject
export const rejectRecommendation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user?.id;
  const role = req.user?.role;
  const { review_note } = req.body;

  if (!["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"].includes(role)) {
    res.status(403);
    throw new Error("Only supervisors or managers can reject recommendations");
  }

  const rec = await prisma.doctorRecommendation.findUnique({ where: { id } });
  if (!rec) {
    res.status(404);
    throw new Error("Recommendation not found");
  }
  if (rec.status !== "PENDING") {
    res.status(400);
    throw new Error(`Recommendation is already ${rec.status}`);
  }

  const updated = await prisma.doctorRecommendation.update({
    where: { id },
    data: { status: "REJECTED", reviewed_by: reviewerId, reviewed_at: new Date(), review_note: review_note ?? null },
  });

  res.status(200).json({ success: true, data: updated });
});

// PUT /api/doctor/recommendations/:id/forward
// Supervisor forwards an unknown clinician report to KibagRep to be added to master list.
export const forwardToKibag = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user?.id;
  const role = req.user?.role;

  if (!["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"].includes(role)) {
    res.status(403);
    throw new Error("Only supervisors or managers can forward recommendations");
  }

  const rec = await prisma.doctorRecommendation.findUnique({ where: { id } });
  if (!rec) {
    res.status(404);
    throw new Error("Recommendation not found");
  }
  if (rec.status !== "PENDING") {
    res.status(400);
    throw new Error(`Recommendation is already ${rec.status}`);
  }

  const updated = await prisma.doctorRecommendation.update({
    where: { id },
    data: { status: "FORWARDED_TO_KIBAG", reviewed_by: reviewerId, reviewed_at: new Date() },
  });

  res.status(200).json({ success: true, data: updated });
});
