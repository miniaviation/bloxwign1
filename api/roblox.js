// api/roblox.js — Vercel Serverless Function
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    // Step 1: POST to usernames endpoint (most reliable)
    const lookupRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false
      })
    });

    // Log exactly what Roblox returned
    const rawLookup = await lookupRes.text();
    console.log('[roblox] lookup status:', lookupRes.status);
    console.log('[roblox] lookup body:', rawLookup);

    if (!lookupRes.ok) {
      return res.status(502).json({
        error: 'Roblox lookup failed',
        status: lookupRes.status,
        body: rawLookup   // <-- will show in your browser/network tab
      });
    }

    const lookupData = JSON.parse(rawLookup);
    const match = (lookupData.data || []).find(
      u => u.name.toLowerCase() === username.toLowerCase()
    );

    if (!match) {
      return res.status(200).json({ found: false });
    }

    // Step 2: Fetch full profile for bio
    const profileRes = await fetch(`https://users.roblox.com/v1/users/${match.id}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    const rawProfile = await profileRes.text();
    console.log('[roblox] profile status:', profileRes.status);
    console.log('[roblox] profile body:', rawProfile);

    if (!profileRes.ok) {
      return res.status(502).json({
        error: 'Roblox profile fetch failed',
        status: profileRes.status,
        body: rawProfile
      });
    }

    const profile = JSON.parse(rawProfile);

    return res.status(200).json({
      found      : true,
      id         : match.id,
      username   : profile.name,
      displayName: profile.displayName,
      bio        : profile.description || ''
    });

  } catch (err) {
    // This will now surface the REAL error in the response body
    console.error('[roblox] crash:', err);
    return res.status(500).json({
      error  : err.message,
      stack  : err.stack   // remove this line before going to production
    });
  }
};