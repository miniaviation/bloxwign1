// api/roblox.js — Vercel serverless function
// Proxies Roblox username lookups server-side, bypassing browser CORS restrictions.

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Missing username parameter' });
  }

  const trimmed = username.trim();

  try {
    // Step 1: Resolve username → userId via Roblox users API
    const searchRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [trimmed], excludeBannedUsers: false }),
    });

    if (!searchRes.ok) {
      return res.status(502).json({ error: `Roblox username lookup failed: ${searchRes.status}` });
    }

    const searchData = await searchRes.json();
    const match = searchData?.data?.[0];

    // Username not found on Roblox
    if (!match) {
      return res.status(200).json({ found: false });
    }

    const { id, name: resolvedUsername, displayName } = match;

    // Step 2: Fetch full profile to get bio (description)
    const profileRes = await fetch(`https://users.roblox.com/v1/users/${id}`);

    if (!profileRes.ok) {
      return res.status(502).json({ error: `Roblox profile fetch failed: ${profileRes.status}` });
    }

    const profile = await profileRes.json();

    return res.status(200).json({
      found: true,
      id,
      username: resolvedUsername,
      displayName: displayName ?? resolvedUsername,
      bio: profile.description ?? '',
    });

  } catch (err) {
    console.error('[api/roblox] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}