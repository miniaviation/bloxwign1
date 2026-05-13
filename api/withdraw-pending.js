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

  const { username } = req.query;
  if (!username?.trim()) {
    return res.status(400).json({ error: "Missing username parameter" });
  }

  try {
    // Query withdraw collection for this username with status "pending"
    const snapshot = await db
      .collection("withdraw")
      .where("username", "==", username.trim())
      .where("status", "==", "pending")
      .orderBy("requestedAt", "asc")   // oldest first so FIFO
      .limit(5)
      .get();

    const pending = snapshot.docs.map(doc => ({
      id   : doc.id,
      ...doc.data(),
      // Convert Firestore Timestamps to ms for easy use in Lua
      requestedAt: doc.data().requestedAt?.toMillis?.() ?? null,
    }));

    return res.status(200).json({ username: username.trim(), pending });
  } catch (err) {
    console.error("[BetWing] ❌ withdraw-pending failed:", err);
    return res.status(500).json({ error: "Failed to fetch pending withdraws", details: err.message });
  }
}