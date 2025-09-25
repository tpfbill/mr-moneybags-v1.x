import { API_BASE } from './app-config.js';
import { ensureAuthenticated } from './app-auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  await ensureAuthenticated();

  // Simple local tab switcher
  const tabs = document.querySelectorAll('.tab-item');
  const panels = document.querySelectorAll('.tab-panel');
  function switchTabLocal(id) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    panels.forEach(p => p.classList.toggle('active', p.id === id));
  }
  tabs.forEach((el) => el.addEventListener('click', () => switchTabLocal(el.dataset.tab)));

  const importBtn = document.getElementById('importBatchedDepositsBtn');
  const fileInput = document.getElementById('batchedDepositCsvFile');
  const refreshBtn = document.getElementById('refresh-batched-deposits-btn');
  const logTableBody = document.querySelector('#batched-import-log-table tbody');

  importBtn?.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      toast('Please choose a CSV file to import.', 'warning');
      return;
    }

    try {
      const fd = new FormData();
      fd.append('file', file);
      const url = `${API_BASE}/api/bank-deposits/batched/import`;
      console.debug('[Batched Import] POST', url);
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      const ctype = res.headers.get('content-type') || '';
      const isJson = ctype.includes('application/json');
      const data = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(data?.error || `Import failed (${res.status})`);

      // Populate import log
      if (Array.isArray(data.log)) {
        logTableBody.innerHTML = data.log.map((r) => `
          <tr>
            <td>${r.line ?? ''}</td>
            <td>${r.status}</td>
            <td>${r.message || ''}</td>
          </tr>
        `).join('');
      }

      toast(`Imported: ${data.created_deposits || 0} deposits, ${data.created_items || 0} items. Errors: ${data.errors || 0}`, 'success');
      switchTabLocal('batched-import-log');
    } catch (e) {
      console.error(e);
      toast(e.message || 'Import failed', 'error');
    }
  });

  refreshBtn?.addEventListener('click', () => {
    toast('Refreshing batched deposits...', 'info');
  });
});

function toast(message, type = 'info') {
  const container = document.querySelector('.toast-container');
  if (!container) return alert(message);
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-content">${message}</div><button class="toast-close">&times;</button>`;
  el.querySelector('.toast-close').onclick = () => el.remove();
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
