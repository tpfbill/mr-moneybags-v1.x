/**
 * Bank Reconciliation Render Module
 */

function populateBankAccountDropdowns(accounts){
  const selMain = document.getElementById('bank-account-selector');
  const selStmt = document.getElementById('statement-bank-account');
  const selRec  = document.getElementById('reconciliation-bank-account');
  if (selMain) selMain.innerHTML = '<option value="">Select Bank Account...</option>';
  if (selStmt) selStmt.innerHTML = '<option value="">Select Bank Account...</option>';
  if (selRec)  selRec.innerHTML  = '<option value="">Select Bank Account...</option>';
  accounts.forEach(a=>{
    const t = `${a.bank_name} - ${a.account_name}`;
    if (selMain){ const o=document.createElement('option'); o.value=a.id; o.textContent=t; selMain.appendChild(o); }
    if (selStmt){ const o=document.createElement('option'); o.value=a.id; o.textContent=t; selStmt.appendChild(o); }
    if (selRec){ const o=document.createElement('option'); o.value=a.id; o.textContent=t; selRec.appendChild(o); }
  });
}

async function loadBankAccounts(){
  if (reconciliationState.isLoading) return; showLoading();
  try{
    const accounts = await fetchBankAccounts();
    populateBankAccountDropdowns(accounts);
  }catch(e){ /* toast handled in API */ }
  finally{ hideLoading(); }
}

async function loadBankStatements(){
  if (reconciliationState.isLoading) return; showLoading();
  try{
    const f = {
      status: reconciliationState.statementsFilters.status,
      start_date: reconciliationState.statementsFilters.startDate,
      end_date: reconciliationState.statementsFilters.endDate
    };
    if (reconciliationState.selectedBankAccountId) f.bank_account_id = reconciliationState.selectedBankAccountId;
    const res = await fetchBankStatements(f, reconciliationState.statementsPage);
    reconciliationState.bankStatements = res.data;
    reconciliationState.statementsTotalPages = res.pagination.pages;
    reconciliationState.statementsPage = res.pagination.page;
    renderBankStatements(res.data);
    const cp=document.getElementById('statements-current-page'); if(cp) cp.textContent=reconciliationState.statementsPage;
    const tp=document.getElementById('statements-total-pages'); if(tp) tp.textContent=reconciliationState.statementsTotalPages;
    const pb=document.getElementById('statements-prev-page'); if(pb) pb.disabled = reconciliationState.statementsPage<=1;
    const nb=document.getElementById('statements-next-page'); if(nb) nb.disabled = reconciliationState.statementsPage>=reconciliationState.statementsTotalPages;
  }catch(e){ /* toast handled */ }
  finally{ hideLoading(); }
}

function renderBankStatements(stmts){
  const tbody = document.querySelector('#bank-statements-table tbody');
  if (!tbody) return;
  if (!stmts || !stmts.length){ clearTableBody(tbody,'No bank statements found.'); return; }
  tbody.innerHTML='';
  stmts.forEach(stmt=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(stmt.statement_date)}</td>
      <td>${stmt.bank_name} - ${stmt.account_name}</td>
      <td>${formatDateRange(stmt.start_date, stmt.end_date)}</td>
      <td>${formatCurrency(stmt.opening_balance)}</td>
      <td>${formatCurrency(stmt.closing_balance)}</td>
      <td>${getStatusBadgeHtml(stmt.status)}</td>
      <td><button class="action-btn view-btn" data-id="${stmt.id}">View</button></td>`;
    tr.querySelector('.view-btn').addEventListener('click',()=>handleStatementRowClick(stmt.id));
    tbody.appendChild(tr);
  });
}

function renderStatementDetails(statement, transactions){
  document.getElementById('statement-detail-date').textContent = formatDate(statement.statement_date);
  document.getElementById('statement-detail-account').textContent = `${statement.bank_name} - ${statement.account_name}`;
  document.getElementById('statement-detail-period').textContent = formatDateRange(statement.start_date, statement.end_date);
  document.getElementById('statement-detail-opening').textContent = formatCurrency(statement.opening_balance);
  document.getElementById('statement-detail-closing').textContent = formatCurrency(statement.closing_balance);
  document.getElementById('statement-detail-status').innerHTML = getStatusBadgeHtml(statement.status);
  document.getElementById('statement-detail-notes').textContent = statement.notes || 'No notes';
  renderStatementTransactions(transactions);
}

function renderStatementTransactions(transactions){
  const tbody = document.querySelector('#statement-transactions-table tbody');
  if (!tbody) return;
  if (!transactions || !transactions.length){ clearTableBody(tbody,'No transactions found.'); return; }
  tbody.innerHTML='';
  transactions.forEach(tx=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(tx.transaction_date)}</td>
      <td>${tx.description}</td>
      <td>${tx.reference||''}</td>
      <td class="${tx.amount>0?'amount-positive':'amount-negative'}">${formatCurrency(tx.amount)}</td>
      <td>${tx.matched?'<span class="status-badge status-matched">Matched</span>':''}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadBankStatementsForReconciliation(bankAccountId, selectedStatementId=null){
  if (!bankAccountId) return;
  const res = await fetchBankStatements({ bank_account_id: bankAccountId, status: 'Processed' }, 1);
  const sel = document.getElementById('reconciliation-statement'); if(!sel) return;
  sel.innerHTML = '<option value="">Select Statement...</option>';
  res.data.forEach(s=>{
    const o=document.createElement('option');
    o.value=s.id; o.textContent=`${formatDate(s.statement_date)} (${formatCurrency(s.closing_balance)})`;
    o.dataset.openingBalance = s.opening_balance; o.dataset.closingBalance = s.closing_balance;
    sel.appendChild(o);
  });
  if (selectedStatementId){ sel.value = selectedStatementId; if (typeof handleReconciliationStatementChange==='function') handleReconciliationStatementChange(); }
}

async function loadReconciliations(){
  if (reconciliationState.isLoading) return; showLoading();
  try{
    const f = {
      status: reconciliationState.reportsFilters.status,
      start_date: reconciliationState.reportsFilters.startDate,
      end_date: reconciliationState.reportsFilters.endDate
    };
    if (reconciliationState.selectedBankAccountId) f.bank_account_id = reconciliationState.selectedBankAccountId;
    const res = await fetchReconciliations(f, reconciliationState.reportsPage);
    reconciliationState.reconciliations = res.data;
    reconciliationState.reportsTotalPages = res.pagination.pages;
    reconciliationState.reportsPage = res.pagination.page;
    renderReconciliations(res.data);
    const cp=document.getElementById('reports-current-page'); if(cp) cp.textContent=reconciliationState.reportsPage;
    const tp=document.getElementById('reports-total-pages'); if(tp) tp.textContent=reconciliationState.reportsTotalPages;
    const pb=document.getElementById('reports-prev-page'); if(pb) pb.disabled = reconciliationState.reportsPage<=1;
    const nb=document.getElementById('reports-next-page'); if(nb) nb.disabled = reconciliationState.reportsPage>=reconciliationState.reportsTotalPages;
    updateReconciliationSelector(res.data);
  }catch(e){ /* toast handled */ }
  finally{ hideLoading(); }
}

function renderReconciliations(recs){
  const tbody = document.querySelector('#reconciliation-reports-table tbody');
  if (!tbody) return;
  if (!recs || !recs.length){ clearTableBody(tbody,'No reconciliations found.'); return; }
  tbody.innerHTML='';
  recs.forEach(rec=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(rec.reconciliation_date)}</td>
      <td>${rec.bank_name} - ${rec.account_name}</td>
      <td>${formatDate(rec.statement_date)}</td>
      <td>${formatCurrency(rec.statement_balance)}</td>
      <td>${formatCurrency(rec.book_balance)}</td>
      <td>${getStatusBadgeHtml(rec.status)}</td>
      <td><button class="action-btn view-btn" data-id="${rec.id}">View</button></td>`;
    tr.querySelector('.view-btn').addEventListener('click',()=>handleReconciliationRowClick(rec.id));
    tbody.appendChild(tr);
  });
}

function updateReconciliationSelector(recs){
  const sel = document.getElementById('reconciliation-selector');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">Select Reconciliation...</option>';
  recs.filter(r=>r.status==='In Progress').forEach(rec=>{
    const o=document.createElement('option');
    o.value=rec.id; o.textContent = `${formatDate(rec.reconciliation_date)} - ${rec.bank_name} (${formatCurrency(rec.statement_balance)})`;
    sel.appendChild(o);
  });
  if (prev && Array.from(sel.options).some(o=>o.value===prev)) sel.value = prev;
}

async function loadReconciliationWorkspace(reconciliationId=null){
  if (reconciliationState.isLoading) return;
  const id = reconciliationId || reconciliationState.selectedReconciliationId;
  if (!id){
    const w = document.getElementById('reconciliation-workspace'); if (w) w.style.display='none';
    const e = document.getElementById('reconciliation-empty-state'); if (e) e.style.display='flex';
    return;
  }
  showLoading();
  try{
    const rec = await fetchReconciliation(id);
    if (!rec) throw new Error('Failed to load reconciliation');
    const unmatched = await fetchUnmatchedTransactions(rec.bank_account_id, rec.start_date, rec.end_date);
    reconciliationState.selectedReconciliationId = id;
    reconciliationState.activeReconciliation = rec;
    reconciliationState.unmatchedBankTransactions = unmatched.bank_transactions||[];
    reconciliationState.unmatchedJournalEntries = unmatched.journal_items||[];
    reconciliationState.matchedItems = rec.matched_items||[];
    reconciliationState.adjustments = rec.adjustments||[];
    const w = document.getElementById('reconciliation-workspace'); if (w) w.style.display='block';
    const e = document.getElementById('reconciliation-empty-state'); if (e) e.style.display='none';
    renderReconciliationWorkspace(rec);
    const sel = document.getElementById('reconciliation-selector'); if (sel) sel.value = id;
  }catch(err){ console.error(err); showToast(`Error loading reconciliation workspace: ${err.message}`,'error');
    const w = document.getElementById('reconciliation-workspace'); if (w) w.style.display='none';
    const e = document.getElementById('reconciliation-empty-state'); if (e) e.style.display='flex';
  }finally{ hideLoading(); }
}

function renderReconciliationWorkspace(rec){
  document.getElementById('workspace-bank-account').textContent = `${rec.bank_name} - ${rec.account_name}`;
  document.getElementById('workspace-statement-date').textContent = formatDate(rec.statement_date);
  document.getElementById('workspace-statement-balance').textContent = formatCurrency(rec.statement_balance);
  document.getElementById('workspace-book-balance').textContent = formatCurrency(rec.book_balance);
  const diff = rec.statement_balance - rec.book_balance;
  const dEl = document.getElementById('workspace-difference');
  dEl.textContent = formatCurrency(diff);
  dEl.className = diff===0?'amount-zero':(diff>0?'amount-positive':'amount-negative');
  renderUnmatchedBankTransactions(reconciliationState.unmatchedBankTransactions);
  renderUnmatchedJournalEntries(reconciliationState.unmatchedJournalEntries);
  renderMatchedItems(reconciliationState.matchedItems);
  renderAdjustments(reconciliationState.adjustments);
}

function renderUnmatchedBankTransactions(list){
  const c = document.getElementById('unmatched-bank-transactions'); if (!c) return;
  c.innerHTML='';
  if (!list || !list.length){ c.innerHTML='<div class="empty-message">No unmatched bank transactions</div>'; return; }
  list.forEach(tx=>{
    const item=document.createElement('div');
    item.className='transaction-item'; item.draggable=true;
    item.dataset.id=tx.id; item.dataset.type='bank-transaction'; item.dataset.amount=tx.amount;
    item.innerHTML = `<div class="transaction-date">${formatDate(tx.transaction_date)}</div><div class="transaction-desc">${tx.description}</div><div class="transaction-amount ${tx.amount>0?'amount-positive':'amount-negative'}">${formatCurrency(tx.amount)}</div>`;
    c.appendChild(item);
  });
}

function renderUnmatchedJournalEntries(list){
  const c = document.getElementById('unmatched-journal-entries'); if (!c) return;
  c.innerHTML='';
  if (!list || !list.length){ c.innerHTML='<div class="empty-message">No unmatched journal entries</div>'; return; }
  list.forEach(e=>{
    const item=document.createElement('div');
    item.className='transaction-item'; item.draggable=true;
    item.dataset.id=e.id; item.dataset.type='journal-entry'; item.dataset.amount = e.debit>0?e.debit:-e.credit;
    item.innerHTML = `<div class="transaction-date">${formatDate(e.transaction_date)}</div><div class="transaction-desc">${e.description}</div><div class="transaction-amount">${e.debit>0?`<span class="amount-positive">${formatCurrency(e.debit)}</span>`:`<span class="amount-negative">${formatCurrency(-e.credit)}</span>`}</div>`;
    c.appendChild(item);
  });
}

function renderMatchedItems(matches){
  const c = document.getElementById('matched-items'); if (!c) return;
  c.innerHTML='';
  if (!matches || !matches.length){ c.innerHTML='<div class="empty-message">No matched items</div>'; return; }
  matches.forEach(m=>{
    const item=document.createElement('div'); item.className='match-item';
    item.innerHTML = `
      <div class="match-header"><div class="match-date">${formatDate(m.match_date)}</div><button class="unmatch-btn" data-id="${m.id}">Unmatch</button></div>
      <div class="match-content">
        <div class="match-bank-transaction">
          <div class="transaction-date">${formatDate(m.bank_transaction.transaction_date)}</div>
          <div class="transaction-desc">${m.bank_transaction.description}</div>
          <div class="transaction-amount ${m.bank_transaction.amount>0?'amount-positive':'amount-negative'}">${formatCurrency(m.bank_transaction.amount)}</div>
        </div>
        <div class="match-separator">⟷</div>
        <div class="match-journal-entry">
          <div class="transaction-date">${formatDate(m.journal_entry.transaction_date)}</div>
          <div class="transaction-desc">${m.journal_entry.description}</div>
          <div class="transaction-amount">${m.journal_entry.debit>0?`<span class="amount-positive">${formatCurrency(m.journal_entry.debit)}</span>`:`<span class="amount-negative">${formatCurrency(-m.journal_entry.credit)}</span>`}</div>
        </div>
      </div>`;
    item.querySelector('.unmatch-btn').addEventListener('click',()=>handleUnmatchClick(m.id));
    c.appendChild(item);
  });
}

function renderAdjustments(list){
  const c = document.getElementById('adjustments-list'); if (!c) return;
  c.innerHTML='';
  if (!list || !list.length){ c.innerHTML='<div class="empty-message">No adjustments</div>'; return; }
  list.forEach(a=>{
    const item=document.createElement('div'); item.className='adjustment-item';
    item.innerHTML = `
      <div class="adjustment-header"><div class="adjustment-date">${formatDate(a.adjustment_date)}</div>
        <div class="adjustment-actions"><button class="edit-btn" data-id="${a.id}">Edit</button><button class="delete-btn" data-id="${a.id}">Delete</button></div></div>
      <div class="adjustment-content"><div class="adjustment-desc">${a.description}</div><div class="adjustment-type">${a.adjustment_type}</div>
        <div class="adjustment-amount ${a.amount>0?'amount-positive':'amount-negative'}">${formatCurrency(a.amount)}</div></div>`;
    item.querySelector('.edit-btn').addEventListener('click',()=>handleEditAdjustmentClick(a.id));
    item.querySelector('.delete-btn').addEventListener('click',()=>handleDeleteAdjustmentClick(a.id));
    c.appendChild(item);
  });
}

Object.assign(window, { populateBankAccountDropdowns, loadBankAccounts, loadBankStatements, renderBankStatements, renderStatementDetails, renderStatementTransactions, loadBankStatementsForReconciliation, loadReconciliations, renderReconciliations, updateReconciliationSelector, loadReconciliationWorkspace, renderReconciliationWorkspace, renderUnmatchedBankTransactions, renderUnmatchedJournalEntries, renderMatchedItems, renderAdjustments });
