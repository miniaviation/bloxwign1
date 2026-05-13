// api/amvgg-values.js
// Server-side proxy: fetches https://amvgg.com/values/pets, parses item names
// and values from the HTML, and returns them as JSON.
// This avoids CORS issues since the fetch happens server-to-server.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  // Cache for 10 minutes via CDN/Vercel edge cache
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');

  try {
    const r = await fetch('https://amvgg.com/values/pets', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      return res.status(502).json({ error: `amvgg returned HTTP ${r.status}` });
    }

    const html = await r.text();
    const items = parseItems(html);

    return res.status(200).json({ items });
  } catch (err) {
    console.error('[BetWing] amvgg-values fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch values', details: err.message });
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────
// The amvgg page renders markdown-like content server-side.
// Each pet block looks like:
//
//   ## Pet Name
//   Value1.275
//
// We extract both pieces with a single pass regex.

function parseItems(html) {
  const items = [];
  const seen  = new Set();

  // Match:  ## <name>\n  ...  Value<number>
  // The [\s\S]*? allows a few lines of intervening markup between the heading
  // and the value line.
  const RE = /##\s+(.+?)\n[\s\S]{0,300}?Value([\d.]+)/g;

  let m;
  while ((m = RE.exec(html)) !== null) {
    const name  = m[1].trim();
    const value = parseFloat(m[2]);

    if (!name || isNaN(value)) continue;
    if (seen.has(name)) continue; // deduplicate (page sometimes repeats headers)

    seen.add(name);
    items.push({ name, value });
  }

  return items;
}