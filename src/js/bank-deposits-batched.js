import { ensureAuthenticated, appConfig, showToast, switchTab } from './app-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  await ensureAuthenticated();

  // Wire tab navigation (reuse existing switchTab helper if present)
  document.querySelectorAll('.tab-item').forEach((el) => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  const importBtn = document.getElementById('importBatchedDepositsBtn');
  const fileInput = document.getElementById('batchedDepositCsvFile');
  const refreshBtn = document.getElementById('refresh-batched-deposits-btn');

  importBtn?.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      showToast('Please choose a CSV file to import.', 'warning');
      return;
    }

    // Placeholder until we finalize the backend and CSV format
    showToast('Batched deposit import is not yet implemented. Awaiting CSV format spec.', 'info');
  });

  refreshBtn?.addEventListener('click', () => {
    // Placeholder: later this will fetch deposits
    showToast('Refreshing batched deposits...', 'info');
  });
});
