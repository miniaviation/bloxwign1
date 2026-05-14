// api/coinflip/create.js
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

  const { username, items } = req.body ?? {};

  if (!username || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing username or items" });
  }

  try {
    // ── 1. Check user doesn't already have a waiting game ───────────────────
    const existing = await db.collection("coinflip_games")
      .where("creatorUsername", "==", username)
      .where("status", "==", "waiting")
      .get();

    if (!existing.empty) {
      return res.status(409).json({ error: "You already have an active coinflip game." });
    }

    // ── 2. Check none of these items are locked ────────────────────────────
    const itemNames = items.map(i => i.name);
    const lockedDoc = await db.collection("locked_items").doc(username).get();
    if (lockedDoc.exists) {
      const lockedSet = new Set(lockedDoc.data().items ?? []);
      const conflict  = itemNames.filter(n => lockedSet.has(n));
      if (conflict.length > 0) {
        return res.status(409).json({
          error: `These items are already in use: ${conflict.join(", ")}`,
        });
      }
    }

    // ── 3. Lock items for this user ────────────────────────────────────────
    await db.collection("locked_items").doc(username).set(
      { items: admin.firestore.FieldValue.arrayUnion(...itemNames) },
      { merge: true }
    );

    // ── 4. Create the game ─────────────────────────────────────────────────
    const totalValue = items.reduce((s, i) => s + (i.value ?? 0), 0);
    const gameRef = await db.collection("coinflip_games").add({
      creatorUsername : username,
      creatorItems    : items,
      creatorValue    : totalValue,
      status          : "waiting",
      createdAt       : admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, gameId: gameRef.id });
  } catch (err) {
    console.error("[Coinflip] create error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}