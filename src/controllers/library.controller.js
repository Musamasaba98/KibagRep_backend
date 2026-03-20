import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// GET /api/library — list all literature for the rep's company
export const getLibrary = asyncHandler(async (req, res) => {
  const company_id = req.user.company_id;
  const product_id = req.query.product_id || undefined;

  const items = await prisma.productLiterature.findMany({
    where: {
      company_id,
      is_active: true,
      ...(product_id ? { product_id } : {}),
    },
    include: {
      product: { select: { id: true, product_name: true } },
    },
    orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
  });

  res.status(200).json({ success: true, data: items });
});

// POST /api/library — upload a literature item (SalesAdmin / Manager)
export const addLiteratureItem = asyncHandler(async (req, res) => {
  const company_id = req.user.company_id;
  if (!company_id) { res.status(400); throw new Error("User has no company"); }

  const { title, description, file_url, file_key, file_type, file_size_kb, product_id, sort_order } = req.body;

  if (!title || !file_url || !file_key || !file_type) {
    res.status(400);
    throw new Error("title, file_url, file_key, and file_type are required");
  }

  const item = await prisma.productLiterature.create({
    data: {
      company_id,
      title,
      description: description ?? null,
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
    },
  });

  res.status(201).json({ success: true, data: item });
});

// DELETE /api/library/:id — deactivate (soft delete) a literature item
export const removeLiteratureItem = asyncHandler(async (req, res) => {
  const company_id = req.user.company_id;
  const { id } = req.params;

  const item = await prisma.productLiterature.findUnique({ where: { id } });
  if (!item) { res.status(404); throw new Error("Item not found"); }
  if (item.company_id !== company_id) { res.status(403); throw new Error("Access denied"); }

  await prisma.productLiterature.update({ where: { id }, data: { is_active: false } });
  res.status(200).json({ success: true });
});
