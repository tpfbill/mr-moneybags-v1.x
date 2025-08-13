/**
 * Bank Reconciliation API Module
 */

async function fetchBankAccounts(){
  try{
    const r = await fetch('/api/bank-accounts',{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error fetching bank accounts: ${e.message}`,'error'); return []; }
}

async function fetchBankStatements(filters={}, page=1){
  try{
    const p = new URLSearchParams({ page:String(page), limit:'10' });
    if (filters.bank_account_id) p.append('bank_account_id', filters.bank_account_id);
    if (filters.status) p.append('status', filters.status);
    if (filters.start_date) p.append('start_date', filters.start_date);
    if (filters.end_date) p.append('end_date', filters.end_date);
    const r = await fetch(`/api/bank-reconciliation/statements?${p.toString()}`,{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error fetching bank statements: ${e.message}`,'error'); return { data: [], pagination: { total:0, page:1, pages:1 } }; }
}

async function fetchBankStatement(id){
  try{
    const r = await fetch(`/api/bank-reconciliation/statements/${id}`,{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error fetching bank statement: ${e.message}`,'error'); return null; }
}

async function fetchStatementTransactions(statementId){
  try{
    const r = await fetch(`/api/bank-reconciliation/statements/${statementId}/transactions`,{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    const res = await r.json();
    return res.data || [];
  }catch(e){ console.error(e); showToast(`Error fetching transactions: ${e.message}`,'error'); return []; }
}

async function createBankStatement(formData){
  try{
    const r = await fetch('/api/bank-reconciliation/statements',{ method:'POST', body: formData, credentials:'include' });
    if(!r.ok){ const ed = await r.json().catch(()=>({})); throw new Error(ed.error||`Failed: ${r.status}`); }
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error creating bank statement: ${e.message}`,'error'); throw e; }
}

async function importTransactions(statementId, formData){
  try{
    formData.append('bank_statement_id', statementId);
    const r = await fetch('/api/bank-reconciliation/transactions/import',{ method:'POST', body: formData, credentials:'include' });
    if(!r.ok){ const ed = await r.json().catch(()=>({})); throw new Error(ed.error||`Failed: ${r.status}`); }
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error importing transactions: ${e.message}`,'error'); throw e; }
}

async function fetchReconciliations(filters={}, page=1){
  try{
    const p = new URLSearchParams({ page:String(page), limit:'10' });
    if (filters.bank_account_id) p.append('bank_account_id', filters.bank_account_id);
    if (filters.status) p.append('status', filters.status);
    if (filters.start_date) p.append('start_date', filters.start_date);
    if (filters.end_date) p.append('end_date', filters.end_date);
    const r = await fetch(`/api/bank-reconciliation/reconciliations?${p.toString()}`,{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error fetching reconciliations: ${e.message}`,'error'); return { data: [], pagination: { total:0, page:1, pages:1 } }; }
}

async function createReconciliation(data){
  try{
    const r = await fetch('/api/bank-reconciliation/reconciliations',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data), credentials:'include' });
    if(!r.ok){ const ed = await r.json().catch(()=>({})); throw new Error(ed.error||`Failed: ${r.status}`); }
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error creating reconciliation: ${e.message}`,'error'); throw e; }
}

async function fetchUnmatchedTransactions(bankAccountId, startDate, endDate){
  try{
    let url = `/api/bank-reconciliation/unmatched/${bankAccountId}`;
    const p = new URLSearchParams();
    if (startDate) p.append('start_date', startDate);
    if (endDate) p.append('end_date', endDate);
    if ([...p.keys()].length) url += `?${p.toString()}`;
    const r = await fetch(url,{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error fetching unmatched transactions: ${e.message}`,'error'); return { bank_transactions: [], journal_items: [] }; }
}

async function autoMatchTransactions(reconciliationId, opts={}){
  try{
    const payload = { bank_reconciliation_id: reconciliationId, description_match: opts.description_match!==false, date_tolerance: Number(opts.date_tolerance||3) };
    const r = await fetch('/api/bank-reconciliation/match/auto',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'include' });
    if(!r.ok){ const ed = await r.json().catch(()=>({})); throw new Error(ed.error||`Failed: ${r.status}`); }
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error auto-matching transactions: ${e.message}`,'error'); throw e; }
}

async function manualMatchTransactions(reconciliationId, bankTransactionId, journalEntryItemId, notes=''){
  try{
    const payload = { bank_reconciliation_id: reconciliationId, bank_statement_transaction_id: bankTransactionId, journal_entry_item_id: journalEntryItemId, notes };
    const r = await fetch('/api/bank-reconciliation/match/manual',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'include' });
    if(!r.ok){ const ed = await r.json().catch(()=>({})); throw new Error(ed.error||`Failed: ${r.status}`); }
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error matching transactions: ${e.message}`,'error'); throw e; }
}

async function unmatchTransactions(matchId){
  try{
    const r = await fetch(`/api/bank-reconciliation/match/${matchId}`,{ method:'DELETE', credentials:'include' });
    if(!r.ok){ const ed = await r.json().catch(()=>({})); throw new Error(ed.error||`Failed: ${r.status}`); }
    return true;
  }catch(e){ console.error(e); showToast(`Error unmatching transactions: ${e.message}`,'error'); throw e; }
}

async function fetchReconciliation(id){
  try{
    const r = await fetch(`/api/bank-reconciliation/reconciliations/${id}`,{credentials:'include'});
    if(!r.ok) throw new Error(`Failed: ${r.status}`);
    return await r.json();
  }catch(e){ console.error(e); showToast(`Error loading reconciliation: ${e.message}`,'error'); return null; }
}

Object.assign(window, { fetchBankAccounts, fetchBankStatements, fetchBankStatement, fetchStatementTransactions, createBankStatement, importTransactions, fetchReconciliations, createReconciliation, fetchUnmatchedTransactions, autoMatchTransactions, manualMatchTransactions, unmatchTransactions, fetchReconciliation });
