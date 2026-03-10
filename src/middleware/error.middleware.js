/**
 * Global error handler — add as last middleware in app.js.
 * Catches anything passed to next(err) or thrown in async handlers.
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

/**
 * 404 handler — add before errorHandler in app.js.
 */
export const notFound = (req, res, next) => {
  const err = new Error(`Not found: ${req.originalUrl}`);
  res.status(404);
  next(err);
};
