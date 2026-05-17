// api/coinflip/games.js
// Returns all currently-waiting coinflip games, sorted newest first.
// Used as a REST fallback alongside (or instead of) the Firestore
// onSnapshot listener so games always appear even when the client-side
// Firebase SDK is slow to connect or fails silently.

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

  try {
    const snap = await db
      .collection("coinflip_games")
      .where("status", "==", "waiting")
      .orderBy("createdAtMs", "desc")
      .get();

    const games = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id              : doc.id,
        creatorUsername : data.creatorUsername  ?? null,
        creatorItems    : data.creatorItems     ?? [],
        creatorValue    : data.creatorValue     ?? 0,
        creatorSide     : data.creatorSide      ?? "heads",
        status          : data.status,
        createdAtMs     : data.createdAtMs      ?? 0,
      };
    });

    // Cache for 2 seconds — short enough to feel live, long enough to avoid
    // hammering Firestore on every poll interval.
    res.setHeader("Cache-Control", "public, max-age=2, stale-while-revalidate=4");
    return res.status(200).json({ games });
  } catch (err) {
    console.error("[coinflip/games] error:", err);
    return res.status(500).json({ error: "Failed to fetch games", details: err.message });
  }
}