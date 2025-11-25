// public/app.js — WHOIS + progress bar + preserves your classes and colors reachable/no in-line

const domainsArea = document.getElementById('domainsArea');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const clearBtn = document.getElementById('clearBtn');
const progress = document.getElementById('progress');
const table = document.getElementById('resultsTable');
const resultsTableBody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
const downloadBtn = document.getElementById('downloadBtn');

let lastResults = [];
let fakeProgressInterval = null;
let currentFakePct = 0;

console.log('app.js loaded');

/* ---------- create progress bar UI dynamically (keeps your CSS intact) ---------- */
(function createProgressBar() {
  if (document.getElementById('dsc-progress-wrap')) return;

  const wrap = document.createElement('div');
  wrap.id = 'dsc-progress-wrap';
  wrap.style.marginTop = '8px';
  wrap.style.width = '100%';

  const bar = document.createElement('div');
  bar.id = 'dsc-progress-bar';
  bar.style.width = '100%';
  bar.style.height = '10px';
  bar.style.background = '#eee';
  bar.style.borderRadius = '999px';
  bar.style.overflow = 'hidden';

  const fill = document.createElement('div');
  fill.id = 'dsc-progress-fill';
  fill.style.width = '0%';
  fill.style.height = '100%';
  fill.style.transition = 'width 250ms linear';
  fill.style.background = 'linear-gradient(90deg,#6ad37a,#3aa86b)';

  const meta = document.createElement('div');
  meta.id = 'dsc-progress-meta';
  meta.style.display = 'flex';
  meta.style.justifyContent = 'space-between';
  meta.style.marginTop = '6px';
  meta.style.fontSize = '13px';
  meta.style.color = '#333';

  const msg = document.createElement('div');
  msg.id = 'dsc-progress-msg';
  msg.textContent = 'Idle';

  const pct = document.createElement('div');
  pct.id = 'dsc-progress-pct';
  pct.textContent = '0%';

  bar.appendChild(fill);
  meta.appendChild(msg);
  meta.appendChild(pct);
  wrap.appendChild(bar);
  wrap.appendChild(meta);

  if (progress && progress.parentNode) {
    progress.parentNode.insertBefore(wrap, progress.nextSibling);
  } else {
    document.body.appendChild(wrap);
  }
})();

/* ---------- progress helpers ---------- */
function setProgress(pct, message) {
  const n = Math.max(0, Math.min(100, Math.round(pct)));
  const fill = document.getElementById('dsc-progress-fill');
  const pctEl = document.getElementById('dsc-progress-pct');
  const msgEl = document.getElementById('dsc-progress-msg');
  currentFakePct = Math.max(currentFakePct || 0, n);
  if (fill) fill.style.width = n + '%';
  if (pctEl) pctEl.textContent = n + '%';
  if (msgEl) msgEl.textContent = message || (n < 100 ? 'Working...' : 'Complete');
}

function startFakeProgress() {
  stopFakeProgress();
  currentFakePct = 3;
  setProgress(currentFakePct, 'Starting...');
  fakeProgressInterval = setInterval(() => {
    const increment = Math.max(1, Math.floor((70 - currentFakePct) / 6));
    currentFakePct += increment;
    if (currentFakePct >= 70) currentFakePct = 70;
    setProgress(currentFakePct, 'Checking domains...');
    if (currentFakePct >= 70) clearInterval(fakeProgressInterval);
  }, 300);
}

function stopFakeProgress() {
  if (fakeProgressInterval) {
    clearInterval(fakeProgressInterval);
    fakeProgressInterval = null;
  }
}

/* ---------- file input / clear ---------- */
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
  setProgress(0, 'Idle');
});

/* ---------- main check action (with fake progress while waiting) ---------- */
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
  setProgress(5, `Preparing (${items.length})`);
  startBtn.disabled = true;
  resultsTableBody.innerHTML = '';
  downloadBtn.disabled = true;
  lastResults = [];

  startFakeProgress();

  try {
    const resp = await fetch('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: items })
    });

    stopFakeProgress();

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || ('server returned ' + resp.status));

    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      progress.textContent = 'server responded but returned no results.';
      setProgress(0, 'No results');
      startBtn.disabled = false;
      return;
    }

    lastResults = results;
    // render rows one-by-one while updating progress bar
    await renderResultsWithProgress(results);
    progress.textContent = `done — checked ${results.length} domain(s)`;
    setProgress(100, 'Complete');
    downloadBtn.disabled = results.length === 0;
    startBtn.disabled = false;

  } catch (err) {
    stopFakeProgress();
    startBtn.disabled = false;
    console.error('Fetch error:', err);
    progress.textContent = 'error: ' + err.message;
    setProgress(0, 'Error');
    alert('Check failed: ' + err.message + '. See Console for details.');
  }
});

/* ---------- render rows with progress (uses your exact classes) ---------- */
async function renderResultsWithProgress(results) {
  resultsTableBody.innerHTML = '';
  const total = results.length;
  for (let i = 0; i < total; i++) {
    const r = results[i];
    const tr = document.createElement('tr');

    const reachableText = r.reachable ? 'yes' : 'no';
    const statusText = r.status == null ? (r.error || '') : r.status;

    tr.className = r.reachable ? 'reachable' : 'unreachable';

    // Use your exact innerHTML structure (preserves classes)
    const whoisBtnHtml = r.reachable ? '' : `<button class="whois-btn" data-domain="${escapeHtml(r.domain)}">whois</button>`;

    tr.innerHTML = `
      <td class="table_numbering">${i + 1}</td>
      <td class="domain_names">${escapeHtml(r.domain || '')}</td>
      <td class="dsc-reachable-cell">${reachableText}</td>
      <td class="status">${escapeHtml(statusText)}</td>
      <td class="table_links">${escapeHtml(r.url || '')}</td>
      <td class="table_links">${escapeHtml(r.finalUrl || '')} ${whoisBtnHtml}</td>
    `;

    resultsTableBody.appendChild(tr);

    // Color the reachable cell text while keeping classes intact
    const reachableCell = tr.querySelector('.dsc-reachable-cell');
    if (reachableCell) {
      if (r.reachable) {
        reachableCell.style.color = 'black'; // green
        reachableCell.style.fontWeight = '600';
      } else {
        reachableCell.style.color = '#c11'; // red
        reachableCell.style.fontWeight = '600';
      }
    }

    // small pause so progress is visible for larger lists
    await sleep(40);

    // update progress percent
    const pct = Math.round(((i + 1) / total) * 100);
    setProgress(Math.max(currentFakePct || 5, pct), `Rendering results (${i + 1}/${total})`);
  }
}

/* ---------- delegated WHOIS button handling (detail row insertion) ---------- */
resultsTableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest && e.target.closest('.whois-btn');
  if (!btn) return;
  const domain = btn.getAttribute('data-domain');
  if (!domain) return;

  const row = btn.closest('tr');
  const next = row.nextElementSibling;
  if (next && next.classList.contains('whois-detail-row') && next.dataset.domain === domain) {
    next.remove();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'loading...';

  try {
    const resp = await fetch('/whois', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || ('whois failed ' + resp.status));

    const detailTr = document.createElement('tr');
    detailTr.className = 'whois-detail-row';
    detailTr.dataset.domain = domain;
    const colCount = table.querySelectorAll('thead th').length || 6;

    const dnsInfo = data.dnsInfo || {};
    const whoisInfo = data.whoisInfo || {};
    const available = (whoisInfo.available === true) ? 'Available' : (whoisInfo.available === false ? 'Registered' : (whoisInfo.error ? 'Unknown' : 'Registered'));
    const registrar = whoisInfo.registrar || whoisInfo.parsed?.registrar || '';
    const expiry = whoisInfo.expiry || whoisInfo.parsed?.expirationDate || whoisInfo.parsed?.expires || '';

    const parsedJson = escapeHtml(JSON.stringify(whoisInfo.parsed || whoisInfo, null, 2) || '');

    detailTr.innerHTML = `
      <td colspan="${colCount}" style="background:#fafafa;padding:10px;">
        <div><strong>WHOIS summary for ${escapeHtml(domain)}:</strong></div>
        <div style="margin-top:6px;">
          <strong>Status:</strong> ${escapeHtml(available)} &nbsp;&nbsp;
          <strong>Registrar:</strong> ${escapeHtml(registrar || dnsInfo.ns?.[0] || '')} &nbsp;&nbsp;
          <strong>Expiry:</strong> ${escapeHtml(expiry || '')}
        </div>
        <details style="margin-top:8px;"><summary>Full parsed WHOIS / raw</summary><pre style="white-space:pre-wrap;max-height:300px;overflow:auto;background:#fff;padding:8px;border-radius:6px;border:1px solid #eee;">${parsedJson}\n\nDNS: ${escapeHtml(JSON.stringify(dnsInfo, null, 2))}</pre></details>
      </td>
    `;
    row.parentNode.insertBefore(detailTr, row.nextSibling);
    btn.textContent = 'whois';
    btn.disabled = false;
  } catch (err) {
    console.error('whois fetch error', err);
    btn.textContent = 'whois';
    btn.disabled = false;
    alert('WHOIS lookup failed: ' + (err.message || err));
  }
});

/* ---------- CSV download (unchanged) ---------- */
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

/* ---------- helpers ---------- */
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function escapeHtml(s){ 
  s = s == null ? '' : String(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); 
}

function csvEscape(v){ if (v == null) return ''; v = String(v); if (v.includes(',') || v.includes('"') || v.includes('\n')) { return '"' + v.replace(/"/g,'""') + '"'; } return v; }
