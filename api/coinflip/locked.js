// api/coinflip/locked.js
// Returns the list of item names currently locked for a user.
// Used by the client instead of a direct Firestore .get() to avoid
// the "client is offline" race on page load.

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
  if (!username) return res.status(400).json({ error: "Missing username" });

  try {
    const snap = await db.collection("locked_items").doc(username).get();
    const items = snap.exists ? (snap.data().items ?? []) : [];
    return res.status(200).json({ items });
  } catch (err) {
    console.error("[locked] error:", err);
    // Return empty rather than erroring — client treats nothing as locked
    return res.status(200).json({ items: [] });
  }
}