// server-modular.js
require('dotenv').config(); // Load environment variables before anything else

const express = require('express');
const cors = require('cors');
const path = require('path');

// Session & authentication
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

// Import database connection
const {
  pool,
  testConnection,
  checkSchemaVersion
} = require('./src/database/connection');

// Import middleware
const { errorHandler } = require('./src/middleware/error-handler');
const { requestLogger } = require('./src/utils/helpers');
const { getCurrentUser, requireAuth } = require('./src/middleware/auth');

// Import route modules
const authRoutes          = require('./src/routes/auth');
const vendorsRoutes = require('./src/routes/vendors');
const entitiesRoutes = require('./src/routes/entities');
const accountsRoutes = require('./src/routes/accounts');
const fundsRoutes = require('./src/routes/funds');
const nachaSettingsRoutes = require('./src/routes/nacha-settings');
const nachaFilesRoutes   = require('./src/routes/nacha-files');
const paymentBatchesRoutes = require('./src/routes/payment-batches');
const journalEntriesRoutes = require('./src/routes/journal-entries');
const bankAccountsRoutes   = require('./src/routes/bank-accounts');
const bankDepositsRoutes   = require('./src/routes/bank-deposits'); // NEW
const checkPrintingRoutes  = require('./src/routes/check-printing'); // NEW
const checkFormatsRoutes   = require('./src/routes/check-formats'); // NEW
const usersRoutes          = require('./src/routes/users');
const reportsRoutes        = require('./src/routes/reports');
const importRoutes         = require('./src/routes/import');
const glCodesRoutes        = require('./src/routes/gl-codes'); // NEW
const paymentsImportRoutes = require('./src/routes/payments-import'); // NEW

// Import inter-entity transfer helper
const registerInterEntityTransferRoutes = require('./src/js/inter-entity-transfer-api');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Global process error handlers (keep server alive in development)
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});



// ---------------------------------------------------------------------------
// Trust proxy (needed for secure cookies & proper client IP detection when
// running behind Nginx / load-balancer in production)
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  // Behind a TLS-terminating reverse-proxy
  app.set('trust proxy', 1);
}

// Configure middleware
// ---------------------------------------------------------------------------
// CORS configuration
// ---------------------------------------------------------------------------
// Front-end runs on port 8080 while the API runs on port 3000, so we must
// allow cross-origin requests *with credentials*.  Wildcard origins ("*")
// cannot be used when `credentials: true`, therefore we explicitly list
// the development origins we expect OR compute them dynamically.

const extraOrigins =
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

function corsOriginCallback(origin, cb) {
  // Same-origin or server-to-server (no Origin header)
  if (!origin) return cb(null, true);

  // Auto-allow localhost / 127.0.0.1 / any-IP on ports 8080 & 8081
  try {
    const { hostname, port, protocol } = new URL(origin);
    const devPorts = ['8080', '8081'];
    // 1) Explicit dev ports (8080/8081)        → allow
    // 2) Same-origin requests that hit the API
    //    port itself (usually 3000 unless overridden) → allow
    const apiPort = String(PORT); // ensure string comparison

    if (
      (devPorts.includes(port) && ['http:', 'https:'].includes(protocol)) ||
      (port === apiPort && ['http:', 'https:'].includes(protocol))
    ) {
      return cb(null, true);
    }
  } catch {
    // Malformed Origin header – reject
  }

  // Explicitly allowed via env
  if (extraOrigins.includes(origin)) {
    return cb(null, true);
  }

  return cb(new Error(`CORS: origin ${origin} not allowed`), false);
}

app.use(
  cors({
    origin: corsOriginCallback,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'] // allow file downloads, etc.
  })
);

app.use(express.json({ limit: '50mb' })); // Increase limit for large data uploads
app.use(requestLogger); // Log all requests

// ---------------------------------------------------------------------------
// Session configuration (24-hour expiry, PostgreSQL store)
// ---------------------------------------------------------------------------
app.use(
  session({
    store: new PgSession({
      pool,                         // Re-use existing PG pool
      tableName: 'user_sessions',   // Session table
      createTableIfMissing: true,   // Auto-create table
      pruneSessionInterval: 60 * 60 // Cleanup every hour
    }),
    name: 'mmb.sid',
    secret: process.env.SESSION_SECRET || 'ChangeMeInProduction',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax',
      // In development we serve the site over plain HTTP, therefore the
      // session cookie MUST NOT be marked secure or the browser will
      // refuse to send it back.  Force secure=false here; for production
      // deployments, override by setting NODE_ENV=production and using a
      // reverse-proxy/HTTPS terminator in front of Node.
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// Attach current user (if any) to every request
app.use(getCurrentUser);

// Register API routes
// ---------------------------------------------------------------------------
// Public routes (no auth required)
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);

// ---------------------------------------------------------------------------
// Protected API routes (require authentication)
// ---------------------------------------------------------------------------
// Core master-data first
app.use('/api/entities', requireAuth, entitiesRoutes);
app.use('/api/funds',    requireAuth, fundsRoutes);
app.use('/api/accounts', requireAuth, accountsRoutes);
// GL Codes – core reference table
app.use('/api/gl-codes', requireAuth, glCodesRoutes);

// Configuration & processing
app.use('/api/nacha-settings', requireAuth, nachaSettingsRoutes);
app.use('/api/nacha-files',    requireAuth, nachaFilesRoutes);

app.use('/api/vendors', requireAuth, vendorsRoutes);

// Financial transactions & balances
app.use('/api/journal-entries', requireAuth, journalEntriesRoutes);
app.use('/api/payment-batches', requireAuth, paymentBatchesRoutes);
app.use('/api/bank-accounts',   requireAuth, bankAccountsRoutes);
app.use('/api/bank-deposits',   requireAuth, bankDepositsRoutes); // NEW
app.use('/api/checks',          requireAuth, checkPrintingRoutes); // NEW
// Separate check formats endpoints to avoid UUID route conflicts
app.use('/api/check-formats',   requireAuth, checkFormatsRoutes); // NEW

// User management
app.use('/api/users', requireAuth, usersRoutes);

// Reporting & data import
app.use('/api/reports', requireAuth, reportsRoutes);
app.use('/api/import',  requireAuth, importRoutes);
// Unified Vendor Payments import (analyze/process/status)
app.use('/api/vendor-payments/import', requireAuth, paymentsImportRoutes);
// (Temporary ping removed)

// Bank reconciliation routes
app.use(
  '/api/bank-reconciliation',
  requireAuth,
  require('./src/routes/bank-reconciliation')
);

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
    // Ensure database schema version matches application requirements
    await checkSchemaVersion();
    
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
