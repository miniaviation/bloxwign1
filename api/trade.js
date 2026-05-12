// api/trade.js
// ============================================================
//  Vercel Serverless Function  –  POST /api/trade
//  Receives a completed trade from the Roblox executor and
//  saves it to Firebase under the "trades" collection.
// ============================================================

import admin from "firebase-admin";

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const expectedKey = process.env.API_KEY;
  if (expectedKey && req.headers["x-api-key"] !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    playerId,
    playerName,
    partnerName,
    partnerItems,   // array of { name, tags[] }
    timestamp,
    gameId,
    placeId,
  } = req.body ?? {};

  if (!playerId || !partnerName) {
    return res.status(400).json({ error: "Missing required fields: playerId, partnerName" });
  }

  try {
    const docId = `${playerId}_${timestamp ?? Date.now()}`;

    await db.collection("trades").doc(docId).set({
      playerId,
      playerName   : playerName   ?? "unknown",
      partnerName,
      partnerItems : partnerItems ?? [],
      timestamp    : timestamp    ?? Date.now(),
      gameId       : gameId       ?? null,
      placeId      : placeId      ?? null,
      receivedAt   : admin.firestore.FieldValue.serverTimestamp(),
      source       : "bloxwing",
    });

    console.log(`[BloxWing] ✅  Trade saved → trades/${docId}`);
    return res.status(200).json({ success: true, docId });

  } catch (err) {
    console.error("[BloxWing] ❌  Firestore write failed:", err);
    return res.status(500).json({ error: "Firebase write failed", details: err.message });
  }
}