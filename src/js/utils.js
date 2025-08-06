/**
 * @file utils.js
 * @description Utility functions for the Non-Profit Fund Accounting System.
 * This module provides common helper functions used throughout the application.
 */

(function(window) {
    'use strict';

    // --- Utility Functions ---

    /**
     * Generates a unique ID
     * @returns {string} A unique ID string
     */
    function generateId() {
        return 'id-' + Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * Formats a date as YYYY-MM-DD
     * @param {Date|string} date - Date object or ISO date string
     * @returns {string} Formatted date string
     */
    function formatDate(date) {
        if (!date) return '';
        
        const d = typeof date === 'string' ? new Date(date) : date;
        
        if (isNaN(d.getTime())) {
            console.warn(`UTILS: Invalid date: ${date}`);
            return '';
        }
        
        return d.toISOString().split('T')[0];
    }

    /**
     * Formats a number as currency
     * @param {number} amount - The amount to format
     * @param {string} [currencyCode='USD'] - The currency code
     * @returns {string} Formatted currency string
     */
    function formatCurrency(amount, currencyCode = 'USD') {
        return `$${(amount || 0).toFixed(2)} ${currencyCode}`;
    }

    /**
     * Deep clones an object
     * @param {any} obj - The object to clone
     * @returns {any} A deep clone of the object
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Validates an email address format
     * @param {string} email - The email address to validate
     * @returns {boolean} True if the email format is valid
     */
    function validateEmail(email) {
        if (!email) return false;
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    /**
     * Formats a percentage value
     * @param {number} value - The decimal value (e.g., 0.15 for 15%)
     * @param {number} [decimalPlaces=1] - Number of decimal places
     * @returns {string} Formatted percentage string
     */
    function formatPercent(value, decimalPlaces = 1) {
        return (value * 100).toFixed(decimalPlaces) + '%';
    }

    /**
     * Tests if a string is empty or only whitespace
     * @param {string} str - The string to test
     * @returns {boolean} True if the string is empty or only whitespace
     */
    function isEmptyString(str) {
        return !str || /^\s*$/.test(str);
    }

    /**
     * Truncates a string to a maximum length with ellipsis
     * @param {string} str - The string to truncate
     * @param {number} maxLength - Maximum length
     * @param {string} [ellipsis='...'] - Ellipsis string
     * @returns {string} Truncated string
     */
    function truncateString(str, maxLength, ellipsis = '...') {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength - ellipsis.length) + ellipsis;
    }

    /**
     * Debounces a function to limit how often it can be called
     * @param {function} func - The function to debounce
     * @param {number} wait - Milliseconds to wait
     * @returns {function} Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    /**
     * Throttles a function to limit how often it can be called
     * @param {function} func - The function to throttle
     * @param {number} limit - Milliseconds to wait between calls
     * @returns {function} Throttled function
     */
    function throttle(func, limit) {
        let inThrottle;
        
        return function(...args) {
            const context = this;
            
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Determines if an object is empty
     * @param {object} obj - The object to check
     * @returns {boolean} True if the object is empty
     */
    function isEmptyObject(obj) {
        return obj === null || typeof obj !== 'object' || Object.keys(obj).length === 0;
    }

    /**
     * Gets the current fiscal year range based on a start date
     * @param {string} fiscalYearStartMMDD - Fiscal year start in MM-DD format
     * @returns {object} Object with start and end dates
     */
    function getCurrentFiscalYear(fiscalYearStartMMDD = '01-01') {
        const [startMonth, startDay] = fiscalYearStartMMDD.split('-').map(Number);
        const today = new Date();
        const currentYear = today.getFullYear();
        
        let fiscalYearStart = new Date(currentYear, startMonth - 1, startDay);
        if (today < fiscalYearStart) {
            fiscalYearStart = new Date(currentYear - 1, startMonth - 1, startDay);
        }
        
        const fiscalYearEnd = new Date(fiscalYearStart);
        fiscalYearEnd.setFullYear(fiscalYearEnd.getFullYear() + 1);
        fiscalYearEnd.setDate(fiscalYearEnd.getDate() - 1);
        
        return {
            start: formatDate(fiscalYearStart),
            end: formatDate(fiscalYearEnd)
        };
    }

    // --- Public API ---

    const utils = {
        generateId,
        formatDate,
        formatCurrency,
        deepClone,
        validateEmail,
        formatPercent,
        isEmptyString,
        truncateString,
        debounce,
        throttle,
        isEmptyObject,
        getCurrentFiscalYear
    };

    // Expose the public API to the window
    window.utils = utils;

})(window);
