// server.js
// Domain status checker with DNS + optional WHOIS endpoint (uses whois-json)

const express = require('express');
const path = require('path');
const dns = require('dns').promises;
const whoisJson = require('whois-json'); // npm install whois-json

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- fetch with timeout ----------
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(id);
    return { ok: true, status: res.status, finalUrl: res.url };
  } catch (err) {
    clearTimeout(id);
    return { ok: false, error: err.message || String(err) };
  }
}

// ---------- normalize domain ----------
function normalizeDomain(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  if (!raw) return null;
  try {
    let input = raw;
    if (!input.includes('://')) input = 'http://' + input;
    const url = new URL(input);
    return url.hostname;
  } catch (e) {
    return null;
  }
}

// ---------- basic hostname validator ----------
function isValidHostname(h) {
  if (!h || typeof h !== 'string') return false;
  if (h.length > 253) return false;
  const labels = h.split('.');
  for (const lab of labels) {
    if (!lab.length || lab.length > 63) return false;
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(lab)) return false;
  }
  return true;
}

// ---------- DNS diagnostics ----------
async function checkDNS(domain) {
  const out = { domain, a: [], aaaa: [], cname: [], ns: [], soa: null, dnsStatus: 'unknown', error: null };
  try {
    try { out.a = await dns.resolve(domain, 'A'); } catch (e) {}
    try { out.aaaa = await dns.resolve(domain, 'AAAA'); } catch (e) {}
    try { out.cname = await dns.resolve(domain, 'CNAME'); } catch (e) {}
    try { out.ns = await dns.resolve(domain, 'NS'); } catch (e) {}
    try { out.soa = await dns.resolveSoa(domain); } catch (e) {}

    if ((out.a && out.a.length) || (out.aaaa && out.aaaa.length) || (out.cname && out.cname.length)) {
      out.dnsStatus = 'resolves';
    } else if (out.ns && out.ns.length) {
      out.dnsStatus = 'has-ns-only';
    } else {
      out.dnsStatus = 'no-records';
    }
  } catch (err) {
    out.error = String(err.message || err);
    out.dnsStatus = 'error';
  }
  return out;
}

// ---------- WHOIS lookup using whois-json (npm package) ----------
async function runWhois(domain) {
  const out = { domain, parsed: null, registrar: null, expiry: null, available: null, error: null };
  try {
    if (!isValidHostname(domain)) {
      out.error = 'invalid hostname';
      return out;
    }

    // whoisJson returns an object parsed from whois output for many TLDs
    const parsed = await whoisJson(domain, { follow: 3, timeout: 15000 }).catch(e => { throw e; });

    out.parsed = parsed || {};

    // heuristics to extract registrar and expiry from common keys
    // try several common property names
    const findFirst = (obj, keys) => {
      if (!obj) return null;
      for (const k of keys) {
        if (k in obj && obj[k]) return obj[k];
        // also check nested registryData
        if (obj.registryData && (k in obj.registryData) && obj.registryData[k]) return obj.registryData[k];
      }
      return null;
    };

    const expiry = findFirst(parsed, ['expirationDate', 'expires', 'expiryDate', 'paid-till', 'registryExpiryDate', 'expire']);
    const registrar = findFirst(parsed, ['registrar', 'registrarName', 'Registrar']);

    out.expiry = expiry ? String(expiry) : null;
    out.registrar = registrar ? String(registrar) : null;

    // availability heuristic: some parsed outputs include no domainName when not found
    // also look for common strings in any textual fields (best-effort)
    let available = null;
    if (parsed && (parsed.domainName || parsed.domain)) {
      available = false;
    } else {
      // fallback: inspect raw-ish fields if present
      const joined = JSON.stringify(parsed).toLowerCase();
      if (/no match|not found|no entries found|status: free|available/i.test(joined)) available = true;
      else available = false; // assume registered if unknown
    }
    out.available = available;

  } catch (err) {
    out.error = String(err.message || err);
  }
  return out;
}

// ---------- core checkDomain ----------
async function checkDomain(domain) {
  if (!isValidHostname(domain)) {
    return { domain, url: null, reachable: false, status: null, error: 'invalid hostname' };
  }

  const tryUrls = [`https://${domain}`, `http://${domain}`];
  for (const url of tryUrls) {
    const result = await fetchWithTimeout(url, 8000);
    if (result.ok) {
      return { domain, url, reachable: true, status: result.status, finalUrl: result.finalUrl };
    }
  }

  // unreachable: include DNS + (optionally) whois info later via separate endpoint
  const dnsInfo = await checkDNS(domain);
  return { domain, url: null, reachable: false, status: null, error: 'unreachable or timed out', dnsInfo };
}

// ---------- POST /check ----------
app.post('/check', async (req, res) => {
  try {
    let domains = req.body?.domains;
    if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains must be array' });

    domains = domains.map(normalizeDomain).filter(Boolean);
    const seen = new Set();
    domains = domains.filter(d => (seen.has(d) ? false : (seen.add(d), true)));

    const results = [];
    for (const d of domains) {
      console.log('Checking:', d);
      const r = await checkDomain(d);
      console.log('Result:', d, r.reachable ? `reachable ${r.status}` : (r.error || 'unreachable'));
      results.push(r);
    }

    res.json({ results });
  } catch (err) {
    console.error('Server error in /check:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// ---------- POST /whois (single domain) ----------
app.post('/whois', async (req, res) => {
  try {
    const domain = normalizeDomain(req.body?.domain || '');
    if (!domain) return res.status(400).json({ error: 'invalid or missing domain' });
    if (!isValidHostname(domain)) return res.status(400).json({ error: 'invalid hostname' });

    // run DNS quickly to provide context
    const dnsInfo = await checkDNS(domain);

    // run whois (could be slow)
    const whoisInfo = await runWhois(domain);

    res.json({ dnsInfo, whoisInfo });
  } catch (err) {
    console.error('WHOIS error:', err);
    res.status(500).json({ error: 'whois failed', detail: String(err.message || err) });
  }
});

// ---------- route list ----------
function listRoutes() {
  console.log('Registered routes:');
  app._router.stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
      console.log(methods.padEnd(7), layer.route.path);
    }
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  listRoutes();
});
