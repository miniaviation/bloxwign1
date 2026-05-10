const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

// Get a Firebase auth token using the service account
async function getAccessToken() {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, db_ready: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== API_SECRET_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const rawBody = req.body ?? {};
  const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  const { userId, partnerId, partnerName, itemsReceived, timestamp } = body;

  if (!userId)                       return res.status(400).json({ success: false, error: "Missing userId" });
  if (!partnerId)                    return res.status(400).json({ success: false, error: "Missing partnerId" });
  if (!partnerName)                  return res.status(400).json({ success: false, error: "Missing partnerName" });
  if (!Array.isArray(itemsReceived)) return res.status(400).json({ success: false, error: "itemsReceived must be an array" });

  try {
    const token = await getAccessToken();

    // Build Firestore REST fields
    const fields = {
      userId:        { stringValue: String(userId) },
      partnerId:     { stringValue: String(partnerId) },
      partnerName:   { stringValue: partnerName },
      clientTimestamp: { integerValue: String(timestamp ?? 0) },
      serverTimestamp: { stringValue: new Date().toISOString() },
      itemsReceived: {
        arrayValue: {
          values: itemsReceived.map((item) => ({
            mapValue: {
              fields: {
                kind:     { stringValue: item.kind     ?? "unknown" },
                name:     { stringValue: item.name     ?? "Unknown" },
                category: { stringValue: item.category ?? "unknown" },
                properties: {
                  mapValue: {
                    fields: {
                      neon:      { booleanValue: item.properties?.neon      ?? false },
                      mega_neon: { booleanValue: item.properties?.mega_neon ?? false },
                      flyable:   { booleanValue: item.properties?.flyable   ?? false },
                      rideable:  { booleanValue: item.properties?.rideable  ?? false },
                      rarity:    { stringValue: item.properties?.rarity ?? "" },
                    },
                  },
                },
              },
            },
          })),
        },
      },
    };

    // POST to Firestore REST API (auto-generates doc ID)
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/trades/${userId}/history`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ success: false, error: "Firestore write failed", detail: err });
    }

    const data = await response.json();
    const docId = data.name?.split("/").pop();

    return res.status(200).json({
      success: true,
      tradeKey: docId,
      path: `trades/${userId}/history/${docId}`,
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}