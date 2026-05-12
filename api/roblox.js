// api/roblox.js — Vercel Serverless Function
// Runs server-side only. Source is never exposed to the public.
// Requires: npm install noblox.js

const noblox = require('noblox.js');

module.exports = async function handler(req, res) {
  // CORS headers (allows your frontend to call this)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    // Step 1: Resolve username → userId
    const userId = await noblox.getIdFromUsername(username);

    if (!userId) {
      return res.status(200).json({ found: false });
    }

    // Step 2: Fetch full player info (includes bio/blurb)
    const info = await noblox.getPlayerInfo(userId);

    return res.status(200).json({
      found      : true,
      id         : userId,
      username   : info.username,
      displayName: info.displayName,
      bio        : info.blurb || ''
    });

  } catch (err) {
    // noblox throws if username not found
    if (err.message && err.message.toLowerCase().includes('not found')) {
      return res.status(200).json({ found: false });
    }

    console.error('[BetWing/roblox]', err.message);
    return res.status(502).json({ error: 'Failed to reach Roblox API' });
  }
};