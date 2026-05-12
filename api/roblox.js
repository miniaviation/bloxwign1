// api/roblox.js — Vercel Serverless Function
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    // Step 1: POST to usernames endpoint (more reliable than search)
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

    if (!lookupRes.ok) {
      const text = await lookupRes.text();
      console.error('[roblox] lookup failed:', lookupRes.status, text);
      throw new Error(`lookup_${lookupRes.status}`);
    }

    const lookupData = await lookupRes.json();
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

    if (!profileRes.ok) throw new Error(`profile_${profileRes.status}`);
    const profile = await profileRes.json();

    return res.status(200).json({
      found      : true,
      id         : match.id,
      username   : profile.name,
      displayName: profile.displayName,
      bio        : profile.description || ''
    });

  } catch (err) {
    console.error('[roblox]', err.message);
    return res.status(502).json({ error: 'Failed to reach Roblox API', detail: err.message });
  }
};