/**
 * @file force-entity-visualization.js
 * @description An extremely aggressive, final-resort patch script to combat the disappearing entity visualization.
 * This script permanently overrides the visualization creation method, creates a backup of the rendered
 * content, and uses multiple, redundant mechanisms (MutationObserver, setInterval, and property locking)
 * to ensure the visualization remains visible at all times.
 */

(function(window) {
    'use strict';

    // --- State and Configuration ---
    const _state = {
        visualizationBackup: null,
        observer: null,
        fallbackIntervalId: null,
        isPatched: false,
        isProtected: false,
        container: null
    };

    const VIZ_CONTAINER_ID = 'entity-relationship-viz';
    const RETRY_DELAY = 500;
    const MAX_ATTEMPTS = 40; // Retry for 20 seconds
    let attempts = 0;

    /**
     * A simple, styled logger for this script.
     * @param {string} message - The message to log.
     * @param {'info'|'warn'|'error'|'success'} [level='info'] - The log level.
     */
    function log(message, level = 'info') {
        const styles = {
            info: 'color: #8A2BE2; font-weight: bold;',
            warn: 'color: #FF8C00; font-weight: bold;',
            error: 'color: #DC143C; font-weight: bold;',
            success: 'color: #228B22; font-weight: bold;'
        };
        console.log(`%c[FORCE-VIZ-AGGRESSIVE] ${message}`, styles[level]);
    }

    /**
     * Checks if the visualization container is empty.
     * @returns {boolean} True if the container is empty.
     */
    function isContainerEmpty() {
        if (!_state.container) return true;
        return _state.container.childElementCount === 0;
    }

    /**
     * Restores the visualization from the backup.
     */
    function restoreVisualization() {
        if (!_state.container) {
            log('Cannot restore: Container element not found.', 'error');
            return;
        }
        if (!_state.visualizationBackup) {
            log('Cannot restore: No backup available.', 'warn');
            return;
        }

        if (isContainerEmpty()) {
            log('Container is empty. Restoring from backup...', 'warn');
            _state.container.innerHTML = _state.visualizationBackup;
        }
    }

    /**
     * The core function that overrides methods and sets up protection.
     */
    function patchAndProtect() {
        if (_state.isPatched) {
            log('Protection already active. Skipping.', 'info');
            return;
        }

        log('Core modules ready. Applying aggressive patch and protection mechanisms.');

        // --- Step 1: Find the container ---
        _state.container = document.getElementById(VIZ_CONTAINER_ID);
        if (!_state.container) {
            log(`Cannot find visualization container with ID '${VIZ_CONTAINER_ID}'. Aborting.`, 'error');
            return;
        }

        // --- Step 2: Override the visualization creation method ---
        const originalInitViz = window.entityHierarchy.initializeHierarchyVisualization;
        
        window.entityHierarchy.initializeHierarchyVisualization = function(...args) {
            log('Intercepted call to initializeHierarchyVisualization.', 'info');
            
            // Call the original function to let it do its work
            originalInitViz.apply(this, args);
            
            // After it runs, immediately take a backup if the container has content
            if (!isContainerEmpty()) {
                log('Visualization rendered. Taking backup...', 'success');
                _state.visualizationBackup = _state.container.innerHTML;
            } else {
                log('Original function ran, but container is still empty.', 'warn');
            }
        };
        _state.isPatched = true;
        log('initializeHierarchyVisualization has been permanently overridden.', 'warn');

        // --- Step 3: Set up continuous monitoring and restoration ---
        if (_state.fallbackIntervalId) clearInterval(_state.fallbackIntervalId);
        _state.fallbackIntervalId = setInterval(restoreVisualization, 1000); // Check every second
        log('Continuous 1-second restoration loop is now active.', 'warn');

        // --- Step 4: Set up MutationObserver for instant reaction ---
        if (_state.observer) _state.observer.disconnect();
        _state.observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    // If the container was cleared, restore it immediately
                    if (isContainerEmpty()) {
                        log('MutationObserver detected content removal! Restoring immediately.', 'warn');
                        restoreVisualization();
                    }
                }
            }
        });
        _state.observer.observe(_state.container, { childList: true });
        log('MutationObserver is now actively defending the container.', 'warn');

        // --- Step 5: Make container properties read-only (defensive programming) ---
        try {
            Object.defineProperty(_state.container, 'innerHTML', {
                get: function() {
                    return this.cloneNode(true).innerHTML;
                },
                set: function(value) {
                    log('Blocked an attempt to clear visualization via innerHTML!', 'error');
                    // Do nothing to prevent the change
                },
                configurable: true // Keep it configurable in case we need to un-patch
            });
            log('Locked container `innerHTML` property.', 'success');
        } catch (e) {
            log('Could not lock container properties. Browser may not support it fully.', 'error');
        }
    }

    /**
     * The main initialization function that waits for the app to be ready.
     */
    function initialize() {
        attempts++;
        log(`Attempting to initialize patch, attempt #${attempts}...`);

        if (window.entityHierarchy && typeof window.entityHierarchy.initializeHierarchyVisualization === 'function') {
            patchAndProtect();
        } else if (attempts < MAX_ATTEMPTS) {
            setTimeout(initialize, RETRY_DELAY);
        } else {
            log('Max attempts reached. Could not find the entityHierarchy module to patch.', 'error');
        }
    }

    // --- Script Entry Point ---
    // Wait for the DOM to be fully loaded, then give the main app a moment to initialize.
    document.addEventListener('DOMContentLoaded', () => {
        log('DOMContentLoaded detected. Scheduling first check.');
        setTimeout(initialize, 2000); // Wait 2 seconds for the main app to load
    });

})(window);
