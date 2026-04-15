// ========== Создание клиента ==========
let currentToken = null;

async function loadServerSelect() {
  try {
    console.log('Loading servers for create tab...');
    const data = await window.api('/api/servers');
    console.log('Servers data:', data);
    
    const serverSelect = document.getElementById('createServerId');
    if (!serverSelect) {
      console.error('createServerId element not found!');
      return;
    }
    
    if (!data.servers || data.servers.length === 0) {
      console.warn('No servers found');
      serverSelect.innerHTML = '<option value="">Нет серверов - добавьте в настройках</option>';
      return;
    }
    
    let options = '<option value="">Выберите сервер</option>';
    for (let i = 0; i < data.servers.length; i++) {
      const s = data.servers[i];
      options += '<option value="' + s.id + '">' + window.esc(s.name) + '</option>';
    }
    serverSelect.innerHTML = options;
    
    serverSelect.onchange = function() {
      const server = data.servers.find(function(s) { return s.id === serverSelect.value; });
      if (server) {
        const inboundSelect = document.getElementById('createInboundId');
        if (server.inbounds && server.inbounds.length > 0) {
          let inboundOptions = '';
          for (let i = 0; i < server.inbounds.length; i++) {
            const ib = server.inbounds[i];
            inboundOptions += '<option value="' + ib.id + '">' + window.esc(ib.name) + ' (' + ib.protocol + ':' + ib.port + ')</option>';
          }
          inboundSelect.innerHTML = inboundOptions;
        } else {
          inboundSelect.innerHTML = '<option value="">Нет доступных inbound</option>';
        }
        
        // Подставляем значения по умолчанию из сервера
        const trafficGB = document.getElementById('createTrafficGB');
        const expiryDays = document.getElementById('createExpiryDays');
        
        if (trafficGB) trafficGB.value = server.defaultTrafficGB || 100;
        if (expiryDays) expiryDays.value = server.defaultExpiryDays !== undefined ? server.defaultExpiryDays : 30;
        
        console.log('Set default values: traffic=' + (server.defaultTrafficGB || 100) + ', expiry=' + (server.defaultExpiryDays !== undefined ? server.defaultExpiryDays : 30));
      }
    };
    
    // Если уже выбран сервер, применяем значения
    if (serverSelect.value) {
      serverSelect.onchange();
    }
  } catch(e) {
    console.error('Failed to load servers:', e);
    const serverSelect = document.getElementById('createServerId');
    if (serverSelect) {
      serverSelect.innerHTML = '<option value="">Ошибка загрузки серверов</option>';
    }
  }
}

async function showQR(token) {
  const modal = document.getElementById('qrModal');
  const qrImage = document.getElementById('qrImage');
  const qrLinkText = document.getElementById('qrLinkText');
  const baseUrl = window.location.protocol + '//' + window.location.host;
  const pageUrl = baseUrl + window.basePath + '/r/' + token;
  qrLinkText.textContent = pageUrl;
  qrImage.src = window.basePath + '/api/qrcode-page/' + token + '?t=' + Date.now();
  modal.classList.add('active');
  qrLinkText.onclick = function() { 
    navigator.clipboard.writeText(pageUrl); 
    alert('Ссылка скопирована!'); 
  };
}

function closeQRModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.remove('active');
}

document.getElementById('createClientForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Создание...';
  
  const data = {
    serverId: document.getElementById('createServerId').value,
    inboundId: parseInt(document.getElementById('createInboundId').value),
    username: document.getElementById('createUsername').value,
    trafficGB: parseInt(document.getElementById('createTrafficGB').value),
    expiryDays: parseInt(document.getElementById('createExpiryDays').value),
    maxActivations: parseInt(document.getElementById('createMaxActivations').value)
  };
  
  console.log('Creating client with data:', data);
  
  if (!data.serverId || !data.inboundId || !data.username) {
    alert('Заполните все поля!');
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    return;
  }
  
  try {
    const result = await window.api('/api/create-client', { method: 'POST', body: JSON.stringify(data) });
    console.log('Create result:', result);
    if (result.ok) {
      currentToken = result.onceLink.split('/').pop();
      document.getElementById('resultHappLink').textContent = result.happLink;
      document.getElementById('resultSubUrl').textContent = result.subscriptionUrl;
      document.getElementById('openResultLink').href = result.onceLink;
      document.getElementById('createResult').style.display = 'block';
      document.getElementById('copyResultLink').onclick = function() { 
        navigator.clipboard.writeText(result.happLink); 
        alert('Скопировано!'); 
      };
      document.getElementById('showQrBtn').onclick = function() { showQR(currentToken); };
      document.getElementById('createUsername').value = '';
      if (typeof loadAllClients === 'function') loadAllClients();
      if (typeof loadServers === 'function') loadServers();
    } else {
      alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
    }
  } catch(e) {
    console.error('Create error:', e);
    alert('Ошибка: ' + e.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

window.closeQRModal = closeQRModal;
window.loadServerSelect = loadServerSelect;

console.log('create.js loaded');
