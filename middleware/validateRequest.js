const { ApiError } = require("./errorHandler");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function validateField(location, field, rules, value) {
  const errors = [];
  const label = `${location}.${field}`;

  if (rules.required && isMissing(value)) {
    errors.push(`${label} is required`);
    return errors;
  }

  if (isMissing(value)) return errors;

  if (rules.type === "string" && typeof value !== "string") {
    errors.push(`${label} must be a string`);
  }

  if (rules.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${label} must be a boolean`);
  }

  if (rules.email && typeof value === "string" && !emailPattern.test(value)) {
    errors.push(`${label} must be a valid email`);
  }

  if (rules.uuid && typeof value === "string" && !uuidPattern.test(value)) {
    errors.push(`${label} must be a valid UUID`);
  }

  if (rules.minLength && String(value).length < rules.minLength) {
    errors.push(`${label} must be at least ${rules.minLength} characters`);
  }

  if (rules.maxLength && String(value).length > rules.maxLength) {
    errors.push(`${label} must be at most ${rules.maxLength} characters`);
  }

  if (rules.enum && !rules.enum.includes(value)) {
    errors.push(`${label} must be one of: ${rules.enum.join(", ")}`);
  }

  return errors;
}

function validateRequest(schema) {
  return function validate(req, res, next) {
    const errors = [];

    for (const location of ["body", "params", "query"]) {
      const fields = schema[location] || {};
      for (const [field, rules] of Object.entries(fields)) {
        errors.push(...validateField(location, field, rules, req[location][field]));
      }
    }

    if (errors.length) {
      return next(new ApiError(400, "Invalid request", errors));
    }

    return next();
  };
}

module.exports = validateRequest;
