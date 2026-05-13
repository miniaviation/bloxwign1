// api/amvgg-values.js
// Server-side proxy: fetches amvgg.com pet + food value pages, parses item
// names and values, multiplies by 1000, and returns as JSON.
// Runs server-to-server so there are no CORS issues for the browser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  // Cache 10 minutes at the edge, serve stale for 1 minute while revalidating
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');

  const HEADERS = {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const PAGES = [
    'https://amvgg.com/values/pets',
    'https://amvgg.com/values/food',
  ];

  try {
    // Fetch all pages in parallel
    const htmls = await Promise.all(
      PAGES.map(url =>
        fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
          .then(r => {
            if (!r.ok) throw new Error(`amvgg returned HTTP ${r.status} for ${url}`);
            return r.text();
          })
      )
    );

    const seen  = new Set();
    const items = [];

    for (const html of htmls) {
      for (const item of parseItems(html)) {
        if (seen.has(item.name)) continue;
        seen.add(item.name);
        items.push(item);
      }
    }

    return res.status(200).json({ items });
  } catch (err) {
    console.error('[BetWing] amvgg-values fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch values', details: err.message });
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────
// Each item block on the amvgg pages looks like:
//
//   ## Item Name
//   Value0.275
//
// We grab name + raw value, multiply by 1000, and round to 2 dp.

function parseItems(html) {
  const items = [];
  const seen  = new Set();

  // Match "## <name>" followed (within ~300 chars) by "Value<number>"
  const RE = /##\s+(.+?)\n[\s\S]{0,300}?Value([\d.]+)/g;

  let m;
  while ((m = RE.exec(html)) !== null) {
    const name     = m[1].trim();
    const rawValue = parseFloat(m[2]);

    if (!name || isNaN(rawValue)) continue;
    if (seen.has(name)) continue;

    seen.add(name);

    // ×900 so e.g. 1.275 → 1147.5, 0.3 → 270
    const value = Math.round(rawValue * 900 * 100) / 100;

    items.push({ name, value });
  }

  return items;
}