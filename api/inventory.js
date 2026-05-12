// api/inventory.js
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  const { username } = req.query;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: "Missing username parameter" });
  }

  try {
    const docRef  = db.collection("trades").doc(username.trim());
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      // User has no trades on record — return empty inventory
      return res.status(200).json({ username: username.trim(), items: [] });
    }

    const data = docSnap.data();

    // Flatten all items across every trade entry, keeping most recent first
    const trades = (data.trades ?? []).slice().reverse();
    const allItems = [];
    const seen = new Set();

    for (const trade of trades) {
      for (const item of (trade.items ?? [])) {
        // Deduplicate by item name so the same item isn't shown twice
        const key = typeof item === "string" ? item : item.name ?? JSON.stringify(item);
        if (!seen.has(key)) {
          seen.add(key);
          allItems.push({
            name      : typeof item === "string" ? item : (item.name ?? "Unknown"),
            receivedAt: trade.receivedAt ?? null,
            // Pass through any extra fields (rap, value, etc.) if present
            ...(typeof item === "object" ? item : {}),
          });
        }
      }
    }

    return res.status(200).json({ username: username.trim(), items: allItems });
  } catch (err) {
    console.error("[BetWing] ❌ Firestore read failed:", err);
    return res.status(500).json({ error: "Failed to load inventory", details: err.message });
  }
}