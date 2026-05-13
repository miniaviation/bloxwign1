// api/amvgg-values.js
// Server-side proxy: fetches amvgg.com pet + food value pages, parses item
// names and values, multiplies by x900, and returns as JSON.

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

    // Debug: log how many items we parsed so you can check Vercel logs
    console.log(`[BetWing] amvgg-values: parsed ${items.length} items total`);

    return res.status(200).json({ items, count: items.length });
  } catch (err) {
    console.error('[BetWing] amvgg-values fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch values', details: err.message });
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────
// amvgg renders a Next.js SSR page. The value list is embedded in the HTML.
// We try three strategies in order so we catch the value regardless of how
// the HTML is structured around it.

function stripTags(str) {
  return str.replace(/<[^>]*>/g, '');
}

function parseItems(html) {
  const items = [];
  const seen  = new Set();

  // ── Strategy 1 ──────────────────────────────────────────────────────────────
  // The SSR page inlines data as a Next.js __NEXT_DATA__ JSON blob.
  // Try to extract the full items array from there first — most reliable.
  try {
    const dataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (dataMatch) {
      const json = JSON.parse(dataMatch[1]);
      // Walk the JSON tree looking for arrays of objects with { name, value }
      const found = extractFromNextData(json);
      if (found.length > 0) {
        for (const item of found) {
          if (!item.name || item.value == null) continue;
          if (seen.has(item.name)) continue;
          seen.add(item.name);
          const value = Math.round(item.value * 900 * 100) / 100;
          items.push({ name: item.name, value });
        }
        if (items.length > 0) return items;
      }
    }
  } catch (_) { /* fall through */ }

  // ── Strategy 2 ──────────────────────────────────────────────────────────────
  // Match heading + value in plain text (markdown render / simple HTML).
  // Handles:
  //   ## Pet Name\nValue3.75
  //   ## Pet Name\n\nValue3.75
  //   <h2>Pet Name</h2>...<span>Value</span><span>3.75</span>
  //
  // Strip all HTML tags first, then scan the plain text.
  const plain = stripTags(html).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Pattern A: "## Name" style (markdown rendered to text)
  const REA = /##\s+([^\n]+)\n(?:[^\n]*\n){0,5}?Value([\d.]+)/g;
  let m;
  while ((m = REA.exec(plain)) !== null) {
    const name     = m[1].trim();
    const rawValue = parseFloat(m[2]);
    if (!name || isNaN(rawValue) || seen.has(name)) continue;
    seen.add(name);
    items.push({ name, value: Math.round(rawValue * 900 * 100) / 100 });
  }
  if (items.length > 0) return items;

  // Pattern B: "Name\nValue3.75" — no ## prefix, just name then value on next line(s)
  const REB = /^([A-Z][^\n]{2,60})\n(?:[^\n]{0,80}\n){0,4}?Value([\d.]+)/gm;
  while ((m = REB.exec(plain)) !== null) {
    const name     = m[1].trim();
    const rawValue = parseFloat(m[2]);
    if (!name || isNaN(rawValue) || seen.has(name)) continue;
    seen.add(name);
    items.push({ name, value: Math.round(rawValue * 900 * 100) / 100 });
  }

  // ── Strategy 3 ──────────────────────────────────────────────────────────────
  // Last resort: scan raw HTML for Value patterns adjacent to item slugs.
  // /pet/Bat_Dragon ... Value3.75   or   /food/Honey ... Value0.008
  if (items.length === 0) {
    const REC = /\/(?:pet|food)\/([A-Za-z0-9_%-]+)[\s\S]{0,600}?Value([\d.]+)/g;
    while ((m = REC.exec(html)) !== null) {
      // Convert slug back to display name: Bat_Dragon -> Bat Dragon
      const name     = decodeURIComponent(m[1]).replace(/_/g, ' ');
      const rawValue = parseFloat(m[2]);
      if (!name || isNaN(rawValue) || seen.has(name)) continue;
      seen.add(name);
      items.push({ name, value: Math.round(rawValue * 900 * 100) / 100 });
    }
  }

  return items;
}

// Walk the __NEXT_DATA__ tree recursively looking for item arrays
function extractFromNextData(node, depth = 0) {
  if (depth > 10 || !node || typeof node !== 'object') return [];

  // If this node looks like an item { name: string, value: number }
  if (typeof node.name === 'string' && typeof node.value === 'number') {
    return [node];
  }

  // If it's an array, check if it's an array of items
  if (Array.isArray(node)) {
    const results = [];
    for (const child of node) {
      results.push(...extractFromNextData(child, depth + 1));
    }
    return results;
  }

  // Recurse into object values
  const results = [];
  for (const key of Object.keys(node)) {
    results.push(...extractFromNextData(node[key], depth + 1));
  }
  return results;
}