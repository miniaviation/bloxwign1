// coinflip/index.js  — full rewrite using backend APIs + Firestore real-time

// ── Firebase config ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey           : window._fw_apiKey            ?? "",
  authDomain       : window._fw_authDomain        ?? "",
  projectId        : window._fw_projectId         ?? "",
  storageBucket    : window._fw_storageBucket     ?? "",
  messagingSenderId: window._fw_messagingSenderId ?? "",
  appId            : window._fw_appId             ?? "",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Helpers ────────────────────────────────────────────────────────────────
const escHtml = s =>
  String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const itemImg = name => `https://amvgg.com/items/${encodeURIComponent(name)}.webp`;
const fmtVal  = v    => `BW$ ${Number(v).toFixed(2)}`;

function getRange(cv) {
  return {
    min: Math.round(cv * 0.95 * 100) / 100,
    max: Math.round(cv * 1.10 * 100) / 100,
  };
}
function inRange(jv, cv) {
  const { min, max } = getRange(cv);
  return jv >= min && jv <= max;
}

// ── State ──────────────────────────────────────────────────────────────────
let valueMap      = {};
let myItems       = [];
let allGames      = [];
let activeFilter  = "all";

let createSelected = new Set();
let createGridItems = [];

let joiningGame    = null;
let joinSelected   = new Set();
let joinGridItems  = [];

// ── Chat state ─────────────────────────────────────────────────────────────
let chatMessages    = [];
let lastChatTs      = 0;
let chatPollTimer   = null;
let presencePingTimer = null;

// ── Session ────────────────────────────────────────────────────────────────
function getUsername() { return sessionStorage.getItem("bw_username") ?? null; }

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await Promise.all([loadValues(), loadInventory()]);
  listenGames();
  startChat();
  buildChatPanel();
}

// ── Values ─────────────────────────────────────────────────────────────────
async function loadValues() {
  try {
    const res  = await fetch("/api/amvgg-values", { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    (data.items ?? []).forEach(i => { if (i.name) valueMap[i.name] = i.value ?? null; });
  } catch (e) { console.warn("[CF] values:", e.message); }
}

// ── Inventory ──────────────────────────────────────────────────────────────
async function loadInventory() {
  const u = getUsername();
  if (!u) { myItems = []; return; }
  try {
    const res  = await fetch(`/api/inventory?username=${encodeURIComponent(u)}`, {
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    myItems = data.items ?? [];

    // Fetch user's locked items and mark them
    const lockSnap = await db.collection("locked_items").doc(u).get();
    const lockedSet = new Set(lockSnap.exists ? (lockSnap.data().items ?? []) : []);
    myItems = myItems.map(item => ({ ...item, _locked: lockedSet.has(item.name) }));
  } catch (e) {
    console.warn("[CF] inventory:", e.message);
    myItems = [];
  }
}

// ── Firestore: listen to waiting games ─────────────────────────────────────
function listenGames() {
  db.collection("coinflip_games")
    .where("status", "==", "waiting")
    .orderBy("createdAt", "desc")
    .onSnapshot(snap => {
      allGames = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderGames();
    }, err => console.error("[CF] Firestore:", err));
}

// ── Filter ─────────────────────────────────────────────────────────────────
function setFilter(el, val) {
  document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
  el.classList.add("active");
  activeFilter = val;
  renderGames();
}

function filterGames(games) {
  return games.filter(g => {
    const v = g.creatorValue ?? 0;
    if (activeFilter === "all")      return true;
    if (activeFilter === "lt50")     return v < 50;
    if (activeFilter === "50-200")   return v >= 50  && v <= 200;
    if (activeFilter === "200-1000") return v > 200  && v <= 1000;
    if (activeFilter === "gt1000")   return v > 1000;
    return true;
  });
}

// ── Render games ───────────────────────────────────────────────────────────
function renderGames() {
  const me       = getUsername();
  const list     = document.getElementById("gamesList");
  const filtered = filterGames(allGames);

  document.getElementById("gamesCount").textContent =
    `${filtered.length} game${filtered.length !== 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🪙</div>
        <div class="empty-text">No active games</div>
        <div class="empty-sub">Be the first to create one!</div>
      </div>`;
    return;
  }

  list.innerHTML = "";
  filtered.forEach(game => {
    const isOwn      = me && game.creatorUsername === me;
    const creatorVal = game.creatorValue ?? 0;
    const { min, max } = getRange(creatorVal);

    const items  = game.creatorItems ?? [];
    const showN  = Math.min(items.length, 5);
    const extra  = items.length - showN;
    let thumbsHtml = "";
    for (let i = 0; i < showN; i++) {
      thumbsHtml += `
        <div class="gc-thumb" title="${escHtml(items[i].name)}">
          <img src="${escHtml(itemImg(items[i].name))}" alt="${escHtml(items[i].name)}"
               onerror="this.style.display='none'" />
        </div>`;
    }
    if (extra > 0) thumbsHtml += `<div class="gc-thumb more-badge">+${extra}</div>`;

    const initials = (game.creatorUsername ?? "?").slice(0, 2).toUpperCase();

    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div class="gc-avatar">${initials}</div>
      <div class="gc-info">
        <div class="gc-name">${escHtml(game.creatorUsername ?? "?")}</div>
        <div class="gc-meta"><span class="waiting-dot"></span>Waiting for opponent
          &nbsp;·&nbsp; Range: ${fmtVal(min)} – ${fmtVal(max)}
        </div>
      </div>
      <div class="gc-items">${thumbsHtml}</div>
      <div class="gc-right">
        <div class="gc-value">${fmtVal(creatorVal)}</div>
        <div class="gc-chance-wrap">
          <div class="gc-chance-label">Creator win chance</div>
          <div class="gc-chance-bar">
            <div class="gc-chance-fill" style="width:50%"></div>
          </div>
          <div class="gc-chance-label">50%</div>
        </div>
        ${isOwn
          ? `<button class="btn-cancel-game" onclick="cancelGame('${game.id}')">Cancel</button>`
          : `<button class="btn-join" onclick="openJoinModal('${game.id}')">Join</button>`
        }
      </div>
    `;
    list.appendChild(card);
  });
}

// ── Cancel own game ────────────────────────────────────────────────────────
async function cancelGame(gameId) {
  const username = getUsername();
  if (!username) return;
  if (!confirm("Cancel your coinflip game?")) return;

  try {
    const res = await fetch("/api/coinflip/cancel", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ username, gameId }),
    });
    const data = await res.json();
    if (!data.success) alert(data.error ?? "Failed to cancel.");
    else await loadInventory(); // refresh locked state
  } catch (e) {
    alert("Network error cancelling game.");
  }
}

// ── Create Modal ───────────────────────────────────────────────────────────
function openCreateModal() {
  const username = getUsername();
  if (!username) { alert("You must be logged in to create a game."); return; }

  createSelected = new Set();
  document.getElementById("createSearch").value = "";
  document.getElementById("createTotalDisplay").textContent = "BW$ 0.00";
  document.getElementById("createRangeDisplay").textContent = "—";
  document.getElementById("createConfirmBtn").disabled = true;

  createGridItems = myItems.filter(item => !item._locked);
  renderCreateGrid(createGridItems);
  document.getElementById("createModal").classList.add("active");
}

function closeCreateModal() {
  document.getElementById("createModal").classList.remove("active");
}

function filterCreateGrid() {
  const q = document.getElementById("createSearch").value.toLowerCase().trim();
  const filtered = q ? createGridItems.filter(i => i.name.toLowerCase().includes(q)) : createGridItems;
  renderCreateGrid(filtered, true);
}

function renderCreateGrid(items, keepSel = false) {
  const grid = document.getElementById("createInvGrid");
  if (!keepSel) createSelected = new Set();

  if (items.length === 0) {
    grid.innerHTML = '<div class="inv-loading">No items found.</div>';
    updateCreateSummary(items);
    return;
  }

  grid.innerHTML = "";
  items.forEach((item, idx) => {
    const val  = valueMap[item.name] ?? null;
    const card = document.createElement("div");
    card.className = "inv-card" + (createSelected.has(idx) ? " selected" : "");
    card.innerHTML = `
      <div class="inv-card-img">
        <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}"
             onerror="this.style.display='none'" />
      </div>
      <div class="inv-card-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
      <div class="inv-card-val">${val != null ? fmtVal(val) : "—"}</div>
    `;
    card.addEventListener("click", () => {
      if (createSelected.has(idx)) createSelected.delete(idx);
      else createSelected.add(idx);
      card.classList.toggle("selected", createSelected.has(idx));
      updateCreateSummary(items);
    });
    grid.appendChild(card);
  });
  updateCreateSummary(items);
}

function updateCreateSummary(items) {
  let total = 0;
  createSelected.forEach(idx => { const it = items[idx]; if (it) total += valueMap[it.name] ?? 0; });

  document.getElementById("createTotalDisplay").textContent = fmtVal(total);
  if (createSelected.size > 0 && total > 0) {
    const { min, max } = getRange(total);
    document.getElementById("createRangeDisplay").textContent = `${fmtVal(min)} – ${fmtVal(max)}`;
    document.getElementById("createConfirmBtn").disabled = false;
  } else {
    document.getElementById("createRangeDisplay").textContent = "—";
    document.getElementById("createConfirmBtn").disabled = true;
  }
}

async function confirmCreate() {
  const username = getUsername();
  if (!username) return;

  const selectedItems = [...createSelected].map(idx => createGridItems[idx]).filter(Boolean);
  if (selectedItems.length === 0) return;

  const items = selectedItems.map(i => ({ name: i.name, value: valueMap[i.name] ?? 0 }));
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  if (totalValue <= 0) { alert("Selected items have no known value."); return; }

  const btn = document.getElementById("createConfirmBtn");
  btn.disabled = true;
  btn.textContent = "Creating…";

  try {
    const res  = await fetch("/api/coinflip/create", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ username, items }),
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.error ?? "Failed to create game.");
      btn.disabled = false;
      btn.textContent = "Create Game";
      return;
    }

    // Re-load inventory so locked items are marked
    await loadInventory();
    closeCreateModal();
  } catch (e) {
    alert("Network error. Please try again.");
    btn.disabled = false;
    btn.textContent = "Create Game";
  }
}

// ── Join Modal ─────────────────────────────────────────────────────────────
function openJoinModal(gameId) {
  const username = getUsername();
  if (!username) { alert("You must be logged in to join a game."); return; }

  joiningGame  = allGames.find(g => g.id === gameId);
  if (!joiningGame) return;

  joinSelected = new Set();
  document.getElementById("joinSearch").value = "";
  document.getElementById("joinTotalDisplay").textContent = "BW$ 0.00";
  document.getElementById("joinRangeStatus").textContent  = "";
  document.getElementById("joinRangeStatus").className    = "range-status";
  document.getElementById("joinConfirmBtn").disabled = true;

  const { min, max } = getRange(joiningGame.creatorValue);
  const creatorItems  = joiningGame.creatorItems ?? [];
  const initials      = (joiningGame.creatorUsername ?? "?").slice(0, 2).toUpperCase();

  // Creator's item thumbnails
  let thumbsHtml = creatorItems.slice(0, 8).map(item => `
    <div class="cp-thumb" title="${escHtml(item.name)}">
      <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}"
           onerror="this.style.display='none'" />
    </div>`).join("");

  // Creator items list below avatar
  let creatorItemsList = creatorItems.map(item => `
    <div class="join-creator-item">
      <div class="jci-thumb">
        <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}"
             onerror="this.style.display='none'" />
      </div>
      <span class="jci-name">${escHtml(item.name)}</span>
      <span class="jci-val">${fmtVal(item.value ?? 0)}</span>
    </div>`).join("");

  document.getElementById("joinCreatorPreview").innerHTML = `
    <div class="cp-avatar">${initials}</div>
    <div class="cp-info">
      <div class="cp-name">${escHtml(joiningGame.creatorUsername ?? "?")}</div>
      <div class="cp-label">Creator's wager — ${fmtVal(joiningGame.creatorValue)}</div>
      <div class="cp-items">${thumbsHtml}</div>
    </div>
    <div class="cp-value">${fmtVal(joiningGame.creatorValue)}</div>
  `;

  // Expandable creator items list
  const existingList = document.getElementById("joinCreatorItemsList");
  if (existingList) existingList.innerHTML = creatorItemsList;

  document.getElementById("joinRangePill").textContent =
    `Accepted range: ${fmtVal(min)} – ${fmtVal(max)}`;

  joinGridItems = myItems.filter(item => !item._locked);
  renderJoinGrid(joinGridItems);
  document.getElementById("joinModal").classList.add("active");
}

function closeJoinModal() {
  document.getElementById("joinModal").classList.remove("active");
  joiningGame = null;
}

function filterJoinGrid() {
  const q = document.getElementById("joinSearch").value.toLowerCase().trim();
  const filtered = q ? joinGridItems.filter(i => i.name.toLowerCase().includes(q)) : joinGridItems;
  renderJoinGrid(filtered, true);
}

function renderJoinGrid(items, keepSel = false) {
  const grid = document.getElementById("joinInvGrid");
  if (!keepSel) joinSelected = new Set();

  if (items.length === 0) {
    grid.innerHTML = '<div class="inv-loading">No items to wager.</div>';
    updateJoinSummary(items);
    return;
  }

  grid.innerHTML = "";
  items.forEach((item, idx) => {
    const val  = valueMap[item.name] ?? null;
    const card = document.createElement("div");
    card.className = "inv-card" + (joinSelected.has(idx) ? " selected" : "");
    card.innerHTML = `
      <div class="inv-card-img">
        <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}"
             onerror="this.style.display='none'" />
      </div>
      <div class="inv-card-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
      <div class="inv-card-val">${val != null ? fmtVal(val) : "—"}</div>
    `;
    card.addEventListener("click", () => {
      if (joinSelected.has(idx)) joinSelected.delete(idx);
      else joinSelected.add(idx);
      card.classList.toggle("selected", joinSelected.has(idx));
      updateJoinSummary(items);
    });
    grid.appendChild(card);
  });
  updateJoinSummary(items);
}

function updateJoinSummary(items) {
  if (!joiningGame) return;
  let total = 0;
  joinSelected.forEach(idx => { const it = items[idx]; if (it) total += valueMap[it.name] ?? 0; });

  document.getElementById("joinTotalDisplay").textContent = fmtVal(total);
  const statusEl = document.getElementById("joinRangeStatus");
  const btn      = document.getElementById("joinConfirmBtn");

  if (joinSelected.size === 0) {
    statusEl.textContent = ""; statusEl.className = "range-status"; btn.disabled = true; return;
  }
  if (inRange(total, joiningGame.creatorValue)) {
    statusEl.textContent = "✓ In range"; statusEl.className = "range-status ok"; btn.disabled = false;
  } else {
    statusEl.textContent = "✗ Out of range"; statusEl.className = "range-status bad"; btn.disabled = true;
  }
}

async function confirmJoin() {
  const username = getUsername();
  if (!username || !joiningGame) return;

  const selectedItems = [...joinSelected].map(idx => joinGridItems[idx]).filter(Boolean);
  if (selectedItems.length === 0) return;

  const items      = selectedItems.map(i => ({ name: i.name, value: valueMap[i.name] ?? 0 }));
  const totalValue = items.reduce((s, i) => s + i.value, 0);

  if (!inRange(totalValue, joiningGame.creatorValue)) {
    alert("Your wager is out of the accepted range.");
    return;
  }

  const btn = document.getElementById("joinConfirmBtn");
  btn.disabled = true;
  btn.textContent = "Joining…";

  try {
    const res  = await fetch("/api/coinflip/join", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ username, gameId: joiningGame.id, items }),
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.error ?? "Failed to join game.");
      btn.disabled = false;
      btn.textContent = "Join Game";
      return;
    }

    const snapshot = {
      creatorUsername: joiningGame.creatorUsername,
      creatorValue   : data.creatorValue,
      joinerUsername : username,
      joinerValue    : data.joinerValue,
      winner         : data.winner,
      me             : username,
      creatorChance  : data.creatorChance,
      joinerChance   : data.joinerChance,
    };

    await loadInventory(); // refresh locked state
    closeJoinModal();
    showFlipAnimation(snapshot);
  } catch (e) {
    alert("Network error. Please try again.");
    btn.disabled = false;
    btn.textContent = "Join Game";
  }
}

// ── Flip Animation ─────────────────────────────────────────────────────────
function showFlipAnimation({ creatorUsername, creatorValue, joinerUsername, joinerValue, winner, me, creatorChance, joinerChance }) {
  const overlay = document.getElementById("flipOverlay");
  const coin    = document.getElementById("flipCoin");
  const result  = document.getElementById("flipResult");
  const players = document.getElementById("flipPlayers");

  const totalPot = creatorValue + joinerValue;
  const ci = creatorUsername.slice(0, 2).toUpperCase();
  const ji = joinerUsername.slice(0, 2).toUpperCase();

  players.innerHTML = `
    <div class="fp-side">
      <div class="fp-avatar creator">${ci}</div>
      <div class="fp-name">${escHtml(creatorUsername)}</div>
      <div class="fp-value">${fmtVal(creatorValue)}</div>
      <div class="fp-chance">${creatorChance ?? Math.round((creatorValue/totalPot)*1000)/10}% chance</div>
    </div>
    <div class="fp-vs">VS</div>
    <div class="fp-side">
      <div class="fp-avatar joiner">${ji}</div>
      <div class="fp-name">${escHtml(joinerUsername)}</div>
      <div class="fp-value">${fmtVal(joinerValue)}</div>
      <div class="fp-chance">${joinerChance ?? Math.round((joinerValue/totalPot)*1000)/10}% chance</div>
    </div>
  `;

  result.innerHTML = "";
  coin.className   = "flip-coin";
  coin.textContent = "🪙";
  overlay.classList.add("active");

  setTimeout(() => coin.classList.add("spinning"), 300);

  setTimeout(() => {
    const didWin = winner === me;
    result.innerHTML = `
      <div class="flip-result-title ${didWin ? "win" : "lose"}">
        ${didWin ? "🏆 You Won!" : "💀 You Lost"}
      </div>
      <div class="flip-result-sub">
        ${didWin
          ? `${escHtml(winner)} won ${fmtVal(totalPot)} in items!`
          : `${escHtml(winner)} won the flip.`}
      </div>
      <button class="flip-result-close" onclick="closeFlip()">Close</button>
    `;
  }, 2600);
}

function closeFlip() {
  document.getElementById("flipOverlay").classList.remove("active");
}

// ── Chat ───────────────────────────────────────────────────────────────────
function buildChatPanel() {
  // Inject the chat panel HTML into the DOM
  const panel = document.createElement("div");
  panel.id = "chatPanel";
  panel.className = "chat-panel";
  panel.innerHTML = `
    <div class="chat-header">
      <span class="chat-title">Lobby Chat</span>
      <span class="chat-online" id="chatOnline">
        <span class="online-dot"></span><span id="onlineCount">0</span> online
      </span>
    </div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input-row">
      <input type="text" id="chatInput" class="chat-input" placeholder="Say something…" maxlength="200"
             onkeydown="if(event.key==='Enter')sendChat()" />
      <button class="chat-send-btn" onclick="sendChat()">↑</button>
    </div>
  `;
  document.querySelector(".content-area").appendChild(panel);
}

async function startChat() {
  await fetchChat();
  chatPollTimer     = setInterval(fetchChat, 4000);
  presencePingTimer = setInterval(pingPresence, 20000);
}

async function fetchChat() {
  const username = getUsername();
  try {
    const url = `/api/coinflip/chat?${username ? `username=${encodeURIComponent(username)}&` : ""}since=${lastChatTs}`;
    const res  = await fetch(url);
    const data = await res.json();

    // Update online count
    const oc = document.getElementById("onlineCount");
    if (oc) oc.textContent = data.onlineCount ?? 0;

    // Append new messages
    const newMsgs = (data.messages ?? []).filter(m => m.ts > lastChatTs);
    if (newMsgs.length > 0) {
      const container = document.getElementById("chatMessages");
      const atBottom  = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight < 40
        : true;

      newMsgs.forEach(m => {
        chatMessages.push(m);
        if (m.ts > lastChatTs) lastChatTs = m.ts;
        if (container) {
          const el = document.createElement("div");
          el.className = "chat-msg";
          el.innerHTML = `
            <span class="chat-user">${escHtml(m.username)}</span>
            <span class="chat-text">${escHtml(m.message)}</span>
          `;
          container.appendChild(el);
        }
      });

      // Keep max 200 messages in DOM
      if (container && container.children.length > 200) {
        while (container.children.length > 200) container.removeChild(container.firstChild);
      }

      if (atBottom && container) container.scrollTop = container.scrollHeight;
    }
  } catch (e) { /* silent */ }
}

async function pingPresence() {
  const username = getUsername();
  if (!username) return;
  try {
    await fetch(`/api/coinflip/chat?username=${encodeURIComponent(username)}`);
  } catch (e) { /* silent */ }
}

async function sendChat() {
  const username = getUsername();
  if (!username) { alert("Log in to chat."); return; }
  const input = document.getElementById("chatInput");
  const msg   = input?.value?.trim();
  if (!msg) return;

  input.value = "";
  try {
    await fetch("/api/coinflip/chat", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ username, message: msg }),
    });
    // fetchChat will pick up the new message on next poll (or we can call now)
    await fetchChat();
  } catch (e) {
    alert("Failed to send message.");
  }
}

// ── Keyboard / overlay close ───────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeCreateModal(); closeJoinModal(); closeFlip(); }
});

document.getElementById("createModal").addEventListener("click", function(e) {
  if (e.target === this) closeCreateModal();
});
document.getElementById("joinModal").addEventListener("click", function(e) {
  if (e.target === this) closeJoinModal();
});
document.getElementById("flipOverlay").addEventListener("click", function(e) {
  if (e.target === this) closeFlip();
});

// ── Start ──────────────────────────────────────────────────────────────────
boot();