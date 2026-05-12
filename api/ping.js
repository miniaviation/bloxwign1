// api/ping.js
// ============================================================
//  Vercel Serverless Function  –  POST /api/ping
//  Receives a signal from the Roblox executor and saves it
//  to Firebase Firestore.
// ============================================================
//  Set these in Vercel Dashboard → Project → Settings → Environment Variables:
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY
//    API_KEY                  (optional shared secret)
// ============================================================

import admin from "firebase-admin";

// Initialise Firebase only once across warm invocations
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  // ── CORS headers (allows requests from any origin, incl. Roblox) ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // ── Optional API-key guard ────────────────────────────────────────
  const expectedKey = process.env.API_KEY;
  if (expectedKey && req.headers["x-api-key"] !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { event, playerId, playerName, timestamp, gameId, placeId, position } = req.body ?? {};

  if (!event || !playerId) {
    return res.status(400).json({ error: "Missing required fields: event, playerId" });
  }

  try {
    const docId  = `${playerId}_${timestamp ?? Date.now()}`;
    const docData = {
      event,
      playerId,
      playerName : playerName ?? "unknown",
      timestamp  : timestamp  ?? Date.now(),
      gameId     : gameId     ?? null,
      placeId    : placeId    ?? null,
      position   : position   ?? null,
      receivedAt : admin.firestore.FieldValue.serverTimestamp(),
      source     : "bloxwing",
    };

    await db.collection("roblox_pings").doc(docId).set(docData);

    console.log(`[BloxWing] ✅  Saved → roblox_pings/${docId}`);
    return res.status(200).json({ success: true, docId });

  } catch (err) {
    console.error("[BloxWing] ❌  Firestore write failed:", err);
    return res.status(500).json({ error: "Firebase write failed", details: err.message });
  }
}