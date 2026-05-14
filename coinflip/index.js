// ── Firebase config ────────────────────────────────────────────────────────
// Set your own config values via environment or hardcode here for Vercel
// (use Vercel env vars injected at build time, or a /api/config endpoint)
const firebaseConfig = {
  apiKey           : window._fw_apiKey            ?? '',
  authDomain       : window._fw_authDomain        ?? '',
  projectId        : window._fw_projectId         ?? '',
  storageBucket    : window._fw_storageBucket     ?? '',
  messagingSenderId: window._fw_messagingSenderId ?? '',
  appId            : window._fw_appId             ?? '',
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function itemImg(name) {
  return `https://amvgg.com/items/${encodeURIComponent(name)}.webp`;
}

function fmtVal(v) {
  return `BW$ ${Number(v).toFixed(2)}`;
}

// Joiner range: ±10% of creator value, but floor at 95% and cap at 110%
function getRange(creatorValue) {
  const min = Math.round(creatorValue * 0.95 * 100) / 100;
  const max = Math.round(creatorValue * 1.10 * 100) / 100;
  return { min, max };
}

function inRange(joinerValue, creatorValue) {
  const { min, max } = getRange(creatorValue);
  return joinerValue >= min && joinerValue <= max;
}

// Win chance: creator's share of total pot
function winChance(creatorValue, joinerValue) {
  const total = creatorValue + joinerValue;
  if (!total) return 50;
  return Math.round((creatorValue / total) * 1000) / 10;
}

// ── State ──────────────────────────────────────────────────────────────────
let valueMap  = {};   // item name → BW$ value
let myItems   = [];   // full inventory of logged-in user
let allGames  = [];   // local mirror of Firestore coinflip_games
let activeFilter = 'all';

// For create modal
let createSelected = new Set();   // indices into myItems
let createAllItems = [];          // filtered items shown in grid

// For join modal
let joiningGame   = null;         // game object being joined
let joinSelected  = new Set();
let joinAllItems  = [];

// ── Session ────────────────────────────────────────────────────────────────
function getUsername() {
  return sessionStorage.getItem('bw_username') ?? null;
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await loadValues();
  await loadInventory();
  listenGames();
}

// ── Load item values ───────────────────────────────────────────────────────
async function loadValues() {
  try {
    const res = await fetch('/api/amvgg-values', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    (data.items ?? []).forEach(item => {
      if (item.name) valueMap[item.name] = item.value ?? null;
    });
  } catch (e) {
    console.warn('[Coinflip] Could not load values:', e.message);
  }
}

// ── Load user inventory ────────────────────────────────────────────────────
async function loadInventory() {
  const username = getUsername();
  if (!username) { myItems = []; return; }
  try {
    const res = await fetch(`/api/inventory?username=${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    myItems = data.items ?? [];
  } catch (e) {
    console.warn('[Coinflip] Inventory load failed:', e.message);
    myItems = [];
  }
}

// ── Listen to Firestore coinflip_games ────────────────────────────────────
function listenGames() {
  db.collection('coinflip_games')
    .where('status', '==', 'waiting')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      allGames = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderGames();
    }, err => {
      console.error('[Coinflip] Firestore listen error:', err);
    });
}

// ── Filter ─────────────────────────────────────────────────────────────────
function setFilter(el, val) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  activeFilter = val;
  renderGames();
}

function filterGames(games) {
  return games.filter(g => {
    const v = g.creatorValue ?? 0;
    if (activeFilter === 'all')     return true;
    if (activeFilter === 'lt50')    return v < 50;
    if (activeFilter === '50-200')  return v >= 50  && v <= 200;
    if (activeFilter === '200-1000')return v > 200  && v <= 1000;
    if (activeFilter === 'gt1000')  return v > 1000;
    return true;
  });
}

// ── Render games list ──────────────────────────────────────────────────────
function renderGames() {
  const me       = getUsername();
  const list     = document.getElementById('gamesList');
  const filtered = filterGames(allGames);

  document.getElementById('gamesCount').textContent =
    `${filtered.length} game${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🪙</div>
        <div class="empty-text">No active games</div>
        <div class="empty-sub">Be the first to create one!</div>
      </div>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach(game => {
    const isOwn      = me && game.creatorUsername === me;
    const creatorVal = game.creatorValue ?? 0;
    const { min, max } = getRange(creatorVal);

    // Build item thumbs (max 5 shown + overflow)
    const items = game.creatorItems ?? [];
    const showN = Math.min(items.length, 5);
    const extra = items.length - showN;
    let thumbsHtml = '';
    for (let i = 0; i < showN; i++) {
      thumbsHtml += `
        <div class="gc-thumb">
          <img src="${escHtml(itemImg(items[i].name))}" alt="${escHtml(items[i].name)}" onerror="this.style.display='none'" />
        </div>`;
    }
    if (extra > 0) {
      thumbsHtml += `<div class="gc-thumb more-badge">+${extra}</div>`;
    }

    const initials = (game.creatorUsername ?? '?').slice(0, 2).toUpperCase();

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="gc-avatar">${initials}</div>
      <div class="gc-info">
        <div class="gc-name">${escHtml(game.creatorUsername ?? '?')}</div>
        <div class="gc-meta">
          <span class="waiting-dot"></span>Waiting for opponent
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
          <div class="gc-chance-label" id="chance-${game.id}">50%</div>
        </div>
        ${isOwn
          ? `<div class="btn-own">Your Game</div>`
          : `<button class="btn-join" onclick="openJoinModal('${game.id}')">Join</button>`
        }
      </div>
    `;
    list.appendChild(card);
  });
}

// ── Create Modal ───────────────────────────────────────────────────────────
function openCreateModal() {
  const username = getUsername();
  if (!username) { alert('You must be logged in to create a game.'); return; }

  createSelected = new Set();
  document.getElementById('createSearch').value = '';
  document.getElementById('createTotalDisplay').textContent = 'BW$ 0.00';
  document.getElementById('createRangeDisplay').textContent = '—';
  document.getElementById('createConfirmBtn').disabled = true;

  // Filter out items already locked in an active game
  createAllItems = myItems.filter(item => !item._locked);
  renderCreateGrid(createAllItems);
  document.getElementById('createModal').classList.add('active');
}

function closeCreateModal() {
  document.getElementById('createModal').classList.remove('active');
}

function filterCreateGrid() {
  const q = document.getElementById('createSearch').value.toLowerCase().trim();
  const filtered = q ? createAllItems.filter(i => i.name.toLowerCase().includes(q)) : createAllItems;
  renderCreateGrid(filtered, true);
}

function renderCreateGrid(items, keepSelection = false) {
  const grid = document.getElementById('createInvGrid');
  if (!keepSelection) createSelected = new Set();

  if (items.length === 0) {
    grid.innerHTML = '<div class="inv-loading">No items found.</div>';
    return;
  }

  grid.innerHTML = '';
  items.forEach((item, idx) => {
    const val  = valueMap[item.name] ?? null;
    const card = document.createElement('div');
    card.className = 'inv-card' + (createSelected.has(idx) ? ' selected' : '');
    card.innerHTML = `
      <div class="inv-card-img">
        <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}" onerror="this.style.display='none'" />
      </div>
      <div class="inv-card-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
      <div class="inv-card-val">${val != null ? fmtVal(val) : '—'}</div>
    `;
    card.addEventListener('click', () => {
      if (createSelected.has(idx)) createSelected.delete(idx);
      else createSelected.add(idx);
      card.classList.toggle('selected', createSelected.has(idx));
      updateCreateSummary(items);
    });
    grid.appendChild(card);
  });

  updateCreateSummary(items);
}

function updateCreateSummary(items) {
  let total = 0;
  createSelected.forEach(idx => {
    const item = items[idx];
    if (item) total += valueMap[item.name] ?? 0;
  });

  document.getElementById('createTotalDisplay').textContent = fmtVal(total);

  if (createSelected.size > 0 && total > 0) {
    const { min, max } = getRange(total);
    document.getElementById('createRangeDisplay').textContent = `${fmtVal(min)} – ${fmtVal(max)}`;
    document.getElementById('createConfirmBtn').disabled = false;
  } else {
    document.getElementById('createRangeDisplay').textContent = '—';
    document.getElementById('createConfirmBtn').disabled = true;
  }
}

async function confirmCreate() {
  const username = getUsername();
  if (!username) return;

  // Gather selected items from the currently rendered grid
  const gridItems = createAllItems; // same reference used in renderCreateGrid
  const selectedItems = [...createSelected].map(idx => gridItems[idx]).filter(Boolean);
  if (selectedItems.length === 0) return;

  const totalValue = selectedItems.reduce((s, item) => s + (valueMap[item.name] ?? 0), 0);
  if (totalValue <= 0) { alert('Selected items have no known value.'); return; }

  const btn = document.getElementById('createConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  // Check if user already has an open game
  const existingSnap = await db.collection('coinflip_games')
    .where('creatorUsername', '==', username)
    .where('status', '==', 'waiting')
    .get();

  if (!existingSnap.empty) {
    alert('You already have an active coinflip game!');
    btn.disabled = false;
    btn.textContent = 'Create Game';
    return;
  }

  // Lock item names to prevent reuse (stored in game doc, enforced client-side)
  const itemNames = selectedItems.map(i => i.name);

  try {
    await db.collection('coinflip_games').add({
      creatorUsername : username,
      creatorItems    : selectedItems.map(i => ({ name: i.name, value: valueMap[i.name] ?? 0 })),
      creatorValue    : totalValue,
      status          : 'waiting',
      createdAt       : firebase.firestore.FieldValue.serverTimestamp(),
      lockedItems     : itemNames,
    });
    closeCreateModal();
  } catch (e) {
    console.error('[Coinflip] Create game error:', e);
    alert('Failed to create game. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Create Game';
  }
}

// ── Join Modal ─────────────────────────────────────────────────────────────
function openJoinModal(gameId) {
  const username = getUsername();
  if (!username) { alert('You must be logged in to join a game.'); return; }

  joiningGame  = allGames.find(g => g.id === gameId);
  if (!joiningGame) return;

  joinSelected = new Set();
  document.getElementById('joinSearch').value = '';
  document.getElementById('joinTotalDisplay').textContent = 'BW$ 0.00';
  document.getElementById('joinRangeStatus').textContent  = '';
  document.getElementById('joinRangeStatus').className    = 'range-status';
  document.getElementById('joinConfirmBtn').disabled = true;

  const { min, max } = getRange(joiningGame.creatorValue);

  // Creator preview
  const creatorItems = joiningGame.creatorItems ?? [];
  const initials     = (joiningGame.creatorUsername ?? '?').slice(0, 2).toUpperCase();
  let thumbsHtml = creatorItems.slice(0, 6).map(item => `
    <div class="cp-thumb">
      <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}" onerror="this.style.display='none'" />
    </div>`).join('');

  document.getElementById('joinCreatorPreview').innerHTML = `
    <div class="cp-avatar">${initials}</div>
    <div class="cp-info">
      <div class="cp-name">${escHtml(joiningGame.creatorUsername ?? '?')}</div>
      <div class="cp-label">Creator's wager</div>
      <div class="cp-items">${thumbsHtml}</div>
    </div>
    <div class="cp-value">${fmtVal(joiningGame.creatorValue)}</div>
  `;

  document.getElementById('joinRangePill').textContent =
    `Accepted range: ${fmtVal(min)} – ${fmtVal(max)}`;

  // Filter out items locked in active games
  joinAllItems = myItems.filter(item => !item._locked);
  renderJoinGrid(joinAllItems);
  document.getElementById('joinModal').classList.add('active');
}

function closeJoinModal() {
  document.getElementById('joinModal').classList.remove('active');
  joiningGame = null;
}

function filterJoinGrid() {
  const q = document.getElementById('joinSearch').value.toLowerCase().trim();
  const filtered = q ? joinAllItems.filter(i => i.name.toLowerCase().includes(q)) : joinAllItems;
  renderJoinGrid(filtered, true);
}

function renderJoinGrid(items, keepSelection = false) {
  const grid = document.getElementById('joinInvGrid');
  if (!keepSelection) joinSelected = new Set();

  if (items.length === 0) {
    grid.innerHTML = '<div class="inv-loading">No items found.</div>';
    return;
  }

  const { min, max } = getRange(joiningGame.creatorValue);

  grid.innerHTML = '';
  items.forEach((item, idx) => {
    const val     = valueMap[item.name] ?? null;
    const inRng   = val != null ? (val >= min && val <= max) : false;
    const card    = document.createElement('div');

    // Compute total if we add this item to current selection
    // Items are additive: we check total against range
    card.className = 'inv-card' + (joinSelected.has(idx) ? ' selected' : '');

    card.innerHTML = `
      <div class="inv-card-img">
        <img src="${escHtml(itemImg(item.name))}" alt="${escHtml(item.name)}" onerror="this.style.display='none'" />
      </div>
      <div class="inv-card-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
      <div class="inv-card-val">${val != null ? fmtVal(val) : '—'}</div>
    `;

    card.addEventListener('click', () => {
      if (joinSelected.has(idx)) joinSelected.delete(idx);
      else joinSelected.add(idx);
      card.classList.toggle('selected', joinSelected.has(idx));
      updateJoinSummary(items);
    });

    grid.appendChild(card);
  });

  updateJoinSummary(items);
}

function updateJoinSummary(items) {
  if (!joiningGame) return;
  let total = 0;
  joinSelected.forEach(idx => {
    const item = items[idx];
    if (item) total += valueMap[item.name] ?? 0;
  });

  document.getElementById('joinTotalDisplay').textContent = fmtVal(total);

  const statusEl = document.getElementById('joinRangeStatus');
  const btn      = document.getElementById('joinConfirmBtn');

  if (joinSelected.size === 0) {
    statusEl.textContent = '';
    statusEl.className   = 'range-status';
    btn.disabled = true;
    return;
  }

  if (inRange(total, joiningGame.creatorValue)) {
    statusEl.textContent = '✓ In range';
    statusEl.className   = 'range-status ok';
    btn.disabled = false;
  } else {
    statusEl.textContent = '✗ Out of range';
    statusEl.className   = 'range-status bad';
    btn.disabled = true;
  }
}

async function confirmJoin() {
  const username = getUsername();
  if (!username || !joiningGame) return;

  const items = joinAllItems;
  const selectedItems = [...joinSelected].map(idx => items[idx]).filter(Boolean);
  if (selectedItems.length === 0) return;

  const totalValue = selectedItems.reduce((s, item) => s + (valueMap[item.name] ?? 0), 0);
  if (!inRange(totalValue, joiningGame.creatorValue)) {
    alert('Your wager is out of the accepted range.');
    return;
  }

  const btn = document.getElementById('joinConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Joining…';

  // Check user doesn't already have a game
  const existingSnap = await db.collection('coinflip_games')
    .where('joinerUsername', '==', username)
    .where('status', '==', 'waiting')
    .get();

  // Also check they aren't the creator of any waiting game
  const creatorSnap = await db.collection('coinflip_games')
    .where('creatorUsername', '==', username)
    .where('status', '==', 'waiting')
    .get();

  if (!existingSnap.empty || !creatorSnap.empty) {
    alert('You already have an active coinflip game!');
    btn.disabled = false;
    btn.textContent = 'Join Game';
    return;
  }

  const gameRef   = db.collection('coinflip_games').doc(joiningGame.id);
  const gameSnap  = await gameRef.get();
  if (!gameSnap.exists || gameSnap.data().status !== 'waiting') {
    alert('This game is no longer available.');
    closeJoinModal();
    return;
  }

  // Determine winner
  const creatorValue = joiningGame.creatorValue;
  const joinerValue  = totalValue;
  const totalPot     = creatorValue + joinerValue;
  const rand         = Math.random() * totalPot;
  const creatorWins  = rand < creatorValue;

  const winner = creatorWins ? joiningGame.creatorUsername : username;
  const loser  = creatorWins ? username : joiningGame.creatorUsername;
  const allItems = [
    ...(joiningGame.creatorItems ?? []),
    ...selectedItems.map(i => ({ name: i.name, value: valueMap[i.name] ?? 0 })),
  ];

  try {
    await gameRef.update({
      status          : 'completed',
      joinerUsername  : username,
      joinerItems     : selectedItems.map(i => ({ name: i.name, value: valueMap[i.name] ?? 0 })),
      joinerValue     : joinerValue,
      winner          : winner,
      loser           : loser,
      winnerItems     : allItems,
      completedAt     : firebase.firestore.FieldValue.serverTimestamp(),
      creatorChance   : Math.round((creatorValue / totalPot) * 1000) / 10,
      joinerChance    : Math.round((joinerValue  / totalPot) * 1000) / 10,
    });

    // Save winnings to winner's profile in Firestore
    await saveWinnings(winner, allItems, joiningGame.id);

    closeJoinModal();
    showFlipAnimation({
      creatorUsername : joiningGame.creatorUsername,
      creatorValue    : creatorValue,
      joinerUsername  : username,
      joinerValue     : joinerValue,
      winner          : winner,
      me              : username,
    });

  } catch (e) {
    console.error('[Coinflip] Join error:', e);
    alert('Failed to join game. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Join Game';
  }
}

// ── Save winnings to Firestore ─────────────────────────────────────────────
async function saveWinnings(winnerUsername, items, gameId) {
  const ref = db.collection('coinflip_winnings').doc(winnerUsername);
  const snap = await ref.get();

  const entry = {
    gameId     : gameId,
    items      : items,
    wonAt      : Date.now(),
    totalValue : items.reduce((s, i) => s + (i.value ?? 0), 0),
  };

  if (snap.exists) {
    await ref.update({
      wins     : firebase.firestore.FieldValue.arrayUnion(entry),
      lastWonAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set({
      username  : winnerUsername,
      wins      : [entry],
      firstWonAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastWonAt : firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}

// ── Flip Animation ─────────────────────────────────────────────────────────
function showFlipAnimation({ creatorUsername, creatorValue, joinerUsername, joinerValue, winner, me }) {
  const overlay = document.getElementById('flipOverlay');
  const coin    = document.getElementById('flipCoin');
  const result  = document.getElementById('flipResult');
  const players = document.getElementById('flipPlayers');

  const totalPot     = creatorValue + joinerValue;
  const creatorChance = Math.round((creatorValue / totalPot) * 1000) / 10;
  const joinerChance  = Math.round((joinerValue  / totalPot) * 1000) / 10;

  const ci = creatorUsername.slice(0, 2).toUpperCase();
  const ji = joinerUsername.slice(0, 2).toUpperCase();

  players.innerHTML = `
    <div class="fp-side">
      <div class="fp-avatar creator">${ci}</div>
      <div class="fp-name">${escHtml(creatorUsername)}</div>
      <div class="fp-value">${fmtVal(creatorValue)}</div>
      <div class="fp-chance">${creatorChance}% chance</div>
    </div>
    <div class="fp-vs">VS</div>
    <div class="fp-side">
      <div class="fp-avatar joiner">${ji}</div>
      <div class="fp-name">${escHtml(joinerUsername)}</div>
      <div class="fp-value">${fmtVal(joinerValue)}</div>
      <div class="fp-chance">${joinerChance}% chance</div>
    </div>
  `;

  result.innerHTML  = '';
  coin.className    = 'flip-coin';
  coin.textContent  = '🪙';
  overlay.classList.add('active');

  // Start spin after short delay
  setTimeout(() => {
    coin.classList.add('spinning');
  }, 300);

  // Show result after animation
  setTimeout(() => {
    const didWin = winner === me;
    const totalVal = fmtVal(totalPot);
    result.innerHTML = `
      <div class="flip-result-title ${didWin ? 'win' : 'lose'}">
        ${didWin ? '🏆 You Won!' : '💀 You Lost'}
      </div>
      <div class="flip-result-sub">
        ${didWin
          ? `${escHtml(winner)} won ${totalVal} in items!`
          : `${escHtml(winner)} won the flip.`}
      </div>
      <button class="flip-result-close" onclick="closeFlip()">Close</button>
    `;
  }, 2500);
}

function closeFlip() {
  document.getElementById('flipOverlay').classList.remove('active');
}

// ── Keyboard close ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCreateModal();
    closeJoinModal();
    closeFlip();
  }
});

// Close modals on overlay click
document.getElementById('createModal').addEventListener('click', function(e) {
  if (e.target === this) closeCreateModal();
});
document.getElementById('joinModal').addEventListener('click', function(e) {
  if (e.target === this) closeJoinModal();
});
document.getElementById('flipOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeFlip();
});

// ── Start ──────────────────────────────────────────────────────────────────
boot();