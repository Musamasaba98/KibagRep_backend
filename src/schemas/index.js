import { z } from "zod";

const password = z.string().min(6, "Password must be at least 6 characters").max(128);
const phone    = z.string().regex(/^\+?[0-9]{9,15}$/, "Invalid phone number").optional();

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email:    z.string().email("Invalid email").toLowerCase().trim(),
  password: z.string().min(1, "Password is required").max(128),
});

export const SignupSchema = z.object({
  username:            z.string().min(3).max(50).trim(),
  firstname:           z.string().min(1).max(100).trim(),
  lastname:            z.string().min(1).max(100).trim(),
  email:               z.string().email().toLowerCase().trim(),
  password,
  role:                z.string().min(1),
  contact:             phone,
  gender:              z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  company_id:          z.string().uuid().optional(),
  must_reset_password: z.boolean().optional().default(false),
});

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password:     password,
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email").toLowerCase().trim(),
});

export const ResetPasswordSchema = z.object({
  token:        z.string().min(1, "Token is required"),
  new_password: password,
});

export const AdminResetPasswordSchema = z.object({
  userId:       z.string().uuid("Invalid userId"),
  new_password: password,
});

// ─── User / Company membership ────────────────────────────────────────────────
export const AddUserToCompanySchema = z.object({
  userId:     z.string().uuid("Invalid userId"),
  role:       z.string().min(1, "Role is required"),
  team_id:    z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
});

export const UpdateMyProfileSchema = z.object({
  firstname: z.string().min(1).max(100).trim().optional(),
  lastname:  z.string().min(1).max(100).trim().optional(),
  contact:   phone,
});

// ─── Company ──────────────────────────────────────────────────────────────────
export const CreateCompanySchema = z.object({
  company_name: z.string().min(2, "Company name required").max(200).trim(),
  location:     z.string().min(2, "Location required").max(300).trim(),
  latitude:     z.number().min(-90).max(90).optional(),
  longitude:    z.number().min(-180).max(180).optional(),
});

// ─── Tour Plan ────────────────────────────────────────────────────────────────
export const AddTourPlanEntrySchema = z.object({
  entry_type:  z.enum(["DOCTOR", "PHARMACY", "FACILITY", "OTHER"]),
  entity_id:   z.string().uuid().optional(),
  entity_name: z.string().max(200).optional(),
  notes:       z.string().max(500).optional(),
  slot:        z.enum(["MORNING", "AFTERNOON", "EVENING"]).optional(),
});

export const UpdateTourPlanDaySchema = z.object({
  day_number:      z.number().int().min(1).max(31),
  morning_area:    z.string().max(200).nullable().optional(),
  evening_area:    z.string().max(200).nullable().optional(),
  notes:           z.string().max(500).nullable().optional(),
  day_type:        z.enum([
    "FIELD","SUNDAY","PUBLIC_HOLIDAY","SATURDAY_HALF","SATURDAY_OFF",
    "SATURDAY_MEETING","LEAVE_FULL","LEAVE_HALF_AM","LEAVE_HALF_PM",
    "OFFICE_DAY","FIELD_CANCELLED"
  ]).optional(),
  daily_allowance: z.number().min(0).optional(),
  transport:       z.number().min(0).optional(),
  airtime:         z.number().min(0).optional(),
  accommodation:   z.number().min(0).optional(),
  other_costs:     z.number().min(0).optional(),
});

export const CompanySettingsSchema = z.object({
  saturday_default: z.enum(["OFF","HALF_DAY","FULL_DAY","MEETING"]),
});

// ─── Pharmacy Activity ────────────────────────────────────────────────────────
export const CreatePharmacyActivitySchema = z.object({
  pharmacy_id:        z.string().uuid("pharmacy_id must be a valid UUID"),
  focused_product_id: z.string().uuid().optional(),
  products_detailed:  z.array(z.string().uuid()).optional().default([]),
  stock_noted:        z.number().int().min(0).optional(),
  orders_taken:       z.number().int().min(0).optional(),
  notes:              z.string().max(2000).optional(),
  gps_lat:            z.number().min(-90).max(90).nullable().optional(),
  gps_lng:            z.number().min(-180).max(180).nullable().optional(),
});

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
  report_id: z.string().uuid().optional(),
  report_date: z.string().optional(),
  summary: z.string().max(5000).optional(),
  jfw_observer_id: z.string().optional(),
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

// ─── Missed Visit ─────────────────────────────────────────────────────────────
export const LogMissedSchema = z.object({
  doctor_id:    z.string().uuid("doctor_id must be a valid UUID"),
  visit_status: z.enum(["MISSED", "RESCHEDULED", "SKIPPED"]),
  miss_reason:  z.string().max(500).optional(),
  gps_lat:      z.number().min(-90).max(90).nullable().optional(),
  gps_lng:      z.number().min(-180).max(180).nullable().optional(),
});

// ─── Pre-call Note ────────────────────────────────────────────────────────────
export const PrecallNoteSchema = z.object({
  precall_note: z.string().max(1000).nullable().optional(),
});

// ─── Competitor Intelligence ──────────────────────────────────────────────────
export const LogCompetitorSchema = z.object({
  competitor_company:  z.string().min(1).max(200),
  competitor_brand:    z.string().min(1).max(200),
  competitor_sku:      z.string().max(200).optional(),
  is_listed:           z.boolean().optional().default(false),
  price_to_trade:      z.number().positive().optional(),
  price_to_consumer:   z.number().positive().optional(),
  stock_quantity:      z.number().int().min(0).optional(),
  notes:               z.string().max(2000).optional(),
  doctor_id:           z.string().uuid().optional(),
  pharmacy_id:         z.string().uuid().optional(),
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
