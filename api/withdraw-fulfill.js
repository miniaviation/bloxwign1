// api/withdraw-fulfill.js
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { withdrawId, fulfilledBy, itemsAdded, itemsMissing } = req.body ?? {};

  if (!withdrawId) {
    return res.status(400).json({ error: "Missing withdrawId" });
  }

  try {
    await db.collection("withdraw").doc(withdrawId).update({
      status      : itemsMissing?.length > 0 ? "partial" : "fulfilled",
      fulfilledBy : fulfilledBy ?? null,
      itemsAdded  : itemsAdded  ?? [],
      itemsMissing: itemsMissing ?? [],
      fulfilledAt : admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[BetWing] ✅ Withdraw ${withdrawId} marked fulfilled by ${fulfilledBy}`);
    return res.status(200).json({ success: true, withdrawId });
  } catch (err) {
    console.error("[BetWing] ❌ withdraw-fulfill failed:", err);
    return res.status(500).json({ error: "Failed to fulfill withdraw", details: err.message });
  }
}