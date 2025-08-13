/**
 * Bank Reconciliation Initialization Fallback
 * 
 * This script ensures the bank reconciliation page initializes properly
 * even if the main core file fails to attach the DOMContentLoaded event listener
 * or if that listener is truncated during file operations.
 * 
 * It serves as a safety mechanism to prevent UI initialization failures.
 */

window.addEventListener('DOMContentLoaded', function(){
  if (typeof window.initBankReconciliationPage === 'function') {
    try { 
      window.initBankReconciliationPage(); 
    } catch (e) { 
      console.error('Error initializing bank reconciliation page:', e);
      // Show error toast if available
      if (typeof window.showToast === 'function') {
        window.showToast('Error initializing page. Please refresh.', 'error');
      }
    }
  }
});
