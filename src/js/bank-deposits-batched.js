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
  const listTableBody = document.querySelector('#batched-deposits-table tbody');

  async function loadLastImportLog() {
    try {
      const url = `${API_BASE}/api/bank-deposits/batched/import/last`;
      console.debug('[Batched Deposits] GET last import log', url);
      const res = await fetch(url, { method: 'GET', credentials: 'include' });
      const ctype = res.headers.get('content-type') || '';
      const isJson = ctype.includes('application/json');
      const data = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(data?.error || `Failed to load import log (${res.status})`);

      const rows = Array.isArray(data?.log) ? data.log : [];
      if (!rows.length) return; // keep default empty row
      logTableBody.innerHTML = rows.map((r) => `
        <tr>
          <td>${r.line ?? ''}</td>
          <td>${r.status}</td>
          <td>${r.message || ''}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  async function loadBatchedDeposits() {
    try {
      if (listTableBody) {
        listTableBody.innerHTML = `<tr class="loading-row"><td colspan="7" class="text-center">Loading...</td></tr>`;
      }
      const url = `${API_BASE}/api/bank-deposits?limit=100&status=Submitted`;
      console.debug('[Batched Deposits] GET', url);
      const res = await fetch(url, { method: 'GET', credentials: 'include' });
      const ctype = res.headers.get('content-type') || '';
      const isJson = ctype.includes('application/json');
      const data = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(data?.error || `Failed to load deposits (${res.status})`);

      const rows = Array.isArray(data?.data) ? data.data : [];
      if (!rows.length) {
        listTableBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="text-center">No deposits found.</td></tr>`;
        return;
      }
      listTableBody.innerHTML = rows.map(dep => {
        const date = dep.deposit_date ? new Date(dep.deposit_date).toLocaleDateString() : '-';
        const bank = dep.bank_name ? `${dep.bank_name} - ${dep.account_name || ''}` : (dep.account_name || '-');
        const ref = dep.reference_number || '-';
        const desc = dep.description || '-';
        const amt = formatCurrency(dep.total_amount || 0);
        const status = dep.status || '-';
        const statusClass = `status-${String(status).toLowerCase()}`;
        return `
          <tr>
            <td>${date}</td>
            <td>${bank}</td>
            <td>${ref}</td>
            <td>${desc}</td>
            <td>${amt}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td><a class="action-button" href="bank-deposits.html" title="Open full Deposits">Open</a></td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error(e);
      if (listTableBody) listTableBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="text-center">Failed to load deposits.</td></tr>`;
      toast(e.message || 'Failed to load deposits', 'error');
    }
  }

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
      if (!res.ok) {
        // If server provided a log with row numbers, render it
        const rows = Array.isArray(data?.log) ? data.log : [];
        if (rows.length && logTableBody) {
          logTableBody.innerHTML = rows.map((r) => `
            <tr>
              <td>${r.line ?? ''}</td>
              <td>${r.status || 'Error'}</td>
              <td>${r.message || ''}</td>
            </tr>
          `).join('');
          // Switch to the log tab so the user sees details immediately
          switchTabLocal('batched-import-log');
        }
        throw new Error(data?.error || `Import failed (${res.status})`);
      }

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
      // Refresh list after import
      await loadBatchedDeposits();
      switchTabLocal('batched-import-log');
    } catch (e) {
      console.error(e);
      toast(e.message || 'Import failed', 'error');
    }
  });

  refreshBtn?.addEventListener('click', () => {
    toast('Refreshing batched deposits...', 'info');
    loadBatchedDeposits();
  });

  // Initial load
  await Promise.all([
    loadBatchedDeposits(),
    loadLastImportLog()
  ]);
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

function formatCurrency(amount) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
  } catch {
    const n = Number(amount) || 0;
    return `$${n.toFixed(2)}`;
  }
}
