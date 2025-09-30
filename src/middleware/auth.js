// src/middleware/auth.js
const { pool } = require('../database/connection');

/**
 * Helper function to get user by ID
 * @param {string} userId - User ID to look up
 * @returns {Object|null} User object or null if not found
 */
async function getUserById(userId) {
    try {
        const result = await pool.query(
            `SELECT id, username, email, first_name, last_name, role, status 
             FROM users WHERE id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        // Add display name by combining first and last name
        const user = result.rows[0];
        user.name = `${user.first_name} ${user.last_name}`.trim();
        return user;
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        return null;
    }
}

/**
 * Middleware to check if user is authenticated
 * Redirects to login page for HTML requests
 * Returns 401 for API requests
 */
function requireAuth(req, res, next) {
    // Determine if this is an API request. When middleware is mounted under
    // a path (e.g., app.use('/api/...', requireAuth)), req.path is relative
    // to the mount point and will NOT start with '/api'. Use originalUrl.
    const isApi = (req.originalUrl || req.url || '').startsWith('/api/');

    // Check if user is authenticated via session
    if (!req.session || !req.session.userId) {
        // For API requests, return JSON 401 instead of redirecting HTML
        if (isApi) {
            return res.status(401).json({ 
                error: 'Authentication required',
                redirectTo: '/login.html'
            });
        }

        // Handle HTML requests - redirect to login
        return res.redirect('/login.html');
    }

    // Continue to the next middleware or route handler
    next();
}

/**
 * Middleware to check if user has required role(s)
 * @param {string|string[]} roles - Required role(s)
 * @returns {Function} Middleware function
 */
function requireRole(roles) {
    // Convert single role to array for consistent handling
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    return async (req, res, next) => {
        // First check if user is authenticated
        if (!req.session || !req.session.userId) {
            // Determine if this is an API request (see note in requireAuth)
            const isApi = (req.originalUrl || req.url || '').startsWith('/api/');

            // Handle API requests
            if (isApi) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    redirectTo: '/login.html'
                });
            }
            
            // Handle HTML requests
            return res.redirect('/login.html');
        }
        
        // Get user from database
        const user = await getUserById(req.session.userId);
        
        // Check if user exists and is active (case-insensitive)
        if (!user || (user.status || '').toLowerCase() !== 'active') {
            req.session.destroy();
            
            // Handle API requests
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ 
                    error: 'User account is inactive or not found',
                    redirectTo: '/login.html'
                });
            }
            
            // Handle HTML requests
            return res.redirect('/login.html');
        }
        
        // Check if user has required role
        if (!allowedRoles.includes(user.role)) {
            // Handle API requests
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ 
                    error: 'Access denied. Insufficient permissions.',
                    requiredRole: allowedRoles
                });
            }
            
            // Handle HTML requests
            return res.status(403).send('Access denied. Insufficient permissions.');
        }
        
        // Attach user to request for use in route handlers
        req.user = user;
        
        // Continue to the next middleware or route handler
        next();
    };
}

/**
 * Middleware to attach current user to request if authenticated
 * Does not block the request if user is not authenticated
 */
async function getCurrentUser(req, res, next) {
    // Skip if no session or userId
    if (!req.session || !req.session.userId) {
        return next();
    }
    
    try {
        // Get user from database
        const user = await getUserById(req.session.userId);
        
        // If user exists and is active (case-insensitive), attach to request
        if (user && (user.status || '').toLowerCase() === 'active') {
            req.user = user;
        } else {
            // Clear invalid session
            req.session.destroy();
        }
    } catch (error) {
        console.error('Error in getCurrentUser middleware:', error);
    }
    
    // Continue to next middleware regardless of authentication status
    next();
}

/**
 * Middleware to redirect authenticated users away from login page
 * @param {string} redirectTo - Path to redirect to (default: '/index.html')
 * @returns {Function} Middleware function
 */
function redirectIfAuthenticated(redirectTo = '/index.html') {
    return async (req, res, next) => {
        // Skip if no session or userId
        if (!req.session || !req.session.userId) {
            return next();
        }
        
        try {
            // Get user from database
            const user = await getUserById(req.session.userId);
            
            // If user exists and is active (case-insensitive), redirect
            if (user && (user.status || '').toLowerCase() === 'active') {
                return res.redirect(redirectTo);
            } else {
                // Clear invalid session
                req.session.destroy();
            }
        } catch (error) {
            console.error('Error in redirectIfAuthenticated middleware:', error);
            // Clear session on error
            req.session.destroy();
        }
        
        // Continue to next middleware if not redirected
        next();
    };
}

module.exports = {
    requireAuth,
    requireRole,
    getCurrentUser,
    redirectIfAuthenticated,
    getUserById
};
