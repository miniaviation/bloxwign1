// api/amvgg-values.js
// Server-side proxy: fetches amvgg.com pet + food value pages, parses item
// names and values from the real HTML structure, multiplies by x900.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');

  const HEADERS = {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer'        : 'https://amvgg.com/',
  };

  const PAGES = [
    'https://amvgg.com/values/pets',
    'https://amvgg.com/values/food',
  ];

  try {
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

    console.log(`[BetWing] amvgg-values: parsed ${items.length} items total`);
    return res.status(200).json({ items, count: items.length });
  } catch (err) {
    console.error('[BetWing] amvgg-values fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch values', details: err.message });
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────
// Real HTML structure from amvgg (confirmed from page source):
//
//   <h2 title="Fly-A-Pet Potion">Fly-A-Pet Potion</h2>
//   ...
//   <span class="text-gray-500 text-sm font-medium w-14">Value</span>
//   <span class="text-white text-lg font-bold tabular-nums">0.013</span>
//
// We match the h2 title attribute for the name, then grab the value from the
// tabular-nums span that immediately follows the "Value" label span.

function parseItems(html) {
  const items = [];
  const seen  = new Set();

  // Match:
  //   <h2 title="ITEM NAME"> ... tabular-nums">VALUE</span>
  // The [\s\S]{0,800} allows for the image/demand markup between h2 and value span.
  const RE = /<h2[^>]*title="([^"]+)"[^>]*>[\s\S]{0,800}?tabular-nums">([\d.]+)<\/span>/g;

  let m;
  while ((m = RE.exec(html)) !== null) {
    const name     = m[1].trim();
    const rawValue = parseFloat(m[2]);

    if (!name || isNaN(rawValue) || seen.has(name)) continue;
    seen.add(name);

    // ×900, rounded to 2 decimal places
    const value = Math.round(rawValue * 900 * 100) / 100;
    items.push({ name, value });
  }

  return items;
}