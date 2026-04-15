// ========== Серверы ==========
async function loadServers() {
  try {
    const adminData = await window.api('/api/admin/servers');
    const servers = adminData.servers || [];
    const container = document.getElementById('serversList');
    if (!container) return;
    
    if (!servers.length) {
      container.innerHTML = '<div class="empty">Нет настроенных серверов. Нажмите "+ Добавить сервер"</div>';
      return;
    }
    
    const serversWithInbounds = [];
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      try {
        const serverData = await window.api('/api/servers');
        const serverInfo = serverData.servers?.find(function(s) { return s.id === server.id; });
        serversWithInbounds.push({
          id: server.id,
          name: server.name,
          address: server.address,
          sub_url: server.sub_url,
          username: server.username,
          defaultTrafficGB: server.defaultTrafficGB,
          defaultExpiryDays: server.defaultExpiryDays,
          inbounds: serverInfo?.inbounds || []
        });
      } catch(e) {
        serversWithInbounds.push({
          id: server.id,
          name: server.name,
          address: server.address,
          sub_url: server.sub_url,
          username: server.username,
          defaultTrafficGB: server.defaultTrafficGB,
          defaultExpiryDays: server.defaultExpiryDays,
          inbounds: []
        });
      }
    }
    
    let html = '';
    for (let i = 0; i < serversWithInbounds.length; i++) {
      const s = serversWithInbounds[i];
      html += '<div class="group-card">';
      html += '<div class="group-head">';
      html += '<div>';
      html += '<strong>' + window.esc(s.name) + '</strong>';
      html += '<div class="mono">' + window.esc(s.address) + '</div>';
      if (s.sub_url) {
        html += '<div class="mono" style="color: #10b981;">Подписки: ' + window.esc(s.sub_url) + '</div>';
      }
      html += '</div>';
      html += '<div style="display: flex; gap: 8px;">';
      html += '<button class="btn-secondary btn-sm" onclick="window.editServer(\'' + s.id + '\')">✏️</button>';
      html += '<button class="btn-danger btn-sm" onclick="window.deleteServer(\'' + s.id + '\')">🗑️</button>';
      html += '</div>';
      html += '</div>';
      html += '<div class="facts">';
      html += '<div class="fact fact-good"><div class="k">Inbound\'ов</div><div class="v">' + (s.inbounds?.length || 0) + '</div></div>';
      html += '<div class="fact fact-good"><div class="k">Трафик по умолч.</div><div class="v">' + s.defaultTrafficGB + ' GB</div></div>';
      html += '<div class="fact fact-good"><div class="k">Срок по умолч.</div><div class="v">' + s.defaultExpiryDays + ' дн.</div></div>';
      html += '</div>';
      
      if (s.inbounds && s.inbounds.length > 0) {
        html += '<div class="links-list" style="margin-top: 12px;">';
        html += '<div class="link-card">';
        html += '<div class="link-head"><div><strong>📡 Доступные inbound\'ы</strong></div></div>';
        for (let j = 0; j < s.inbounds.length; j++) {
          const ib = s.inbounds[j];
          html += '<div class="metrics-row">';
          html += '<span class="pill pill-cyan">' + window.esc(ib.name) + '</span>';
          html += '<span>' + ib.protocol + ':' + ib.port + '</span>';
          html += '</div>';
        }
        html += '</div>';
        html += '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  } catch(e) {
    console.error('Failed to load servers:', e);
    const container = document.getElementById('serversList');
    if (container) {
      container.innerHTML = '<div class="empty">Ошибка: ' + window.esc(e.message) + '</div>';
    }
  }
}

async function addServer(data) {
  return await window.api('/api/admin/servers', { method: 'POST', body: JSON.stringify(data) });
}

async function updateServer(id, data) {
  return await window.api('/api/admin/servers/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

async function deleteServer(id) {
  if (!confirm('Удалить сервер? Это действие необратимо.')) return;
  try {
    await window.api('/api/admin/servers/' + id, { method: 'DELETE' });
    loadServers();
    if (typeof loadServerSelect === 'function') loadServerSelect();
  } catch(e) { alert(e.message); }
}

function editServer(id) {
  window.api('/api/admin/servers').then(function(data) {
    const server = data.servers.find(function(s) { return s.id === id; });
    if (server) {
      const modalTitle = document.getElementById('serverModalTitle');
      const serverId = document.getElementById('serverId');
      const serverName = document.getElementById('serverName');
      const serverAddress = document.getElementById('serverAddress');
      const serverSubUrl = document.getElementById('serverSubUrl');
      const serverUsername = document.getElementById('serverUsername');
      const serverPassword = document.getElementById('serverPassword');
      const serverTraffic = document.getElementById('serverTraffic');
      const serverExpiry = document.getElementById('serverExpiry');
      const modal = document.getElementById('serverModal');
      
      if (modalTitle) modalTitle.textContent = '✏️ Редактировать сервер';
      if (serverId) serverId.value = server.id;
      if (serverName) serverName.value = server.name;
      if (serverAddress) serverAddress.value = server.address;
      if (serverSubUrl) serverSubUrl.value = server.sub_url || '';
      if (serverUsername) serverUsername.value = server.username;
      if (serverPassword) serverPassword.value = server.password;
      if (serverTraffic) serverTraffic.value = server.defaultTrafficGB;
      if (serverExpiry) serverExpiry.value = server.defaultExpiryDays;
      if (modal) modal.classList.add('active');
    }
  }).catch(function(e) { console.error('Error loading server:', e); });
}

function closeServerModal() {
  const modal = document.getElementById('serverModal');
  const form = document.getElementById('serverForm');
  const serverId = document.getElementById('serverId');
  const modalTitle = document.getElementById('serverModalTitle');
  
  if (modal) modal.classList.remove('active');
  if (form) form.reset();
  if (serverId) serverId.value = '';
  if (modalTitle) modalTitle.textContent = '➕ Добавить сервер';
}

document.getElementById('serverForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const id = document.getElementById('serverId')?.value;
  const data = {
    name: document.getElementById('serverName')?.value || '',
    address: document.getElementById('serverAddress')?.value || '',
    sub_url: document.getElementById('serverSubUrl')?.value || '',
    username: document.getElementById('serverUsername')?.value || '',
    password: document.getElementById('serverPassword')?.value || '',
    defaultTrafficGB: parseInt(document.getElementById('serverTraffic')?.value || 100),
    defaultExpiryDays: parseInt(document.getElementById('serverExpiry')?.value || 30)
  };
  try {
    if (id) {
      await updateServer(id, data);
      alert('Сервер обновлен!');
    } else {
      await addServer(data);
      alert('Сервер добавлен!');
    }
    closeServerModal();
    loadServers();
    if (typeof loadServerSelect === 'function') loadServerSelect();
  } catch(e) { alert('Ошибка: ' + e.message); }
});

document.getElementById('addServerBtn')?.addEventListener('click', function() {
  const modalTitle = document.getElementById('serverModalTitle');
  const serverId = document.getElementById('serverId');
  const form = document.getElementById('serverForm');
  const modal = document.getElementById('serverModal');
  
  if (modalTitle) modalTitle.textContent = '➕ Добавить сервер';
  if (serverId) serverId.value = '';
  if (form) form.reset();
  if (modal) modal.classList.add('active');
});

document.getElementById('refreshServersBtn')?.addEventListener('click', loadServers);

window.editServer = editServer;
window.deleteServer = deleteServer;
window.closeServerModal = closeServerModal;
