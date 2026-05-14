// api/coinflip/join.js
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

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { username, gameId, items } = req.body ?? {};

  if (!username || !gameId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing username, gameId, or items" });
  }

  try {
    // ── 1. Validate game still exists & is waiting ─────────────────────────
    const gameRef  = db.collection("coinflip_games").doc(gameId);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists || gameSnap.data().status !== "waiting") {
      return res.status(409).json({ error: "Game no longer available." });
    }

    const game = gameSnap.data();

    if (game.creatorUsername === username) {
      return res.status(400).json({ error: "You cannot join your own game." });
    }

    // ── 2. Check joiner's items aren't locked ─────────────────────────────
    const itemNames = items.map(i => i.name);
    const lockedDoc = await db.collection("locked_items").doc(username).get();
    if (lockedDoc.exists) {
      const lockedSet = new Set(lockedDoc.data().items ?? []);
      const conflict  = itemNames.filter(n => lockedSet.has(n));
      if (conflict.length > 0) {
        return res.status(409).json({
          error: `These items are already in use: ${conflict.join(", ")}`,
        });
      }
    }

    // ── 3. Validate range ──────────────────────────────────────────────────
    const joinerValue  = items.reduce((s, i) => s + (i.value ?? 0), 0);
    const creatorValue = game.creatorValue;
    const min = Math.round(creatorValue * 0.95 * 100) / 100;
    const max = Math.round(creatorValue * 1.10 * 100) / 100;

    if (joinerValue < min || joinerValue > max) {
      return res.status(400).json({
        error: `Wager BW$${joinerValue.toFixed(2)} is outside accepted range BW$${min.toFixed(2)} – BW$${max.toFixed(2)}`,
      });
    }

    // ── 4. Lock joiner's items ─────────────────────────────────────────────
    await db.collection("locked_items").doc(username).set(
      { items: admin.firestore.FieldValue.arrayUnion(...itemNames) },
      { merge: true }
    );

    // ── 5. Run server-side coin flip ───────────────────────────────────────
    const totalPot    = creatorValue + joinerValue;
    const rand        = Math.random() * totalPot;
    const creatorWins = rand < creatorValue;

    const winner = creatorWins ? game.creatorUsername : username;
    const loser  = creatorWins ? username : game.creatorUsername;
    const allItems = [
      ...(game.creatorItems ?? []),
      ...items,
    ];
    const totalValue = allItems.reduce((s, i) => s + (i.value ?? 0), 0);

    // ── 6. Update game to completed ────────────────────────────────────────
    await gameRef.update({
      status          : "completed",
      joinerUsername  : username,
      joinerItems     : items,
      joinerValue     : joinerValue,
      winner          : winner,
      loser           : loser,
      winnerItems     : allItems,
      totalPot        : totalPot,
      creatorChance   : Math.round((creatorValue / totalPot) * 1000) / 10,
      joinerChance    : Math.round((joinerValue  / totalPot) * 1000) / 10,
      completedAt     : admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── 7. Save winnings to winner's profile ───────────────────────────────
    const winRef  = db.collection("coinflip_winnings").doc(winner);
    const winSnap = await winRef.get();
    const entry   = {
      gameId,
      items      : allItems,
      wonAt      : Date.now(),
      totalValue,
      opponent   : winner === game.creatorUsername ? username : game.creatorUsername,
    };

    if (winSnap.exists) {
      await winRef.update({
        wins      : admin.firestore.FieldValue.arrayUnion(entry),
        lastWonAt : admin.firestore.FieldValue.serverTimestamp(),
        totalWon  : admin.firestore.FieldValue.increment(totalValue),
      });
    } else {
      await winRef.set({
        username   : winner,
        wins       : [entry],
        firstWonAt : admin.firestore.FieldValue.serverTimestamp(),
        lastWonAt  : admin.firestore.FieldValue.serverTimestamp(),
        totalWon   : totalValue,
      });
    }

    // ── 8. Unlock items for BOTH players (items go to winner) ──────────────
    // Creator's items: remove lock regardless (game over)
    await db.collection("locked_items").doc(game.creatorUsername).set(
      { items: [] },
      { merge: false }
    );
    // Loser's items: remove lock (they lost them but they're no longer "in game")
    await db.collection("locked_items").doc(loser).set(
      { items: [] },
      { merge: false }
    );
    // Winner's locked items also cleared (the winnings are tracked in coinflip_winnings)
    if (winner !== game.creatorUsername && winner !== loser) {
      await db.collection("locked_items").doc(winner).set({ items: [] }, { merge: false });
    }

    return res.status(200).json({
      success        : true,
      winner,
      loser,
      creatorWins,
      joinerValue,
      creatorValue,
      totalPot,
      creatorChance  : Math.round((creatorValue / totalPot) * 1000) / 10,
      joinerChance   : Math.round((joinerValue  / totalPot) * 1000) / 10,
    });

  } catch (err) {
    console.error("[Coinflip] join error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}