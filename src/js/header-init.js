import { API_BASE } from './app-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const dbStatusIndicator = document.getElementById('db-status-indicator');
    const entitySelector = document.getElementById('entity-selector');
    const logoutBtn = document.getElementById('btnLogout');

    async function checkDatabaseConnection() {
        try {
            const response = await fetch(`${API_BASE}/api/status`);
            const data = await response.json();
            if (data.status === 'ok') {
                dbStatusIndicator.textContent = 'DB Online';
                dbStatusIndicator.classList.remove('offline');
                dbStatusIndicator.classList.add('online');
            } else {
                throw new Error('Database connection failed');
            }
        } catch (error) {
            dbStatusIndicator.textContent = 'DB Offline';
            dbStatusIndicator.classList.remove('online');
            dbStatusIndicator.classList.add('offline');
        }
    }

    async function loadEntities() {
        try {
            const response = await fetch(`${API_BASE}/api/entities`);
            const entities = await response.json();
            entitySelector.innerHTML = '';
            entities.forEach(entity => {
                const option = document.createElement('option');
                option.value = entity.id;
                option.textContent = entity.name;
                entitySelector.appendChild(option);
            });
        } catch (error) {
            entitySelector.innerHTML = '<option value="">Error loading entities</option>';
        }
    }

    function logoutUser() {
        // This should be replaced with a proper API call to invalidate the session
        console.log('Logging out...');
        window.location.href = '/login.html';
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    checkDatabaseConnection();
    loadEntities();
});
