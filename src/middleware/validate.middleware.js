/**
 * Zod validation middleware factory.
 * Usage: router.post("/route", validate(MySchema), handler)
 */
// Zod v4 uses .issues; v3 used .errors — support both
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issues = result.error.issues ?? result.error.errors ?? [];
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: issues.map((e) => ({ field: e.path.join(".") || "body", message: e.message })),
    });
  }
  req.body = result.data;
  next();
};
