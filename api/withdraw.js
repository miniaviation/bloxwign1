// api/withdraw.js
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

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { username, items } = req.body ?? {};

  if (!username || !username.trim()) {
    return res.status(400).json({ error: "Missing required field: username" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing required field: items (non-empty array)" });
  }

  const user = username.trim();

  try {
    // ── 1. Write the withdraw request ────────────────────────────────────────
    const withdrawRef = db.collection("withdraw").doc();
    await withdrawRef.set({
      username,
      items,          // array of item name strings
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending",
    });

    // ── 2. Remove withdrawn items from the user's trade inventory ────────────
    const tradeRef  = db.collection("trades").doc(user);
    const tradeSnap = await tradeRef.get();

    if (tradeSnap.exists) {
      const data   = tradeSnap.data();
      const trades = data.trades ?? [];

      // Build a set of names to remove (lowercased for safety)
      const toRemove = new Set(items.map(n => n.toLowerCase()));

      // Rebuild each trade entry, filtering out withdrawn items
      const updatedTrades = trades.map(trade => ({
        ...trade,
        items: (trade.items ?? []).filter(item => {
          const name = typeof item === "string" ? item : (item.name ?? "");
          return !toRemove.has(name.toLowerCase());
        }),
      }));

      await tradeRef.update({ trades: updatedTrades });
    }

    console.log(`[BetWing] ✅ Withdraw saved → withdraw/${withdrawRef.id} for ${user}`);
    return res.status(200).json({ success: true, withdrawId: withdrawRef.id });
  } catch (err) {
    console.error("[BetWing] ❌ Withdraw failed:", err);
    return res.status(500).json({ error: "Withdraw failed", details: err.message });
  }
}