import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const MANAGER_ROLES = ["Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"];

// GET /api/library
// Visibility rules:
//   MedicalRep / Supervisor → their team's items + company-wide (team_id IS NULL)
//   Manager and above      → all company items
export const getLibrary = asyncHandler(async (req, res) => {
  const { company_id, role, team_id } = req.user;
  const product_id = req.query.product_id || undefined;

  const isManager = MANAGER_ROLES.includes(role);

  // For reps and supervisors, filter to their team + company-wide items
  const teamFilter = isManager
    ? {}
    : {
        OR: [
          { team_id: team_id ?? "__no_match__" }, // their team
          { team_id: null },                       // company-wide
        ],
      };

  const items = await prisma.productLiterature.findMany({
    where: {
      company_id,
      is_active: true,
      ...(product_id ? { product_id } : {}),
      ...teamFilter,
    },
    include: {
      product: { select: { id: true, product_name: true } },
      team:    { select: { id: true, team_name: true } },
    },
    orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
  });

  res.status(200).json({ success: true, data: items });
});

// POST /api/library
// Supervisors → auto-scoped to their team (team_id set from req.user.team_id)
// Manager and above → company-wide (team_id stays null)
export const addLiteratureItem = asyncHandler(async (req, res) => {
  const { company_id, role, team_id: uploaderTeamId } = req.user;
  if (!company_id) { res.status(400); throw new Error("User has no company"); }

  const { title, description, file_url, file_key, file_type, file_size_kb, product_id, sort_order } = req.body;

  if (!title || !file_url || !file_key || !file_type) {
    res.status(400);
    throw new Error("title, file_url, file_key, and file_type are required");
  }

  // Supervisors scope to their team; managers and above share company-wide
  const scopedTeamId = role === "Supervisor" ? (uploaderTeamId ?? null) : null;

  const item = await prisma.productLiterature.create({
    data: {
      company_id,
      team_id:      scopedTeamId,
      title,
      description:  description ?? null,
      file_url,
      file_key,
      file_type,
      file_size_kb: file_size_kb ?? null,
      product_id:   product_id ?? null,
      sort_order:   sort_order ?? 0,
      uploaded_by:  req.user.id,
    },
    include: {
      product: { select: { id: true, product_name: true } },
      team:    { select: { id: true, team_name: true } },
    },
  });

  res.status(201).json({ success: true, data: item });
});

// DELETE /api/library/:id
export const removeLiteratureItem = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const { id } = req.params;

  const item = await prisma.productLiterature.findUnique({ where: { id } });
  if (!item) { res.status(404); throw new Error("Item not found"); }
  if (item.company_id !== company_id) { res.status(403); throw new Error("Access denied"); }

  await prisma.productLiterature.update({ where: { id }, data: { is_active: false } });
  res.status(200).json({ success: true });
});
