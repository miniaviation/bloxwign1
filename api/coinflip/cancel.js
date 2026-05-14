// api/coinflip/cancel.js
// Lets the creator cancel their own waiting game and unlock their items.

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

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { username, gameId } = req.body ?? {};
  if (!username || !gameId) {
    return res.status(400).json({ error: "Missing username or gameId" });
  }

  try {
    const gameRef  = db.collection("coinflip_games").doc(gameId);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists) {
      return res.status(404).json({ error: "Game not found" });
    }

    const game = gameSnap.data();

    if (game.creatorUsername !== username) {
      return res.status(403).json({ error: "Only the creator can cancel this game." });
    }

    if (game.status !== "waiting") {
      return res.status(409).json({ error: "Game is not in a waiting state." });
    }

    // Cancel the game
    await gameRef.update({
      status    : "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Unlock the creator's items
    await db.collection("locked_items").doc(username).set({ items: [] }, { merge: false });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[Coinflip] cancel error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}