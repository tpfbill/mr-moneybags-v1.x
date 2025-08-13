/**
 * Bank Reconciliation Drag and Drop Module
 */

function initDragAndDrop(){
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e){
  const item = e.target.closest('.transaction-item'); if (!item) return;
  e.dataTransfer.setData('text/plain', item.dataset.id);
  e.dataTransfer.setData('application/json', JSON.stringify({ id:item.dataset.id, type:item.dataset.type, amount:item.dataset.amount }));
  item.classList.add('dragging');
}
function handleDragOver(e){ e.preventDefault(); const t=e.target.closest('.matched-items-container'); if(t) t.classList.add('drop-target'); }
function handleDragLeave(e){ const t=e.target.closest('.matched-items-container'); if(t && !t.contains(e.relatedTarget)) t.classList.remove('drop-target'); }
async function handleDrop(e){
  e.preventDefault();
  const t=e.target.closest('.matched-items-container'); if(!t) return; t.classList.remove('drop-target');
  try{
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    if (!data||!data.id||!data.type) return;
    if (data.type==='bank-transaction'){
      const j = reconciliationState.unmatchedJournalEntries;
      const match = findMatchingJournalEntry(j, parseFloat(data.amount));
      if (match){
        await manualMatchTransactions(reconciliationState.selectedReconciliationId, data.id, match.id);
        await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
        showToast('Transaction matched successfully','success');
      } else { showToast('No matching journal entry found','warning'); }
    } else if (data.type==='journal-entry'){
      const b = reconciliationState.unmatchedBankTransactions;
      const match = findMatchingBankTransaction(b, parseFloat(data.amount));
      if (match){
        await manualMatchTransactions(reconciliationState.selectedReconciliationId, match.id, data.id);
        await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
        showToast('Transaction matched successfully','success');
      } else { showToast('No matching bank transaction found','warning'); }
    }
  }catch(err){ console.error(err); showToast(`Error matching transactions: ${err.message}`,'error'); }
}
function handleDragEnd(){
  document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));
  document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
}

function findMatchingJournalEntry(journalEntries, amount){
  const isDeposit = amount>0;
  return journalEntries.find(e=> isDeposit ? Math.abs(e.debit - Math.abs(amount))<0.01 : Math.abs(e.credit - Math.abs(amount))<0.01 );
}
function findMatchingBankTransaction(bankTransactions, amount){
  const isDebit = amount>0;
  return bankTransactions.find(tx=> isDebit ? (tx.amount>0 && Math.abs(tx.amount - Math.abs(amount))<0.01) : (tx.amount<0 && Math.abs(Math.abs(tx.amount)-Math.abs(amount))<0.01));
}

Object.assign(window,{ initDragAndDrop, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd, findMatchingJournalEntry, findMatchingBankTransaction });
