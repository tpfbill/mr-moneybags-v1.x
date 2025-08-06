// src/utils/helpers.js

/**
 * Async handler to wrap async route handlers and avoid try/catch in every route
 * @param {Function} fn - The async route handler function to wrap
 * @returns {Function} Express middleware function that handles promise rejections
 */
const asyncHandler = fn => (req, res, next) => 
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Request logging middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requestLogger = (req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.path}`);
  next();
};

/**
 * Format currency value
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

/**
 * Format date to YYYY-MM-DD
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Generate a unique reference number with prefix and timestamp
 * @param {string} prefix - Prefix for the reference number
 * @returns {string} Generated reference number
 */
const generateReferenceNumber = (prefix = 'REF') => {
  const timestamp = new Date().getTime();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Safely parse JSON with error handling
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
const safeJsonParse = (str, fallback = {}) => {
  try {
    return JSON.parse(str);
  } catch (err) {
    console.error('JSON parse error:', err);
    return fallback;
  }
};

/**
 * Build dynamic query parameters for SQL queries
 * @param {Object} params - Object with parameter values
 * @returns {Object} Object with parameterized query and values array
 */
const buildQueryParams = (params) => {
  const values = [];
  const conditions = [];
  
  Object.entries(params).forEach(([key, value], index) => {
    if (value !== undefined && value !== null) {
      conditions.push(`${key} = $${index + 1}`);
      values.push(value);
    }
  });
  
  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
};

module.exports = {
  asyncHandler,
  requestLogger,
  formatCurrency,
  formatDate,
  generateReferenceNumber,
  safeJsonParse,
  buildQueryParams
};
