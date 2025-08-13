/**
 * @file app-auth.js
 * @description Authentication module for the Non-Profit Fund Accounting System.
 * This module handles user authentication, session management, and role-based access control.
 */

// Import the API base URL computed in app-config.js
import { API_BASE } from './app-config.js';

// Static flag to prevent multiple retry chains for RBAC
let rbacRetryInProgress = false;

/**
 * Check if the user is authenticated.
 * If not, redirect to the login page.
 * @returns {Promise<boolean>} true if authenticated; otherwise false.
 */
async function ensureAuthenticated() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/user`, {
            credentials: 'include'
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.authenticated) {
            // User is authenticated - store in appState (will be handled by app-main.js)
            return {
                authenticated: true,
                user: data.user
            };
        }

        // Not authenticated – redirect
        window.location.href = '/login.html';
        return {
            authenticated: false,
            user: null
        };
    } catch (err) {
        console.error('[Auth] ensureAuthenticated() error:', err);
        window.location.href = '/login.html';
        return {
            authenticated: false,
            user: null,
            error: err.message
        };
    }
}

/**
 * Load current user information and display it in the header.
 * @returns {Promise<Object|null>} The current user object or null if not authenticated
 */
async function loadCurrentUser() {
    const userInfoEl = document.querySelector('.user-info span');
    if (!userInfoEl) return null;

    try {
        const res = await fetch(`${API_BASE}/api/auth/user`, {
            credentials: 'include'
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.authenticated && data.user) {
            // Update UI with user info
            userInfoEl.textContent = data.user.name || data.user.username;

            // Apply role-based access control to navigation
            applyRoleBasedAccess(data.user);
            
            return data.user;
        } else {
            userInfoEl.textContent = 'Guest';
            return null;
        }
    } catch (err) {
        console.error('[Auth] loadCurrentUser() error:', err);
        userInfoEl.textContent = 'Guest';
        return null;
    }
}

/**
 * Apply role-based navigation visibility with a retry mechanism.
 * This function can be called very early (before the DOM fragment holding
 * the navigation bar is parsed). We retry a handful of times with a short
 * delay to give the browser a chance to finish parsing.
 *
 * @param {Object} user Current authenticated user
 * @param {number} [attempt=0] Internal – retry counter (max 5)
 */
function applyRoleBasedAccess(user, attempt = 0) {
    const MAX_RETRIES = 5;

    /* --------------------------------------------------------------
     * Try to locate the Settings nav element
     * -------------------------------------------------------------- */
    const settingsNav  = document.querySelector('.nav-item[data-page="settings"]');
    const settingsPage = document.getElementById('settings-page');

    if (!settingsNav) {
        // Only start a retry chain if one isn't already running
        if (!rbacRetryInProgress && attempt < MAX_RETRIES) {
            // Set flag to indicate a retry chain is in progress
            rbacRetryInProgress = true;
            
            // DOM may still be loading – retry shortly
            console.warn(`[RBAC] Settings nav not found – retry ${attempt + 1}/${MAX_RETRIES}`);
            return setTimeout(() => {
                applyRoleBasedAccess(user, attempt + 1);
                // If this was the last retry attempt, clear the flag
                if (attempt + 1 >= MAX_RETRIES) {
                    rbacRetryInProgress = false;
                }
            }, 150);
        }

        // If we've reached max retries or a retry chain is already running
        if (attempt >= MAX_RETRIES) {
            // Clear the flag since this retry chain is complete
            rbacRetryInProgress = false;
            
            // Give up after MAX_RETRIES but dump available nav items for debugging
            const navDump = Array.from(document.querySelectorAll('.nav-item'))
                .map(el => el.outerHTML)
                .join('\n');
            console.warn('[RBAC] Settings navigation element still not found after retries.\nAvailable nav items:\n', navDump);
            return;
        }
        
        // If a retry chain is already in progress, just return
        if (rbacRetryInProgress) {
            console.log(`[RBAC] Skipping duplicate retry - chain already in progress (attempt ${attempt})`);
            return;
        }
    }

    // If we found the settings nav, clear the retry flag
    if (settingsNav) {
        rbacRetryInProgress = false;
    }

    console.log('[RBAC] Applying role-based access control for user:', user);

    const isAdmin = user && user.role && user.role.toLowerCase() === 'admin';

    if (isAdmin) {
        console.log('[RBAC] User is admin – showing Settings tab');
        // Ensure settings nav is visible for admins
        settingsNav.style.display = '';
    } else {
        console.log('[RBAC] User is NOT admin – hiding Settings tab. Role:', user?.role);
        // Hide settings for non-admin roles
        settingsNav.style.display = 'none';

        // If a non-admin somehow is on the settings page, push them to dashboard
        if (settingsPage && settingsPage.classList.contains('active')) {
            console.log('[RBAC] Redirecting non-admin user away from Settings page');
            const dashboardNav = document.querySelector('.nav-item[data-page="dashboard"]');
            if (dashboardNav) dashboardNav.click();
        }
    }
}

/**
 * Logout the current user, destroy the session, and redirect to login.
 * @returns {Promise<void>}
 */
async function logoutUser() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        if (!res.ok) {
            throw new Error(`Logout failed: ${res.status}`);
        }
    } catch (err) {
        console.error('[Auth] logoutUser() error:', err);
    } finally {
        // Redirect regardless of API result to ensure session cleared client-side
        window.location.href = '/login.html';
    }
}

// Export all authentication functions for use in other modules
export {
    ensureAuthenticated,
    loadCurrentUser,
    applyRoleBasedAccess,
    logoutUser
};
