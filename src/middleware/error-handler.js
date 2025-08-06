// src/middleware/error-handler.js

/**
 * Custom error class for API errors with status code and optional details
 */
class ApiError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error types with factory methods
 */
const ErrorTypes = {
  ValidationError: (message, details) => new ApiError(message || 'Validation Error', 400, details),
  AuthenticationError: (message) => new ApiError(message || 'Authentication Required', 401),
  AuthorizationError: (message) => new ApiError(message || 'Permission Denied', 403),
  NotFoundError: (message) => new ApiError(message || 'Resource Not Found', 404),
  ConflictError: (message) => new ApiError(message || 'Resource Conflict', 409),
  DatabaseError: (message) => new ApiError(message || 'Database Error', 500),
  ServerError: (message) => new ApiError(message || 'Internal Server Error', 500)
};

/**
 * Map common database error codes to user-friendly errors
 * @param {Error} err - The database error
 * @returns {ApiError} Mapped API error
 */
const mapDatabaseError = (err) => {
  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  const pgErrorMap = {
    '23505': ErrorTypes.ConflictError('Duplicate entry. This record already exists.'),
    '23503': ErrorTypes.ValidationError('Referenced record does not exist or cannot be modified.'),
    '23502': ErrorTypes.ValidationError('Required field is missing or empty.'),
    '22P02': ErrorTypes.ValidationError('Invalid data format or type.'),
    '42P01': ErrorTypes.ServerError('Database table not found. Please contact support.'),
    '42703': ErrorTypes.ServerError('Database column not found. Please contact support.')
  };

  // Check if this is a PostgreSQL error with a code we recognize
  if (err.code && pgErrorMap[err.code]) {
    return pgErrorMap[err.code];
  }

  // Generic database error
  return ErrorTypes.DatabaseError(
    process.env.NODE_ENV === 'production' 
      ? 'A database error occurred. Please try again later.'
      : err.message
  );
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // If headers already sent, let Express default error handler deal with it
  if (res.headersSent) {
    return next(err);
  }

  let error = err;

  // Map known error types
  if (err.name === 'SyntaxError' && err.status === 400) {
    // JSON parse error
    error = ErrorTypes.ValidationError('Invalid JSON format');
  } else if (err.name === 'UnauthorizedError') {
    // JWT authentication error
    error = ErrorTypes.AuthenticationError(err.message);
  } else if (err.code && /^[0-9]{5}$/.test(err.code)) {
    // Likely a PostgreSQL error
    error = mapDatabaseError(err);
  } else if (!(err instanceof ApiError)) {
    // Unknown error, create a generic server error
    error = ErrorTypes.ServerError(
      process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred'
        : err.message
    );
  }

  // Log the error (with different levels based on severity)
  if (error.statusCode >= 500) {
    console.error('Server Error:', error);
    console.error(err.stack);
  } else if (error.statusCode >= 400) {
    console.warn('Client Error:', {
      message: error.message,
      path: req.path,
      method: req.method,
      statusCode: error.statusCode,
      details: error.details || undefined
    });
  }

  // Build the response
  const response = {
    success: false,
    error: {
      message: error.message,
      status: error.statusCode,
      code: error.name.replace('Error', '')
    }
  };

  // Include error details in development or if explicitly provided
  if (process.env.NODE_ENV !== 'production' || error.details) {
    response.error.details = error.details || undefined;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
  }

  // Send the response
  res.status(error.statusCode).json(response);
};

module.exports = {
  errorHandler,
  ApiError,
  ErrorTypes
};
