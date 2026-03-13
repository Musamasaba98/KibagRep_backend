import {
  createOne,
  deleteOne,
  getAll,
  getOne,
  updateOne,
} from "./factory.controller.js";
import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

export const createProduct = asyncHandler(async (req, res) => {
  const { product_name, company } = req.body;
  try {
    const item = await prisma.product.create({
      data: {
        product_name,
        company: {
          connect: {
            id: company,
          },
        },
      },
    });
    if (!item) {
      return next(new Error(`The facility has failed to create.`));
    }
    res.status(201).send({ status: "success", data: item });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
});
export const getProduct = getOne("product");
export const getAllProduct = getAll("product");
export const deleteProduct = deleteOne("product");
export const updateProduct = updateOne("product");

// GET /api/product/company — get products for current user's company
export const getCompanyProducts = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: 'Not linked to a company' });
  const products = await prisma.product.findMany({
    where: { company_id: companyId },
    select: { id: true, product_name: true, classification: true, generic_name: true },
    orderBy: { product_name: 'asc' },
  });
  res.json({ success: true, data: products });
});

// POST /api/product/company — create product for current user's company
export const createCompanyProduct = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: 'Not linked to a company' });
  const { product_name, classification, generic_name } = req.body;
  if (!product_name) { res.status(400); throw new Error('product_name is required'); }
  const product = await prisma.product.create({
    data: { product_name, company_id: companyId, ...(classification && { classification }), ...(generic_name && { generic_name }) },
  });
  res.status(201).json({ success: true, data: product });
});
