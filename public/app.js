const domainsArea = document.getElementById('domainsArea');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const clearBtn = document.getElementById('clearBtn');
const progress = document.getElementById('progress');
const table = document.getElementById('resultsTable');
const resultsTableBody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
const downloadBtn = document.getElementById('downloadBtn');

let lastResults = [];

console.log('app.js loaded');

fileInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const text = await f.text();
  domainsArea.value = text.trim();
});

clearBtn.addEventListener('click', () => {
  domainsArea.value = '';
  resultsTableBody.innerHTML = '';
  progress.textContent = '';
  downloadBtn.disabled = true;
  lastResults = [];
});

startBtn.addEventListener('click', async () => {
  const raw = domainsArea.value || '';
  const items = raw
    .split(/\r?\n|,/)
    .map(s => s.trim())
    .filter(Boolean);

  console.log('parsed domains:', items);
  if (!items.length) {
    alert('No domains found — enter one domain per line or comma-separated.');
    return;
  }

  progress.textContent = `sending ${items.length} domain(s) to server...`;
  startBtn.disabled = true;
  resultsTableBody.innerHTML = '';
  downloadBtn.disabled = true;
  lastResults = [];

  try {
    const resp = await fetch('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: items })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || ('server returned ' + resp.status));

    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      progress.textContent = 'server responded but returned no results.';
      startBtn.disabled = false;
      return;
    }

    lastResults = results;
    renderResults(results);
    progress.textContent = `done — checked ${results.length} domain(s)`;
    downloadBtn.disabled = results.length === 0;
    startBtn.disabled = false;

  } catch (err) {
    startBtn.disabled = false;
    console.error('Fetch error:', err);
    progress.textContent = 'error: ' + err.message;
    alert('Check failed: ' + err.message + '. See Console for details.');
  }
});

function renderResults(results) {
  resultsTableBody.innerHTML = '';
  results.forEach((r, i) => {
    const tr = document.createElement('tr');
    const reachableText = r.reachable ? 'yes' : 'no';
    tr.className = r.reachable ? 'reachable' : 'unreachable';
    const statusText = r.status ?? (r.error || '');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(r.domain || '')}</td>
      <td>${escapeHtml(r.url || '')}</td>
      <td>${reachableText}</td>
      <td>${escapeHtml(statusText)}</td>
      <td>${escapeHtml(r.finalUrl || '')}</td>
    `;
    resultsTableBody.appendChild(tr);
  });
}

function escapeHtml(s){ 
  s = s == null ? '' : String(s);  // convert null/number to string
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); 
}


downloadBtn.addEventListener('click', () => {
  if (!lastResults.length) return;
  const header = ['domain','checked_url','reachable','status','final_url'];
  const rows = [header.join(',')];
  for (const r of lastResults) {
    const row = [
      csvEscape(r.domain), csvEscape(r.url || ''), (r.reachable ? 'yes' : 'no'),
      csvEscape(r.status || (r.error || '')), csvEscape(r.finalUrl || '')
    ];
    rows.push(row.join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'domain-statuses.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

function csvEscape(v){ if (v == null) return ''; v = String(v); if (v.includes(',') || v.includes('"') || v.includes('\n')) { return '"' + v.replace(/"/g,'""') + '"'; } return v; }
