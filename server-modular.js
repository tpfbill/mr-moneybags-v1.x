// server-modular.js
require('dotenv').config(); // Load environment variables before anything else

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import database connection
const { pool, testConnection } = require('./src/database/connection');

// Import middleware
const { errorHandler } = require('./src/middleware/error-handler');
const { requestLogger } = require('./src/utils/helpers');

// Import route modules
const vendorsRoutes = require('./src/routes/vendors');
const entitiesRoutes = require('./src/routes/entities');
const accountsRoutes = require('./src/routes/accounts');
const fundsRoutes = require('./src/routes/funds');
const nachaSettingsRoutes = require('./src/routes/nacha-settings');
const nachaFilesRoutes   = require('./src/routes/nacha-files');
const paymentBatchesRoutes = require('./src/routes/payment-batches');
const journalEntriesRoutes = require('./src/routes/journal-entries');
const bankAccountsRoutes   = require('./src/routes/bank-accounts');
const usersRoutes          = require('./src/routes/users');
const reportsRoutes        = require('./src/routes/reports');
const importRoutes         = require('./src/routes/import');

// Import inter-entity transfer helper
const registerInterEntityTransferRoutes = require('./src/js/inter-entity-transfer-api');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large data uploads
app.use(requestLogger); // Log all requests

// Register API routes
// Core master-data first
app.use('/api/entities', entitiesRoutes);
app.use('/api/funds', fundsRoutes);
app.use('/api/accounts', accountsRoutes);

// Configuration & processing
app.use('/api/nacha-settings', nachaSettingsRoutes);
app.use('/api/nacha-files',    nachaFilesRoutes);
app.use('/api/payment-batches', paymentBatchesRoutes);

console.log('Route registered: /api/nacha-files');

app.use('/api/vendors', vendorsRoutes);

// Financial transactions & balances
app.use('/api/journal-entries', journalEntriesRoutes);
app.use('/api/bank-accounts', bankAccountsRoutes);

// User management
app.use('/api/users', usersRoutes);

// Reporting & data import
app.use('/api/reports', reportsRoutes);
app.use('/api/import', importRoutes);

// Health Check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server running', 
    version: '9.0.0',
    timestamp: new Date().toISOString()
  });
});

// Register inter-entity transfer routes
registerInterEntityTransferRoutes(app, pool);

// All primary route modules have been extracted and registered.
// Remaining future work: documents upload & other ancillary utilities.

// Register error handling middleware (AFTER routes)
app.use(errorHandler);

// Serve static files (LAST to avoid intercepting API routes)
app.use(express.static(path.join(__dirname)));

// Start the server
const startServer = async () => {
  try {
    // Test database connection before starting server
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('Failed to connect to database. Server will not start.');
      process.exit(1);
    }
    
    // Start the server if database connection is successful
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT} (bound to 0.0.0.0)`);
      console.log(`Local  : http://localhost:${PORT}`);
      console.log(`Remote : http://<this-host-IP-or-Tailscale-hostname>:${PORT}`);
      console.log('Server is ready to accept connections');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
