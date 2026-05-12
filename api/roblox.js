// api/roblox.js — Vercel Serverless Function

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    // Step 1: Resolve username → userId (official public endpoint, no auth needed)
    const resolveRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });

    if (!resolveRes.ok) throw new Error(`resolve_${resolveRes.status}`);
    const resolveData = await resolveRes.json();
    const match = (resolveData.data || [])[0];

    if (!match) {
      return res.status(200).json({ found: false });
    }

    // Step 2: Fetch full profile by userId — returns description (bio)
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
    console.error('[roblox]', err.message);
    return res.status(502).json({ error: 'Failed to reach Roblox API' });
  }
};