import admin from "firebase-admin";

// ── Firebase init ─────────────────────────────────────────────────────────────
let dbReady = false;
let initError = null;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  dbReady = true;
} catch (e) {
  initError = e.message;
}

const db = dbReady ? admin.database() : null;

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET = health check, no auth needed
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      firebase_ready: dbReady,
      init_error: initError,
      env_check: {
        has_project_id:   !!process.env.FIREBASE_PROJECT_ID,
        has_client_email: !!process.env.FIREBASE_CLIENT_EMAIL,
        has_private_key:  !!process.env.FIREBASE_PRIVATE_KEY,
        has_database_url: !!process.env.FIREBASE_DATABASE_URL,
        has_api_secret:   !!process.env.API_SECRET_KEY,
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Auth
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized - bad API key" });
  }

  // Firebase check
  if (!dbReady || !db) {
    return res.status(500).json({
      success: false,
      error: "Firebase not initialized",
      detail: initError,
    });
  }

  // Parse body
  const body = req.body ?? {};
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
    serverTimestamp: Date.now(),
  };

  try {
    const ref = tradeId
      ? db.ref(`trades/${userId}/${tradeId}`)
      : db.ref(`trades/${userId}`).push();

    await ref.set(record);

    return res.status(200).json({
      success:  true,
      tradeKey: ref.key,
      path:     `trades/${userId}/${ref.key}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error:   "Database write failed",
      detail:  err.message,
    });
  }
}