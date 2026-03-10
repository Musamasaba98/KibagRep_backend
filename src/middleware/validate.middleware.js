/**
 * Zod validation middleware factory.
 * Usage: router.post("/route", validate(MySchema), handler)
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: result.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
    });
  }
  req.body = result.data; // replace with coerced/parsed values
  next();
};
