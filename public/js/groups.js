// ========== Группы ==========
let allGroups = [];

async function loadGroupsData() {
  try {
    const data = await window.api('/api/admin/groups');
    allGroups = data?.groups || [];
    renderStats(allGroups);
    renderViolators(allGroups);
    renderGroups(allGroups);
  } catch(e) {
    console.error('Failed to load groups:', e);
  }
}

function isGroupViolator(group) {
  return Number(group?.foreignDeviceCountTotal || 0) > 0 || group?.violatorLinks > 0;
}

function renderStats(groups) {
  const totalLinks = groups.reduce((s, g) => s + Number(g?.linksCount || 0), 0);
  const totalActivations = groups.reduce((s, g) => s + Number(g?.usedCountTotal || 0), 0);
  const totalIssued = groups.reduce((s, g) => s + Number(g?.maxActivationsTotal || 0), 0);
  const totalDevices = groups.reduce((s, g) => s + Number(g?.uniqueDevices || 0), 0);
  const totalViolatorGroups = groups.filter(isGroupViolator).length;

  const statGroups = document.getElementById('statGroups');
  const statLinks = document.getElementById('statLinks');
  const statIssued = document.getElementById('statIssued');
  const statActivations = document.getElementById('statActivations');
  const statDevices = document.getElementById('statDevices');
  const statViolators = document.getElementById('statViolators');
  
  if (statGroups) statGroups.textContent = groups.length;
  if (statLinks) statLinks.textContent = totalLinks;
  if (statIssued) statIssued.textContent = totalIssued;
  if (statActivations) statActivations.textContent = totalActivations;
  if (statDevices) statDevices.textContent = totalDevices;
  if (statViolators) statViolators.textContent = totalViolatorGroups;
}

function renderViolators(groups) {
  const violators = groups.filter(isGroupViolator);
  const container = document.getElementById('violatorsList');
  if (!container) return;
  if (!violators.length) {
    container.innerHTML = '<div class="empty">Нарушителей пока нет.</div>';
    return;
  }
  container.innerHTML = violators.map(group => `
    <div class="violator-card">
      <div><strong>${window.esc(group?.username)}</strong></div>
      <div class="mono">${window.esc(group?.subscriptionUrl)}</div>
      <div class="section-gap">
        Активаций всего: <strong>${Number(group?.usedCountTotal || 0)}</strong><br>
        Устройств: <strong>${Number(group?.uniqueDevices || 0)}</strong><br>
        Нарушений: <strong>${Number(group?.foreignDeviceCountTotal || 0)}</strong><br>
        Ссылок: <strong>${Number(group?.linksCount || 0)}</strong>
      </div>
    </div>
  `).join('');
}

async function deleteActivation(linkId, index) {
  if (!confirm('Удалить эту активацию?')) return;
  try {
    await window.api(`/api/admin/link/${encodeURIComponent(linkId)}/activations/${index}`, { method: 'DELETE' });
    await loadGroupsData();
  } catch(e) { alert(e.message); }
}

async function deleteViolation(linkId, index) {
  if (!confirm('Удалить это нарушение?')) return;
  try {
    await window.api(`/api/admin/link/${encodeURIComponent(linkId)}/violations/${index}`, { method: 'DELETE' });
    await loadGroupsData();
  } catch(e) { alert(e.message); }
}

function usageItemHtml(usage, index, linkId, isViolation) {
  return `
    <div class="usage-item ${isViolation ? 'violation' : ''}">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap;">
        <div>
          <div><strong>#${index + 1}</strong> ${isViolation ? '<span class="pill pill-danger">foreign</span>' : '<span class="pill">same</span>'}</div>
          <div class="hint">${window.esc(window.formatDate(usage?.at))}</div>
        </div>
        <div>
          <button class="btn-danger" onclick="${isViolation ? `deleteViolation('${linkId}', ${index})` : `deleteActivation('${linkId}', ${index})`}">Удалить</button>
        </div>
      </div>
      <div class="usage-meta">
        <div><strong>IP:</strong> ${window.esc(usage?.ip)}</div>
        <div><strong>Browser:</strong> ${window.esc(usage?.browser)}</div>
        <div><strong>OS:</strong> ${window.esc(usage?.os)}</div>
        <div><strong>Device:</strong> ${window.esc(usage?.deviceType)}</div>
      </div>
      <div class="hint" style="margin-top:8px;">
        stableDeviceKey: <span class="mono">${window.esc(usage?.deviceKey)}</span>
      </div>
    </div>
  `;
}

function linkCardHtml(link, idx) {
  const foreignCount = Number(link?.foreignDeviceCount || 0);
  const uniqueDevices = Number(link?.uniqueDevices || 0);
  const isViolator = foreignCount > 0 || link?.isViolator;
  const contentId = `content-${link?.id}-${idx}`;
  const devicesId = `devices-${link?.id}-${idx}`;
  const activations = link?.activations || [];
  const violations = link?.violations || [];

  return `
    <div class="link-card">
      <div class="link-head">
        <div class="link-title">
          <div><strong>${window.esc(link?.token)}</strong></div>
          <div class="hint">Создана: ${window.esc(window.formatDate(link?.createdAt))}</div>
        </div>
        <div>${isViolator ? '<span class="pill pill-danger">violator</span>' : '<span class="pill">ok</span>'}</div>
      </div>
      <div class="metrics-row">
        <div class="metric-item"><span class="metric-label">Акт: ${Number(link?.usedCount || 0)}</span></div>
        <div class="metric-item"><span class="metric-label">Лимит: ${Number(link?.maxActivations || 0)}</span></div>
        <div class="metric-item"><span class="metric-label">Устр: ${uniqueDevices}</span></div>
        <div class="metric-item"><span class="metric-label">Чужие: ${foreignCount}</span></div>
        <div class="metric-item"><span class="metric-label">Осталось: ${Number(link?.remaining || 0)}</span></div>
        <button class="spoiler-btn" onclick="window.toggleContent('${contentId}', this)">Показать</button>
      </div>
      <div id="${contentId}" class="hidden">
        <div class="link-actions">
          <button onclick="window.toggleDevices('${devicesId}')">Показать устройства</button>
          <button class="btn-danger" onclick="window.resetLink('${link?.id}')">Сбросить</button>
          <button class="btn-danger" onclick="window.deleteLink('${link?.id}')">Удалить</button>
        </div>
        <div id="${devicesId}" class="link-details">
          <div class="usage-list">
            ${activations.map((a, i) => usageItemHtml(a, i, link?.id, false)).join('')}
            ${violations.map((v, i) => usageItemHtml(v, i, link?.id, true)).join('')}
            ${!activations.length && !violations.length ? '<div class="empty">Использований пока нет</div>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function groupCardHtml(group, index) {
  const violator = isGroupViolator(group);
  const links = group?.links || [];
  const foreignCount = Number(group?.foreignDeviceCountTotal || 0);
  const uniqueDevices = Number(group?.uniqueDevices || 0);

  return `
    <div class="group-card">
      <div class="group-head">
        <div class="group-title">
          <div><strong>${window.esc(group?.username)}</strong></div>
          <div class="mono">${window.esc(group?.subscriptionUrl)}</div>
          <div class="hint">Последняя: ${window.esc(window.formatDate(group?.lastUsedAt))}</div>
        </div>
        <div>${violator ? '<span class="pill pill-danger">violator</span>' : '<span class="pill">ok</span>'}</div>
      </div>
      <div class="facts">
        <div class="fact fact-good"><div class="k">Ссылок</div><div class="v">${Number(group?.linksCount || 0)}</div></div>
        <div class="fact"><div class="k">Активаций</div><div class="v">${Number(group?.usedCountTotal || 0)}</div></div>
        <div class="fact"><div class="k">Устр.</div><div class="v">${uniqueDevices}</div></div>
        <div class="fact"><div class="k">Чужих</div><div class="v">${foreignCount}</div></div>
        <div class="fact ${group?.violatorLinks > 0 ? 'fact-bad' : 'fact-good'}"><div class="k">Наруш.</div><div class="v">${Number(group?.violatorLinks || 0)}</div></div>
        <div class="fact"><div class="k">Статус</div><div class="v">${violator ? 'violator' : 'ok'}</div></div>
      </div>
      <div class="links-list">
        ${links.map((link, linkIndex) => linkCardHtml(link, `${index}-${linkIndex}`)).join('')}
      </div>
    </div>
  `;
}

function filterGroups(groups, searchTerm) {
  if (!searchTerm) return groups;
  const term = searchTerm.toLowerCase();
  return groups.filter(g => 
    (g.username && g.username.toLowerCase().includes(term)) ||
    (g.subscriptionUrl && g.subscriptionUrl.toLowerCase().includes(term))
  );
}

function renderGroups(groups) {
  const searchTerm = document.getElementById('searchInput')?.value || '';
  const filtered = filterGroups(groups, searchTerm);
  const searchStats = document.getElementById('searchStats');
  if (searchStats) searchStats.textContent = `Найдено: ${filtered.length} из ${groups.length}`;
  
  const container = document.getElementById('groupsList');
  if (!container) return;
  if (!filtered.length) {
    container.innerHTML = '<div class="empty">Ничего не найдено</div>';
    return;
  }
  const sorted = [...filtered].sort((a,b) => {
    const av = isGroupViolator(a) ? 1 : 0;
    const bv = isGroupViolator(b) ? 1 : 0;
    if (av !== bv) return bv - av;
    return new Date(b?.lastUsedAt || 0) - new Date(a?.lastUsedAt || 0);
  });
  container.innerHTML = sorted.map((g, i) => groupCardHtml(g, i)).join('');
}

document.getElementById('searchInput')?.addEventListener('input', () => renderGroups(allGroups));

window.loadGroupsData = loadGroupsData;
window.toggleContent = function(id, btn) {
  const content = document.getElementById(id);
  if (content) {
    content.classList.toggle('hidden');
    btn.textContent = content.classList.contains('hidden') ? 'Показать' : 'Скрыть';
  }
};
window.toggleDevices = function(id) {
  document.getElementById(id)?.classList.toggle('open');
};
window.deleteLink = async function(id) {
  if (!confirm('Удалить ссылку?')) return;
  try {
    await window.api(`/api/admin/link/${id}`, { method: 'DELETE' });
    loadGroupsData();
  } catch(e) { alert(e.message); }
};
window.resetLink = async function(id) {
  if (!confirm('Сбросить все устройства?')) return;
  try {
    await window.api(`/api/admin/link/${id}/reset`, { method: 'DELETE' });
    loadGroupsData();
  } catch(e) { alert(e.message); }
};
