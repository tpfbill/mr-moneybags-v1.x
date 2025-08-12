// src/routes/check-printing-main.js
const express = require('express');
const router = express.Router();

// Import modular route files
const checkPrintingCoreRoutes = require('./check-printing-core');
const checkPrintingWorkflowRoutes = require('./check-printing-workflow');
const checkPrintingValidationRoutes = require('./check-printing-validation');

// Mount all route modules to the main router
// Core routes (CRUD operations)
router.use('/', checkPrintingCoreRoutes);

// Workflow routes (print/void/clear operations)
router.use('/', checkPrintingWorkflowRoutes);

// Validation routes (number validation, search, reports)
router.use('/', checkPrintingValidationRoutes);

// Export the combined router
module.exports = router;
