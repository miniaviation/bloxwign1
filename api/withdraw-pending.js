// api/withdraw-pending.js
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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  const expectedKey = process.env.API_KEY;
  if (expectedKey && req.headers["x-api-key"] !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { username } = req.query;
  if (!username?.trim()) {
    return res.status(400).json({ error: "Missing username" });
  }

  try {
    // ── Single .where() only — no composite index needed ──────────────────────
    const snapshot = await db
      .collection("withdraw")
      .where("username", "==", username.trim())
      .get();

    // ── All filtering and sorting done in JS ──────────────────────────────────
    const pending = snapshot.docs
      .map(doc => {
        const d = doc.data();
        return {
          id         : doc.id,
          username   : d.username,
          items      : d.items      ?? [],
          status     : d.status     ?? "pending",
          requestedAt: d.requestedAt?.toMillis?.() ?? 0,
        };
      })
      .filter(d => d.status === "pending")          // only pending ones
      .sort((a, b) => a.requestedAt - b.requestedAt); // oldest first (FIFO)

    console.log(`[BetWing] withdraw-pending "${username.trim()}": ${pending.length} pending`);
    return res.status(200).json({ username: username.trim(), pending });
  } catch (err) {
    console.error("[BetWing] ❌ withdraw-pending:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}