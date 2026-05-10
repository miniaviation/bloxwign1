import admin from "firebase-admin";

// ── Firebase init (runs once per cold start) ─────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars can't contain real newlines, so we store \\n and replace
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

// ── Helper ────────────────────────────────────────────────────────────────────
function unauthorized(res, msg = "Unauthorized") {
  return res.status(401).json({ success: false, error: msg });
}

function badRequest(res, msg = "Bad request") {
  return res.status(400).json({ success: false, error: msg });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // ── Auth: check secret API key sent in the header ─────────────────────────
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return unauthorized(res);
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  const {
    userId,          // Roblox user ID of the person running the script  (number | string)
    partnerId,       // Roblox user ID of the trading partner             (number | string)
    partnerName,     // Display name of the partner                       (string)
    itemsReceived,   // Array of item objects they gave you               (array)
    tradeId,         // Optional trade ID from Roblox                     (string)
    timestamp,       // Unix epoch from client (we'll also add server ts) (number)
  } = req.body ?? {};

  // ── Validate required fields ───────────────────────────────────────────────
  if (!userId)        return badRequest(res, "Missing userId");
  if (!partnerId)     return badRequest(res, "Missing partnerId");
  if (!partnerName)   return badRequest(res, "Missing partnerName");
  if (!Array.isArray(itemsReceived)) return badRequest(res, "itemsReceived must be an array");

  // ── Build the record ───────────────────────────────────────────────────────
  const serverTimestamp = Date.now();

  // Use tradeId if Roblox sends one, otherwise generate a push key
  const ref = tradeId
    ? db.ref(`trades/${userId}/${tradeId}`)
    : db.ref(`trades/${userId}`).push();

  const record = {
    userId:        String(userId),
    partnerId:     String(partnerId),
    partnerName,
    itemsReceived: itemsReceived.map((item) => ({
      kind:        item.kind        ?? "unknown",
      name:        item.name        ?? item.kind ?? "Unknown",
      category:    item.category    ?? "unknown",
      properties:  {
        neon:      item.properties?.neon       ?? false,
        mega_neon: item.properties?.mega_neon  ?? false,
        flyable:   item.properties?.flyable    ?? false,
        rideable:  item.properties?.rideable   ?? false,
        rarity:    item.properties?.displayed_rarity ?? item.properties?.rarity ?? null,
      },
    })),
    clientTimestamp: timestamp ?? null,
    serverTimestamp,
  };

  // ── Write to Firebase ──────────────────────────────────────────────────────
  try {
    await ref.set(record);
    return res.status(200).json({
      success: true,
      tradeKey: ref.key,
      path: `trades/${userId}/${ref.key}`,
    });
  } catch (err) {
    console.error("[trade-log] Firebase write error:", err);
    return res.status(500).json({ success: false, error: "Database write failed" });
  }
}