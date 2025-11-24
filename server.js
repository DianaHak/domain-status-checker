const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch with timeout
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(id);
    return {
      ok: true,
      status: res.status,
      finalUrl: res.url
    };
  } catch (err) {
    clearTimeout(id);
    return { ok: false, error: err.message };
  }
}

// Normalize pasted domains or full URLs
function normalizeDomain(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  if (!raw) return null;

  try {
    let input = raw;
    // If user pasted domain without http/https, add dummy scheme
    if (!input.includes('://')) {
      input = "http://" + input;
    }
    const url = new URL(input);
    return url.hostname; // remove paths/ports
  } catch (e) {
    return null;
  }
}

async function checkDomain(domain) {
  const tryUrls = [
    `https://${domain}`,
    `http://${domain}`
  ];

  for (const url of tryUrls) {
    const result = await fetchWithTimeout(url, 8000);
    if (result.ok) {
      return {
        domain,
        url,
        reachable: true,
        status: result.status,
        finalUrl: result.finalUrl
      };
    }
  }

  return {
    domain,
    url: null,
    reachable: false,
    status: null,
    error: "unreachable or timed out"
  };
}

app.post('/check', async (req, res) => {
  try {
    let domains = req.body?.domains;
    if (!Array.isArray(domains)) {
      return res.status(400).json({ error: "domains must be array" });
    }

    // Normalize
    domains = domains.map(normalizeDomain).filter(Boolean);

    // Deduplicate
    const seen = new Set();
    domains = domains.filter(d => {
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });

    // Run sequentially
    const results = [];
    for (const domain of domains) {
      console.log("Checking:", domain);
      const result = await checkDomain(domain);
      results.push(result);
    }

    res.json({ results });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// Debug route list
function listRoutes() {
  console.log('Registered routes:');
  app._router.stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods)
        .map(m => m.toUpperCase())
        .join(',');
      console.log(methods.padEnd(7), layer.route.path);
    }
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  listRoutes();
});
