/**
 * Bank Reconciliation Tab Controller
 * 
 * A lightweight, standalone module that handles tab functionality
 * for the bank reconciliation interface.
 */

(function(){
  function activateTab(tabId){
    document.querySelectorAll('.tab-item').forEach(el=>el.classList.remove('active'));
    const tabItem = Array.from(document.querySelectorAll('.tab-item')).find(el=>el.dataset.tab===tabId);
    if (tabItem) tabItem.classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');

    window.ReconActiveTab = tabId;

    if (tabId === 'bank-statements-tab' && typeof window.loadBankStatements === 'function') {
      try { window.loadBankStatements(); } catch(_){}
    } else if (tabId === 'reconciliation-workspace-tab' && typeof window.loadReconciliationWorkspace === 'function') {
      try { window.loadReconciliationWorkspace(); } catch(_){}
    } else if (tabId === 'reconciliation-reports-tab' && typeof window.loadReconciliations === 'function') {
      try { window.loadReconciliations(); } catch(_){}
    }
  }

  function handleClick(e){
    const tabItem = e.currentTarget;
    const tabId = tabItem && tabItem.dataset && tabItem.dataset.tab;
    if (!tabId) return;
    e.preventDefault();
    activateTab(tabId);
  }

  function init(){
    document.querySelectorAll('.tab-item').forEach(el=>{
      el.addEventListener('click', handleClick);
    });
    const initial = document.querySelector('.tab-item.active')?.dataset?.tab || 'bank-statements-tab';
    activateTab(initial);
  }

  window.activateBankReconciliationTab = activateTab;
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
