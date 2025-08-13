/**
 * Bank Reconciliation Handlers Module
 */

async function handleBankAccountChange(){
  const sel = document.getElementById('bank-account-selector');
  const id = sel && sel.value;
  if (id){
    reconciliationState.selectedBankAccountId = id;
    reconciliationState.selectedBankAccount = sel.options[sel.selectedIndex].text;
    const sba=document.getElementById('statement-bank-account'); if (sba) sba.value = id;
    const rba=document.getElementById('reconciliation-bank-account'); if (rba) rba.value = id;
    loadBankStatements();
    loadReconciliations();
  } else {
    reconciliationState.selectedBankAccountId = null;
    reconciliationState.selectedBankAccount = null;
    renderBankStatements([]);
    renderReconciliations([]);
  }
}

function handleStatementFilter(){
  reconciliationState.statementsFilters = {
    status: document.getElementById('statement-status-filter').value,
    startDate: document.getElementById('statement-date-from').value,
    endDate: document.getElementById('statement-date-to').value
  };
  reconciliationState.statementsPage = 1; loadBankStatements();
}
function handleStatementFilterReset(){
  document.getElementById('statement-status-filter').value='';
  document.getElementById('statement-date-from').value='';
  document.getElementById('statement-date-to').value='';
  reconciliationState.statementsFilters = { status:'', startDate:'', endDate:'' };
  reconciliationState.statementsPage = 1; loadBankStatements();
}

function handleStatementPagination(dir){
  if (dir==='prev' && reconciliationState.statementsPage>1) reconciliationState.statementsPage--;
  else if (dir==='next' && reconciliationState.statementsPage<reconciliationState.statementsTotalPages) reconciliationState.statementsPage++;
  loadBankStatements();
}

async function handleStatementRowClick(id){
  if (reconciliationState.isLoading) return; showLoading();
  try{
    const stmt = await fetchBankStatement(id); if(!stmt) throw new Error('Failed to load statement');
    const txs = await fetchStatementTransactions(id);
    reconciliationState.selectedStatementId = id;
    reconciliationState.selectedStatement = stmt;
    reconciliationState.statementTransactions = txs;
    renderStatementDetails(stmt, txs);
    const panel = document.getElementById('statement-details-panel'); if (panel) panel.style.display='block';
  }catch(e){ console.error(e); showToast(`Error loading statement details: ${e.message}`,'error'); }
  finally{ hideLoading(); }
}

function handleUploadStatementClick(){
  const form = document.getElementById('statement-upload-form'); resetForm(form);
  if (reconciliationState.selectedBankAccountId) document.getElementById('statement-bank-account').value = reconciliationState.selectedBankAccountId;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('statement-date-input').value = today;
  const now = new Date(); const lastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1); const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  document.getElementById('statement-start-date').value = lastMonth.toISOString().split('T')[0];
  document.getElementById('statement-end-date').value = lastDay.toISOString().split('T')[0];
  showModal('upload-statement-modal');
}

async function handleSaveStatementClick(){
  const form = document.getElementById('statement-upload-form');
  if (!validateForm(form)) { showToast('Please fill in all required fields','error'); return; }
  showLoading();
  try{
    const fd = new FormData();
    fd.append('bank_account_id', document.getElementById('statement-bank-account').value);
    fd.append('statement_date', document.getElementById('statement-date-input').value);
    fd.append('start_date', document.getElementById('statement-start-date').value);
    fd.append('end_date', document.getElementById('statement-end-date').value);
    fd.append('opening_balance', document.getElementById('statement-opening-balance-input').value);
    fd.append('closing_balance', document.getElementById('statement-closing-balance-input').value);
    fd.append('import_method', document.getElementById('statement-import-method-select').value);
    fd.append('notes', document.getElementById('statement-notes-textarea').value);
    const fileInput = document.getElementById('statement-file-input'); if (fileInput.files.length>0) fd.append('statement_file', fileInput.files[0]);
    const stmt = await createBankStatement(fd);
    hideModal('upload-statement-modal');
    loadBankStatements();
    showToast('Bank statement uploaded successfully','success');
    if (fileInput.files.length>0){
      if (confirm('Do you want to import transactions from the uploaded file?')) await handleImportTransactionsClick(stmt.id);
    }
  }catch(e){ console.error(e); showToast(`Error saving bank statement: ${e.message}`,'error'); }
  finally{ hideLoading(); }
}

async function handleImportTransactionsClick(statementId){
  if (reconciliationState.isLoading) return;
  const id = statementId || reconciliationState.selectedStatementId; if (!id){ showToast('No statement selected','error'); return; }
  const stmt = reconciliationState.selectedStatement; if (!stmt || !stmt.file_path){ showToast('No statement file available for import','error'); return; }
  showLoading();
  try{
    const fd = new FormData(); fd.append('bank_statement_id', id);
    if (stmt.file_path && !stmt.file_name){
      const input = document.createElement('input'); input.type='file'; input.accept='.csv,.ofx,.qfx';
      await new Promise(res=>{ input.onchange=()=>{ if (input.files.length>0) fd.append('transaction_file', input.files[0]); res(); }; input.click(); });
      if (!fd.has('transaction_file')) throw new Error('No file selected for import');
    }
    const result = await importTransactions(id, fd);
    if (stmt) stmt.status='Processed';
    const txs = await fetchStatementTransactions(id); reconciliationState.statementTransactions = txs; renderStatementTransactions(txs);
    loadBankStatements();
    showToast(`Imported ${result.inserted} transactions successfully`,'success');
  }catch(e){ console.error(e); showToast(`Error importing transactions: ${e.message}`,'error'); }
  finally{ hideLoading(); }
}

function handleNewReconciliationClick(statementId=null){
  const form = document.getElementById('new-reconciliation-form'); resetForm(form);
  if (reconciliationState.selectedBankAccountId){
    document.getElementById('reconciliation-bank-account').value = reconciliationState.selectedBankAccountId;
    loadBankStatementsForReconciliation(reconciliationState.selectedBankAccountId, statementId);
  }
  const today = new Date().toISOString().split('T')[0]; document.getElementById('reconciliation-date-input').value = today;
  showModal('new-reconciliation-modal');
}

function handleReconciliationStatementChange(){
  const sel = document.getElementById('reconciliation-statement'); const opt = sel.options[sel.selectedIndex];
  if (opt && opt.value){
    const cb = opt.dataset.closingBalance; document.getElementById('reconciliation-statement-balance').value = cb;
    document.getElementById('reconciliation-book-balance').value = cb;
  }
}

async function handleCreateReconciliationClick(){
  const form = document.getElementById('new-reconciliation-form'); if (!validateForm(form)){ showToast('Please fill in all required fields','error'); return; }
  showLoading();
  try{
    const bank_account_id = document.getElementById('reconciliation-bank-account').value;
    const bank_statement_id = document.getElementById('reconciliation-statement').value;
    const reconciliation_date = document.getElementById('reconciliation-date-input').value;
    const book_balance = parseFloat(document.getElementById('reconciliation-book-balance').value);
    const statement_balance = parseFloat(document.getElementById('reconciliation-statement-balance').value);
    const notes = document.getElementById('reconciliation-notes-textarea').value;
    const sel = document.getElementById('reconciliation-statement'); const opt=sel.options[sel.selectedIndex];
    const start_balance = parseFloat(opt.dataset.openingBalance); const end_balance = parseFloat(opt.dataset.closingBalance);
    const rec = await createReconciliation({ bank_account_id, bank_statement_id, reconciliation_date, start_balance, end_balance, book_balance, statement_balance, notes });
    hideModal('new-reconciliation-modal');
    reconciliationState.selectedReconciliationId = rec.id;
    loadReconciliationWorkspace(rec.id);
    showToast('Reconciliation created successfully','success');
  }catch(e){ console.error(e); showToast(`Error creating reconciliation: ${e.message}`,'error'); }
  finally{ hideLoading(); }
}

async function handleAutoMatchClick(){
  if (reconciliationState.isLoading || !reconciliationState.selectedReconciliationId) return;
  showLoading();
  try{
    const description_match = document.getElementById('auto-match-description').checked;
    const date_tolerance = parseInt(document.getElementById('auto-match-date-tolerance').value)||3;
    const result = await autoMatchTransactions(reconciliationState.selectedReconciliationId, { description_match, date_tolerance });
    await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
    showToast(`Auto-matched ${result.matches} transactions successfully`,'success');
  }catch(e){ console.error(e); showToast(`Error auto-matching transactions: ${e.message}`,'error'); }
  finally{ hideLoading(); }
}

function handleClosePanelClick(e){
  const panel = e.target.closest('.details-panel'); if (!panel) return; panel.style.display='none';
  if (panel.id==='statement-details-panel'){ reconciliationState.selectedStatementId=null; reconciliationState.selectedStatement=null; reconciliationState.statementTransactions=[]; }
  else if (panel.id==='report-details-panel'){ reconciliationState.selectedReportId=null; reconciliationState.selectedReport=null; }
}

async function handleUnmatchClick(id){
  if (reconciliationState.isLoading) return; showLoading();
  try{ await unmatchTransactions(id); await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId); showToast('Transactions unmatched successfully','success'); }
  catch(e){ console.error(e); showToast(`Error unmatching transactions: ${e.message}`,'error'); }
  finally{ hideLoading(); }
}

function handleStartReconciliationClick(){
  if (reconciliationState.selectedStatementId) handleNewReconciliationClick(reconciliationState.selectedStatementId);
  else showToast('No statement selected','error');
}

function handleReconciliationRowClick(id){ reconciliationState.selectedReportId=id; showToast('Reconciliation report view not yet implemented','info'); }
function handleEditAdjustmentClick(id){ showToast(`Edit adjustment (${id}) not implemented`,'info'); }
function handleDeleteAdjustmentClick(id){ showToast(`Delete adjustment (${id}) not implemented`,'info'); }
function handleAddAdjustmentClick(){ showToast('Add adjustment not implemented','info'); }
function handleSaveAdjustmentClick(){ showToast('Save adjustment not implemented','info'); }
function handleReportFilter(){ showToast('Report filter not implemented','info'); }
function handleReportFilterReset(){ showToast('Reset report filters not implemented','info'); }
function handleReconciliationSelectionChange(){ showToast('Reconciliation selector change not handled yet','info'); }

Object.assign(window, { handleBankAccountChange, handleStatementFilter, handleStatementFilterReset, handleStatementPagination, handleStatementRowClick, handleUploadStatementClick, handleSaveStatementClick, handleImportTransactionsClick, handleNewReconciliationClick, handleReconciliationStatementChange, handleCreateReconciliationClick, handleAutoMatchClick, handleClosePanelClick, handleUnmatchClick, handleStartReconciliationClick, handleReconciliationRowClick, handleEditAdjustmentClick, handleDeleteAdjustmentClick, handleAddAdjustmentClick, handleSaveAdjustmentClick, handleReportFilter, handleReportFilterReset, handleReconciliationSelectionChange });
