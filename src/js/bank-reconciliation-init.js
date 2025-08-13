/**
 * Bank Reconciliation Initialization Module
 */

function initBankReconciliationPage(){
  const sel = document.getElementById('bank-account-selector'); if (sel) sel.addEventListener('change', handleBankAccountChange);

  const sFilterBtn = document.getElementById('btn-filter-statements'); if (sFilterBtn) sFilterBtn.addEventListener('click', handleStatementFilter);
  const sResetBtn = document.getElementById('btn-reset-statement-filters'); if (sResetBtn) sResetBtn.addEventListener('click', handleStatementFilterReset);
  const sPrev = document.getElementById('statements-prev-page'); if (sPrev) sPrev.addEventListener('click', ()=>handleStatementPagination('prev'));
  const sNext = document.getElementById('statements-next-page'); if (sNext) sNext.addEventListener('click', ()=>handleStatementPagination('next'));

  const upBtn = document.getElementById('btn-upload-statement'); if (upBtn) upBtn.addEventListener('click', handleUploadStatementClick);
  const saveBtn = document.getElementById('btn-save-statement'); if (saveBtn) saveBtn.addEventListener('click', handleSaveStatementClick);
  const importBtn = document.getElementById('btn-import-transactions'); if (importBtn) importBtn.addEventListener('click', ()=>handleImportTransactionsClick());

  const newRecBtn = document.getElementById('btn-new-reconciliation'); if (newRecBtn) newRecBtn.addEventListener('click', ()=>handleNewReconciliationClick());
  const newRecEmptyBtn = document.getElementById('btn-new-reconciliation-empty'); if (newRecEmptyBtn) newRecEmptyBtn.addEventListener('click', ()=>handleNewReconciliationClick());
  const recStmtSel = document.getElementById('reconciliation-statement'); if (recStmtSel) recStmtSel.addEventListener('change', handleReconciliationStatementChange);
  const createRecBtn = document.getElementById('btn-create-reconciliation'); if (createRecBtn) createRecBtn.addEventListener('click', handleCreateReconciliationClick);
  const recSel = document.getElementById('reconciliation-selector'); if (recSel) recSel.addEventListener('change', handleReconciliationSelectionChange);
  const autoBtn = document.getElementById('btn-auto-match'); if (autoBtn) autoBtn.addEventListener('click', handleAutoMatchClick);

  const startRecBtn = document.getElementById('btn-start-reconciliation'); if (startRecBtn) startRecBtn.addEventListener('click', handleStartReconciliationClick);

  document.querySelectorAll('.close-panel-btn').forEach(btn=>btn.addEventListener('click', handleClosePanelClick));

  initModalCloseButtons();
  initDragAndDrop();

  loadBankAccounts();
  loadBankStatements();
  loadReconciliations();
}

window.initBankReconciliationPage = initBankReconciliationPage;
window.addEventListener('DOMContentLoaded', initBankReconciliationPage);
