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

  const expectedKey = process.env.API_KEY;
  if (expectedKey && req.headers["x-api-key"] !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { partnerName, partnerItems } = req.body ?? {};
  if (!partnerName) {
    return res.status(400).json({ error: "Missing required field: partnerName" });
  }

  try {
    // Doc keyed by partnerName (e.g. "CoatiLlama")
    const docRef  = db.collection("trades").doc(partnerName);
    const docSnap = await docRef.get();

    const newEntry = {
      items      : partnerItems ?? [],
      receivedAt : Date.now(),
    };

    if (docSnap.exists) {
      await docRef.update({
        trades      : admin.firestore.FieldValue.arrayUnion(newEntry),
        lastTradeAt : admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[BloxWing] ✅ Trade appended → trades/${partnerName}`);
    } else {
      await docRef.set({
        partnerName,
        trades       : [newEntry],
        firstTradeAt : admin.firestore.FieldValue.serverTimestamp(),
        lastTradeAt  : admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[BloxWing] ✅ New partner saved → trades/${partnerName}`);
    }

    return res.status(200).json({ success: true, partnerName });
  } catch (err) {
    console.error("[BloxWing] ❌ Firestore write failed:", err);
    return res.status(500).json({ error: "Firebase write failed", details: err.message });
  }
}