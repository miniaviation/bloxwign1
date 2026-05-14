// api/coinflip/chat.js
// Handles chat messages + online presence for the coinflip lobby.
//
// POST { username, message }  → add a chat message
// GET  ?since=<timestamp>     → fetch recent messages + online count

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

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

const CHAT_LIMIT     = 80;   // max messages to return
const ONLINE_TIMEOUT = 30;   // seconds before a user is considered offline

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── POST: send a message ───────────────────────────────────────────────
  if (req.method === "POST") {
    const { username, message } = req.body ?? {};
    if (!username || !message?.trim()) {
      return res.status(400).json({ error: "Missing username or message" });
    }

    const text = String(message).trim().slice(0, 200);

    try {
      await db.collection("coinflip_chat").add({
        username,
        message : text,
        sentAt  : admin.firestore.FieldValue.serverTimestamp(),
        ts      : Date.now(),
      });

      // Update presence
      await db.collection("coinflip_presence").doc(username).set({
        username,
        lastSeen: Date.now(),
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to send message", details: err.message });
    }
  }

  // ── GET: fetch messages + online count ────────────────────────────────
  if (req.method === "GET") {
    const { username, since } = req.query;

    try {
      // Update presence if username supplied
      if (username) {
        await db.collection("coinflip_presence").doc(username).set({
          username,
          lastSeen: Date.now(),
        });
      }

      // Fetch recent messages
      let query = db.collection("coinflip_chat")
        .orderBy("ts", "desc")
        .limit(CHAT_LIMIT);

      if (since) {
        query = query.where("ts", ">", Number(since));
      }

      const snap = await query.get();
      const messages = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .reverse();

      // Count online users (seen in last ONLINE_TIMEOUT seconds)
      const cutoff  = Date.now() - ONLINE_TIMEOUT * 1000;
      const presSnap = await db.collection("coinflip_presence")
        .where("lastSeen", ">=", cutoff)
        .get();
      const onlineCount = presSnap.size;

      return res.status(200).json({ messages, onlineCount });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch chat", details: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}