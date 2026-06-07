const logger = require("../utils/logger");

class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const payload = {
    error: statusCode >= 500 ? "Internal server error" : err.message,
  };

  if (err.details) {
    payload.details = err.details;
  }

  logger.error("Request failed", {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: err.message,
  });

  res.status(statusCode).json(payload);
}

module.exports = { ApiError, notFoundHandler, errorHandler };
