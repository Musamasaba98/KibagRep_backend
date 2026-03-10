import { z } from "zod";

// ─── Doctor Activity (Visit Log) ──────────────────────────────────────────────
export const CreateActivitySchema = z.object({
  doctor_id: z.string().uuid("doctor_id must be a valid UUID"),
  focused_product_id: z.string().uuid("focused_product_id must be a valid UUID"),
  products_detailed: z.array(z.string().uuid()).optional().default([]),
  samples_given: z.number().int().min(0).optional().default(0),
  outcome: z.string().max(2000).optional(),
  gps_lat: z.number().min(-90).max(90).nullable().optional(),
  gps_lng: z.number().min(-180).max(180).nullable().optional(),
});

// ─── Daily Report ─────────────────────────────────────────────────────────────
export const SubmitReportSchema = z.object({
  summary: z.string().max(5000).optional(),
});

export const RejectReportSchema = z.object({
  note: z.string().min(1, "Rejection note is required").max(1000),
});

// ─── Call Cycle ───────────────────────────────────────────────────────────────
export const AddCycleItemSchema = z.object({
  doctor_id: z.string().uuid("doctor_id must be a valid UUID"),
  tier: z.enum(["A", "B", "C"]).optional().default("B"),
  frequency: z.number().int().min(1).max(31).optional(),
});

export const RejectCycleSchema = z.object({
  note: z.string().max(1000).optional(),
});

// ─── Expense Claims ────────────────────────────────────────────────────────
export const CreateClaimSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM").optional(),
});

export const AddExpenseItemSchema = z.object({
  category: z.enum(["TRANSPORT", "ACCOMMODATION", "MEALS", "PROMO_ITEMS", "OTHER"]),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  date: z.string().datetime({ offset: true }).or(z.string().date()),
});

export const RejectClaimSchema = z.object({
  note: z.string().max(1000).optional(),
});

// ─── Doctor Tier Classification ───────────────────────────────────────────────
export const SetDoctorTierSchema = z.object({
  tier:            z.enum(["A", "B", "C"]),
  visit_frequency: z.number().int().min(1).max(31).optional(),
  notes:           z.string().max(500).optional(),
});

// ─── NCA (No Customer Activity) ───────────────────────────────────────────────
export const LogNcaSchema = z.object({
  doctor_id:          z.string().uuid("doctor_id must be a valid UUID"),
  focused_product_id: z.string().uuid("focused_product_id must be a valid UUID"),
  nca_reason:         z.string().min(1, "NCA reason is required").max(500),
  gps_lat:            z.number().min(-90).max(90).nullable().optional(),
  gps_lng:            z.number().min(-180).max(180).nullable().optional(),
});
