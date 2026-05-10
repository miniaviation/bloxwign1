import admin from "firebase-admin";

let db = null;
let initError = null;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {
  initError = e.message;
}

// Firestore write with a hard timeout
function firestoreWrite(ref, data) {
  return Promise.race([
    ref.set ? ref.set(data) : ref.add(data),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Firestore timeout")), 8000)
    ),
  ]);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({
      ok:         true,
      db_ready:   db !== null,
      init_error: initError,
      env_check: {
        has_project_id:   !!process.env.FIREBASE_PROJECT_ID,
        has_client_email: !!process.env.FIREBASE_CLIENT_EMAIL,
        has_private_key:  !!process.env.FIREBASE_PRIVATE_KEY,
        has_api_secret:   !!process.env.API_SECRET_KEY,
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  if (!db) {
    return res.status(500).json({
      success: false,
      error:   "Firestore not initialized",
      detail:  initError,
    });
  }

  const rawBody = req.body ?? {};
  const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  const { userId, partnerId, partnerName, itemsReceived, tradeId, timestamp } = body;

  if (!userId)                       return res.status(400).json({ success: false, error: "Missing userId" });
  if (!partnerId)                    return res.status(400).json({ success: false, error: "Missing partnerId" });
  if (!partnerName)                  return res.status(400).json({ success: false, error: "Missing partnerName" });
  if (!Array.isArray(itemsReceived)) return res.status(400).json({ success: false, error: "itemsReceived must be an array" });

  const record = {
    userId:        String(userId),
    partnerId:     String(partnerId),
    partnerName,
    itemsReceived: itemsReceived.map((item) => ({
      kind:       item.kind     ?? "unknown",
      name:       item.name     ?? item.kind ?? "Unknown",
      category:   item.category ?? "unknown",
      properties: {
        neon:      item.properties?.neon      ?? false,
        mega_neon: item.properties?.mega_neon ?? false,
        flyable:   item.properties?.flyable   ?? false,
        rideable:  item.properties?.rideable  ?? false,
        rarity:    item.properties?.rarity    ?? null,
      },
    })),
    clientTimestamp: timestamp ?? null,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const historyRef = db.collection("trades").doc(String(userId)).collection("history");

    let docRef;
    if (tradeId) {
      docRef = historyRef.doc(String(tradeId));
      await Promise.race([
        docRef.set(record),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 8000)),
      ]);
    } else {
      docRef = await Promise.race([
        historyRef.add(record),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 8000)),
      ]);
    }

    return res.status(200).json({
      success:  true,
      tradeKey: docRef.id,
      path:     `trades/${userId}/history/${docRef.id}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error:   "Firestore write failed",
      detail:  err.message,
    });
  }
}