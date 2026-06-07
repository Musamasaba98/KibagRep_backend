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
export const deleteDoctor = deleteOne("doctor");

// GET /api/doctor/:id — full doctor record including linked facilities
export const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: {
      work_facilities: {
        include: {
          facility: {
            select: { id: true, name: true, location: true, town: true, facility_type: true, latitude: true, longitude: true },
          },
        },
        orderBy: { is_primary: "desc" },
      },
    },
  });
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  res.json({ success: true, data: doctor });
});

// PUT /api/doctor/:id — update scalar fields only (no relation handling)
export const updateDoctor = asyncHandler(async (req, res) => {
  const { doctor_name, speciality, cadre, location, town, contact,
          license_number, prescribing_level, gps_lat, gps_lng } = req.body;

  const updated = await prisma.doctor.update({
    where: { id: req.params.id },
    data: {
      ...(doctor_name       !== undefined && { doctor_name }),
      ...(speciality        !== undefined && { speciality }),
      ...(cadre             !== undefined && { cadre }),
      ...(location          !== undefined && { location }),
      ...(town              !== undefined && { town }),
      ...(contact           !== undefined && { contact }),
      ...(license_number    !== undefined && { license_number }),
      ...(prescribing_level !== undefined && { prescribing_level }),
      ...(gps_lat           !== undefined && { gps_lat: gps_lat === null ? null : parseFloat(gps_lat) }),
      ...(gps_lng           !== undefined && { gps_lng: gps_lng === null ? null : parseFloat(gps_lng) }),
    },
    include: {
      work_facilities: {
        include: { facility: { select: { id: true, name: true, town: true } } },
      },
    },
  });
  res.json({ success: true, data: updated });
});

// POST /api/doctor/:id/facilities — link a facility to this doctor
export const addDoctorFacility = asyncHandler(async (req, res) => {
  const { facility_id, is_primary = false } = req.body;
  const doctor_id = req.params.id;

  if (!facility_id) { res.status(400); throw new Error("facility_id is required"); }

  // If setting as primary, unset any existing primary first
  if (is_primary) {
    await prisma.doctorFacility.updateMany({
      where: { doctor_id },
      data: { is_primary: false },
    });
  }

  const link = await prisma.doctorFacility.upsert({
    where: { doctor_id_facility_id: { doctor_id, facility_id } },
    update: { is_primary },
    create: { doctor_id, facility_id, is_primary },
    include: { facility: { select: { id: true, name: true, location: true, town: true, latitude: true, longitude: true } } },
  });

  res.status(201).json({ success: true, data: link });
});

// PUT /api/doctor/:id/facilities/:facilityId — set/unset primary
export const setFacilityPrimary = asyncHandler(async (req, res) => {
  const { id: doctor_id, facilityId: facility_id } = req.params;
  const { is_primary } = req.body;

  if (is_primary) {
    await prisma.doctorFacility.updateMany({
      where: { doctor_id },
      data: { is_primary: false },
    });
  }

  const updated = await prisma.doctorFacility.update({
    where: { doctor_id_facility_id: { doctor_id, facility_id } },
    data: { is_primary },
    include: { facility: { select: { id: true, name: true, location: true, town: true } } },
  });

  res.json({ success: true, data: updated });
});

// DELETE /api/doctor/:id/facilities/:facilityId — unlink a facility from this doctor
export const removeDoctorFacility = asyncHandler(async (req, res) => {
  const { id: doctor_id, facilityId: facility_id } = req.params;
  await prisma.doctorFacility.delete({
    where: { doctor_id_facility_id: { doctor_id, facility_id } },
  });
  res.json({ success: true });
});

// GET /api/doctor — doctor list
// ?scope=company (default) → only doctors approved for the user's company
// ?scope=all              → full KibagRep master list (for reps to recommend from)
// ?q=search              → filter by name / town / location
// ?page=1&limit=25       → pagination
export const getAllDoctor = asyncHandler(async (req, res) => {
  const companyId = req.user?.company_id ?? null;
  const scope = req.query.scope ?? "company";
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 25), 100);
  const skip = (page - 1) * limit;
  const q = (req.query.q || "").trim();

  const nameFilter = q.length >= 1
    ? { OR: [
        { doctor_name: { contains: q, mode: "insensitive" } },
        { town: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
      ]}
    : {};

  if (scope === "company" && companyId) {
    const where = {
      company_id: companyId,
      ...(q.length >= 1 ? { doctor: nameFilter } : {}),
    };

    const [companyDoctors, total] = await Promise.all([
      prisma.companyDoctor.findMany({
        where,
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
        skip,
        take: limit,
      }),
      prisma.companyDoctor.count({ where }),
    ]);

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

    return res.status(200).json({
      success: true,
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }

  // scope=all — full master directory, with company membership flag
  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where: nameFilter,
      include: companyId
        ? {
            company_tiers: { where: { company_id: companyId }, select: { tier: true, visit_frequency: true, notes: true } },
            company_doctors: { where: { company_id: companyId }, select: { company_id: true } },
          }
        : undefined,
      orderBy: { doctor_name: "asc" },
      skip,
      take: limit,
    }),
    prisma.doctor.count({ where: nameFilter }),
  ]);

  const data = doctors.map(({ company_tiers, company_doctors, ...rest }) => ({
    ...rest,
    company_tier: company_tiers?.length ? company_tiers[0] : null,
    on_company_list: !!(company_doctors?.length),
  }));

  res.status(200).json({
    success: true,
    data,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
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

// ─── POST /api/doctor/bulk-edit ───────────────────────────────────────────────
// SUPER_ADMIN: update one or more fields across a list of doctor IDs
export const bulkEditDoctors = asyncHandler(async (req, res) => {
  const { ids, fields } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400); throw new Error("ids must be a non-empty array");
  }
  if (!fields || typeof fields !== "object" || Object.keys(fields).length === 0) {
    res.status(400); throw new Error("fields must be a non-empty object");
  }
  const allowed = ["cadre", "speciality", "town", "location", "prescribing_level", "contact"];
  const data = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) data[key] = fields[key];
  }
  if (Object.keys(data).length === 0) {
    res.status(400); throw new Error("No updatable fields provided");
  }
  const result = await prisma.doctor.updateMany({ where: { id: { in: ids } }, data });
  res.json({ success: true, updated: result.count });
});

// ─── POST /api/doctor/bulk-upload ────────────────────────────────────────────
// SUPER_ADMIN: parse uploaded Excel, upsert doctors.
// Match key: license_number (if present) → update; else create new.
export const bulkUploadDoctors = asyncHandler(async (req, res) => {
  if (!req.file) { res.status(400); throw new Error("No file uploaded"); }

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const ws = wb.worksheets[0];
  if (!ws) { res.status(400); throw new Error("No worksheet found in file"); }

  // Read header row → map column names to indices
  const headers = {};
  ws.getRow(1).eachCell((cell, col) => {
    headers[cell.value?.toString().trim().toLowerCase().replace(/\s+/g, "_")] = col;
  });

  const REQUIRED = ["doctor_name"];
  for (const h of REQUIRED) {
    if (!headers[h]) { res.status(400); throw new Error(`Missing required column: ${h}`); }
  }

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const get = (col) => { const v = row.getCell(col)?.value; return v != null ? String(v).trim() : null; };
    const name = get(headers["doctor_name"]);
    if (!name) return; // skip blank rows
    rows.push({
      doctor_name:       name,
      cadre:             get(headers["cadre"]) ?? "Doctor",
      speciality:        get(headers["speciality"]) ? get(headers["speciality"]).split(",").map(s => s.trim()) : [],
      location:          get(headers["location"]) ?? "",
      town:              get(headers["town"]) ?? "",
      contact:           get(headers["contact"]),
      license_number:    get(headers["license_number"]),
      prescribing_level: get(headers["prescribing_level"]),
      gps_lat:           get(headers["gps_lat"]) ? parseFloat(get(headers["gps_lat"])) : null,
      gps_lng:           get(headers["gps_lng"]) ? parseFloat(get(headers["gps_lng"])) : null,
    });
  });

  if (rows.length === 0) { res.status(400); throw new Error("No data rows found in file"); }

  let created = 0, updated = 0, errors = [];

  for (const row of rows) {
    try {
      // Try to find existing by license_number, then by exact name match
      let existing = null;
      if (row.license_number) {
        existing = await prisma.doctor.findFirst({ where: { license_number: row.license_number } });
      }
      if (!existing) {
        existing = await prisma.doctor.findFirst({
          where: { doctor_name: { equals: row.doctor_name, mode: "insensitive" } },
        });
      }
      if (existing) {
        await prisma.doctor.update({ where: { id: existing.id }, data: row });
        updated++;
      } else {
        await prisma.doctor.create({ data: row });
        created++;
      }
    } catch (e) {
      errors.push({ row: row.doctor_name, error: e.message });
    }
  }

  res.json({ success: true, created, updated, errors, total: rows.length });
});

// ─── GET /api/doctor/bulk-upload/template ────────────────────────────────────
// Returns an Excel template file the admin can fill in
export const downloadUploadTemplate = asyncHandler(async (req, res) => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Doctors");

  const cols = [
    { header: "doctor_name", key: "doctor_name", width: 30 },
    { header: "cadre",       key: "cadre",       width: 15, note: "Doctor|Nurse|Midwife|Clinician|Pharmacist|Other" },
    { header: "speciality",  key: "speciality",  width: 25, note: "Comma-separated e.g. Cardiology,Internal Medicine" },
    { header: "location",    key: "location",    width: 20 },
    { header: "town",        key: "town",        width: 18 },
    { header: "contact",     key: "contact",     width: 15 },
    { header: "license_number",    key: "license_number",    width: 18 },
    { header: "prescribing_level", key: "prescribing_level", width: 22 },
    { header: "gps_lat",    key: "gps_lat",    width: 14 },
    { header: "gps_lng",    key: "gps_lng",    width: 14 },
  ];

  ws.columns = cols;

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16a34a" } };
  headerRow.alignment = { horizontal: "center" };

  // Sample rows
  ws.addRow(["Dr. Example Name", "Doctor", "Internal Medicine", "Mulago Hill", "Kampala", "0700000000", "LIC001", "CONSULTANT", "0.3476", "32.5825"]);
  ws.addRow(["Nurse Example", "Nurse", "", "Kawempe", "Kampala", "0711000000", "", "", "", ""]);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="doctors_upload_template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// POST /api/doctor/:id/company-list — admin/manager directly adds doctor to company list
export const addToCompanyList = asyncHandler(async (req, res) => {
  const doctor_id  = req.params.id;
  const company_id = req.user?.company_id;
  if (!company_id) { res.status(400); throw new Error("User is not associated with a company"); }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctor_id }, select: { id: true, doctor_name: true } });
  if (!doctor) { res.status(404); throw new Error("Doctor not found"); }

  await prisma.companyDoctor.upsert({
    where:  { company_id_doctor_id: { company_id, doctor_id } },
    create: { company_id, doctor_id, added_by: req.user.id },
    update: {},
  });

  res.status(201).json({ success: true, data: { company_id, doctor_id } });
});

// DELETE /api/doctor/:id/company-list — admin/manager removes doctor from company list
export const removeFromCompanyList = asyncHandler(async (req, res) => {
  const doctor_id  = req.params.id;
  const company_id = req.user?.company_id;
  if (!company_id) { res.status(400); throw new Error("User is not associated with a company"); }

  const existing = await prisma.companyDoctor.findUnique({
    where: { company_id_doctor_id: { company_id, doctor_id } },
  });
  if (!existing) { res.status(404); throw new Error("Doctor not on company list"); }

  await prisma.companyDoctor.delete({ where: { company_id_doctor_id: { company_id, doctor_id } } });

  res.json({ success: true });
});
