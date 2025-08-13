/**
 * Bank Reconciliation Shared Module
 */

window.reconciliationState = {
  selectedBankAccountId: null,
  selectedBankAccount: null,
  bankStatements: [],
  statementsPage: 1,
  statementsTotalPages: 1,
  statementsFilters: { status: '', startDate: '', endDate: '' },
  selectedStatementId: null,
  selectedStatement: null,
  statementTransactions: [],
  reconciliations: [],
  reportsPage: 1,
  reportsTotalPages: 1,
  reportsFilters: { status: '', startDate: '', endDate: '' },
  selectedReconciliationId: null,
  activeReconciliation: null,
  unmatchedBankTransactions: [],
  unmatchedJournalEntries: [],
  matchedItems: [],
  adjustments: [],
  isLoading: false,
  activeTab: 'bank-statements-tab',
  reset() {
    this.selectedBankAccountId = null;
    this.selectedBankAccount = null;
    this.bankStatements = [];
    this.statementsPage = 1;
    this.statementsTotalPages = 1;
    this.statementsFilters = { status: '', startDate: '', endDate: '' };
    this.selectedStatementId = null;
    this.selectedStatement = null;
    this.statementTransactions = [];
    this.reconciliations = [];
    this.reportsPage = 1;
    this.reportsTotalPages = 1;
    this.reportsFilters = { status: '', startDate: '', endDate: '' };
    this.selectedReconciliationId = null;
    this.activeReconciliation = null;
    this.unmatchedBankTransactions = [];
    this.unmatchedJournalEntries = [];
    this.matchedItems = [];
    this.adjustments = [];
    this.isLoading = false;
    this.activeTab = 'bank-statements-tab';
  }
};

function formatCurrency(amount){
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(Number(amount));
}
function formatDate(s){
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
}
function formatDateRange(a,b){ return `${formatDate(a)} - ${formatDate(b)}`; }

function showLoading(){
  reconciliationState.isLoading = true;
  if (!document.getElementById('loading-spinner')){
    const el = document.createElement('div');
    el.id = 'loading-spinner';
    el.className = 'loading-spinner';
    el.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(el);
  }
}
function hideLoading(){
  reconciliationState.isLoading = false;
  const el = document.getElementById('loading-spinner');
  if (el) el.remove();
}

function showToast(message, type='info'){
  const c = document.getElementById('toast-container');
  if (!c) { console.error('Toast container not found'); return; }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type==='success'?'✓':type==='error'?'✗':type==='warning'?'⚠':'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span><button class="toast-close">&times;</button>`;
  c.appendChild(toast);
  setTimeout(()=>toast.remove(),3000);
  toast.querySelector('.toast-close').addEventListener('click',()=>toast.remove());
}

function getStatusBadgeHtml(status){
  if (!status) return '';
  const s = String(status).toLowerCase().replace(/\s+/g,'-');
  return `<span class="status-badge status-${s}">${status}</span>`;
}

function validateForm(form){
  const req = form.querySelectorAll('[required]');
  let ok = true;
  req.forEach(input=>{
    if (!String(input.value||'').trim()){
      ok = false; input.classList.add('invalid');
      let msg = input.nextElementSibling;
      if (!msg || !msg.classList.contains('error-message')){
        msg = document.createElement('div');
        msg.className = 'error-message';
        msg.textContent = 'This field is required';
        input.parentNode.insertBefore(msg, input.nextSibling);
      }
    } else {
      input.classList.remove('invalid');
      const msg = input.nextElementSibling; if (msg && msg.classList.contains('error-message')) msg.remove();
    }
  });
  return ok;
}
function resetForm(form){
  form.reset();
  form.querySelectorAll('input,select,textarea').forEach(i=>i.classList.remove('invalid'));
  form.querySelectorAll('.error-message').forEach(m=>m.remove());
}
function clearTableBody(tbody, message){
  tbody.innerHTML = '';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = tbody.parentElement.querySelectorAll('th').length || 1;
  td.className = 'empty-table-message';
  td.textContent = message;
  tr.appendChild(td); tbody.appendChild(tr);
}
function calculateDifference(a,b){ return Number(a) - Number(b); }

function showModal(id){ const m = document.getElementById(id); if (m) m.classList.add('active'); }
function hideModal(id){ const m = document.getElementById(id); if (m) m.classList.remove('active'); }
function initModalCloseButtons(){
  document.querySelectorAll('.modal-close-btn').forEach(btn=>{
    const tid = btn.dataset.modalId || btn.closest('.modal-overlay')?.id || btn.closest('.modal')?.id;
    if (tid) btn.addEventListener('click',()=>hideModal(tid));
  });
}

Object.assign(window, {
  formatCurrency, formatDate, formatDateRange,
  showLoading, hideLoading, showToast, getStatusBadgeHtml,
  validateForm, resetForm, clearTableBody, calculateDifference,
  showModal, hideModal, initModalCloseButtons
});
