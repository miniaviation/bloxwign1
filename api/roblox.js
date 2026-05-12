// api/roblox.js — Vercel Serverless Function
// Runs server-side only. Source is never exposed to the public.

module.exports = async function handler(req, res) {
  // CORS headers (allows your frontend to call this)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    // Step 1: Search Roblox for the username
    const searchRes = await fetch(
      `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`
    );
    if (!searchRes.ok) throw new Error(`search_${searchRes.status}`);
    const searchData = await searchRes.json();

    // Exact match only (case-insensitive)
    const match = (searchData.data || []).find(
      u => u.name.toLowerCase() === username.toLowerCase()
    );

    if (!match) {
      return res.status(200).json({ found: false });
    }

    // Step 2: Fetch full profile to get bio
    const profileRes = await fetch(`https://users.roblox.com/v1/users/${match.id}`);
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
    console.error('[BetWing/roblox]', err.message);
    return res.status(502).json({ error: 'Failed to reach Roblox API' });
  }
};