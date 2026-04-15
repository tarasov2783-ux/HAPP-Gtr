// ========== Клиенты ==========
let allClients = [];
let serversList = [];

async function loadAllClients() {
  console.log('loadAllClients started');
  try {
    const [clientsData, linksData] = await Promise.all([
      window.api('/api/all-clients'),
      window.api('/api/admin/links')
    ]);
    
    console.log('clientsData:', clientsData);
    allClients = clientsData?.clients || [];
    serversList = clientsData?.servers || [];
    
    const links = linksData?.items || [];
    const tokenMap = {};
    for (const link of links) {
      if (link.clientInfo && link.clientInfo.clientId) {
        tokenMap[link.clientInfo.clientId] = link.token;
      }
    }
    
    for (const client of allClients) {
      client.token = tokenMap[client.client_id] || '';
      if (!client.server_id && client.server_name) {
        const server = serversList.find(s => s.name === client.server_name);
        if (server) client.server_id = server.id;
      }
    }
    
    // Заполняем фильтр серверов
    const filterSelect = document.getElementById('serverFilterSelect');
    if (filterSelect && serversList.length) {
      filterSelect.innerHTML = '<option value="all">Все серверы</option>' + 
        serversList.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      filterSelect.onchange = () => renderClients();
    }
    
    renderClients();
  } catch(e) {
    console.error('loadAllClients error:', e);
    const tbody = document.getElementById('clientsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty">Ошибка: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function renderClients() {
  console.log('renderClients, count:', allClients.length);
  const search = (document.getElementById('clientSearchInput')?.value || '').toLowerCase();
  const serverFilter = document.getElementById('serverFilterSelect')?.value || 'all';
  
  let filtered = [...allClients];
  if (search) {
    filtered = filtered.filter(c => c.email && c.email.toLowerCase().includes(search));
  }
  if (serverFilter !== 'all') {
    filtered = filtered.filter(c => c.server_id === serverFilter || c.serverId === serverFilter);
  }
  
  // Обновляем статистику
  const total = filtered.length;
  const active = filtered.filter(c => c.enable).length;
  const disabled = total - active;
  const totalTraffic = filtered.reduce((sum, c) => sum + (c.used_gb || 0), 0);
  
  const totalClientsEl = document.getElementById('totalClients');
  const activeClientsEl = document.getElementById('activeClients');
  const disabledClientsEl = document.getElementById('disabledClients');
  const totalTrafficEl = document.getElementById('totalTraffic');
  const clientStatsEl = document.getElementById('clientStats');
  
  if (totalClientsEl) totalClientsEl.textContent = total;
  if (activeClientsEl) activeClientsEl.textContent = active;
  if (disabledClientsEl) disabledClientsEl.textContent = disabled;
  if (totalTrafficEl) totalTrafficEl.textContent = totalTraffic.toFixed(2) + ' GB';
  if (clientStatsEl) clientStatsEl.textContent = `Клиентов: ${total}`;
  
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;
  
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Нет клиентов</td></tr>';
    return;
  }
  
  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const basePath = window.basePath || '';
  
  tbody.innerHTML = filtered.map(c => {
    const percent = c.usage_percent || 0;
    let progressClass = '';
    if (percent > 90) progressClass = 'danger';
    else if (percent > 70) progressClass = 'warning';
    
    const statusBadge = c.enable ? '<span class="badge badge-enabled">Активен</span>' : '<span class="badge badge-disabled">Отключен</span>';
    const expiry = (c.expiry_date && c.expiry_date !== '0' && c.expiry_date !== 'null') 
      ? new Date(c.expiry_date).toLocaleDateString('ru-RU') 
      : '∞';
    const comment = c.comment || '';
    const clientId = c.client_id;
    const serverId = c.server_id || c.serverId;
    const inboundId = c.inbound_id;
    const activationUrl = c.token ? `${baseUrl}${basePath}/r/${c.token}` : '';
    const subId = c.sub_id || c.email || '';
    
    return `
      <tr data-client-id="${clientId}" data-server-id="${serverId}" data-inbound-id="${inboundId}">
        <td><strong>${escapeHtml(c.inbound_name)}</strong><br><small class="muted">${c.protocol}:${c.port}</small></td>
        <td><strong>${escapeHtml(c.email)}</strong>${comment ? `<br><small class="text-muted">📝 ${escapeHtml(comment)}</small>` : ''}</td>
        <td>${c.used_gb?.toFixed(1)} / ${c.total_gb?.toFixed(1)} GB</td>
        <td><div class="progress-bar"><div class="progress-fill ${progressClass}" style="width: ${Math.min(percent, 100)}%"></div></div><small class="muted">${percent}%</small></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">
            <label class="toggle-switch" style="margin: 0;">
              <input type="checkbox" class="client-toggle" data-client-id="${clientId}" data-server-id="${serverId}" data-inbound-id="${inboundId}" ${c.enable ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <span class="status-text">${statusBadge}</span>
          </div>
        </td>
        <td>${expiry}</td>
        <td>
          <div class="flex" style="gap: 4px;">
            <button class="btn btn-secondary btn-sm edit-client" 
              data-client-id="${clientId}" 
              data-server-id="${serverId}" 
              data-inbound-id="${inboundId}"
              data-email="${escapeHtml(c.email)}"
              data-sub-url="${escapeHtml(subId)}"
              data-traffic="${c.total_gb}"
              data-expiry="${c.expiry_date ? c.expiry_date.split('T')[0] : ''}"
              data-comment="${escapeHtml(comment)}"
              title="Редактировать">✏️</button>
            <button class="btn btn-danger btn-sm delete-client" 
              data-client-id="${clientId}" 
              data-server-id="${serverId}" 
              data-inbound-id="${inboundId}"
              data-email="${escapeHtml(c.email)}"
              title="Удалить">🗑️</button>
            <button class="btn btn-secondary btn-sm copy-activation-link" 
              data-url="${activationUrl}" 
              data-email="${c.email}" 
              title="Копировать ссылку активации">🔗</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  // Привязываем обработчики после вставки HTML
  attachToggleHandlers();
  attachEditHandlers();
  attachDeleteHandlers();
  attachCopyHandlers();
}

function attachToggleHandlers() {
  document.querySelectorAll('.client-toggle').forEach(toggle => {
    toggle.removeEventListener('change', toggle._listener);
    const listener = async (e) => {
      const clientId = toggle.dataset.clientId;
      const serverId = toggle.dataset.serverId;
      const inboundId = toggle.dataset.inboundId;
      const enable = toggle.checked;
      toggle.disabled = true;
      try {
        await window.api(`/api/client/${serverId}/${inboundId}/${clientId}/toggle`, { 
          method: 'POST', 
          body: JSON.stringify({ enable }) 
        });
        const client = allClients.find(c => c.client_id === clientId);
        if (client) client.enable = enable;
      } catch(e) { 
        alert('Ошибка: ' + e.message); 
        toggle.checked = !enable; 
      } finally { 
        toggle.disabled = false; 
      }
    };
    toggle._listener = listener;
    toggle.addEventListener('change', listener);
  });
}

function attachEditHandlers() {
  document.querySelectorAll('.edit-client').forEach(btn => {
    btn.removeEventListener('click', btn._editListener);
    const editListener = (e) => {
      e.preventDefault();
      if (typeof window.openEditClientModal === 'function') {
        window.openEditClientModal(
          btn.dataset.clientId,
          btn.dataset.serverId,
          btn.dataset.inboundId,
          btn.dataset.email,
          btn.dataset.subUrl,
          btn.dataset.traffic,
          btn.dataset.expiry,
          btn.dataset.comment
        );
      }
    };
    btn._editListener = editListener;
    btn.addEventListener('click', editListener);
  });
}

function attachDeleteHandlers() {
  document.querySelectorAll('.delete-client').forEach(btn => {
    btn.removeEventListener('click', btn._deleteListener);
    const deleteListener = async (e) => {
      e.preventDefault();
      const clientId = btn.dataset.clientId;
      const serverId = btn.dataset.serverId;
      const inboundId = btn.dataset.inboundId;
      const email = btn.dataset.email;
      if (!confirm(`Удалить клиента "${email}"?`)) return;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        await window.api(`/api/client/${serverId}/${inboundId}/${clientId}`, { method: 'DELETE' });
        alert('Клиент удален!');
        loadAllClients();
      } catch(e) { alert('Ошибка: ' + e.message); }
      finally { btn.disabled = false; btn.textContent = '🗑️'; }
    };
    btn._deleteListener = deleteListener;
    btn.addEventListener('click', deleteListener);
  });
}

function attachCopyHandlers() {
  document.querySelectorAll('.copy-activation-link').forEach(btn => {
    btn.removeEventListener('click', btn._listener);
    const listener = async (e) => {
      const url = btn.dataset.url;
      const email = btn.dataset.email;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        if (url) {
          await navigator.clipboard.writeText(url);
          btn.textContent = '✅';
        } else {
          await navigator.clipboard.writeText(email);
          btn.textContent = '📧';
        }
        setTimeout(() => { btn.textContent = '🔗'; btn.disabled = false; }, 1500);
      } catch(e) {
        btn.textContent = '❌';
        setTimeout(() => { btn.textContent = '🔗'; btn.disabled = false; }, 1500);
      }
    };
    btn._listener = listener;
    btn.addEventListener('click', listener);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Инициализация событий
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('clientSearchInput');
  const filterSelect = document.getElementById('serverFilterSelect');
  const refreshBtn = document.getElementById('refreshClientsBtn');
  
  if (searchInput) searchInput.addEventListener('input', () => renderClients());
  if (filterSelect) filterSelect.addEventListener('change', () => renderClients());
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadAllClients());
  
  // Если вкладка клиентов активна, загружаем
  if (document.getElementById('clientsTab')?.classList.contains('active')) {
    loadAllClients();
  }
});

console.log('clients.js loaded');
