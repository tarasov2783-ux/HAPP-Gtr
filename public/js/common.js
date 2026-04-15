// Общие функции
if (typeof window.basePath === 'undefined') {
  window.basePath = '/happ';
}

window.api = async function(url, options = {}) {
  const credentials = btoa('admin:changeme123');
  const fullUrl = window.basePath + url;
  console.log('API call:', fullUrl, options);
  
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('API error:', res.status, errorText);
    throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
  }
  
  const data = await res.json();
  console.log('API response:', url, data);
  return data;
};

window.esc = function(s) {
  if (!s) return '—';
  return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
};

window.formatDate = function(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('ru-RU');
};

console.log('common.js loaded, basePath:', window.basePath);
