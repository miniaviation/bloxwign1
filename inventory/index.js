// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

// ── Item image via amvgg.com ──────────────────────────────────────────────────
function itemImageUrl(name) {
  return `https://amvgg.com/items/${encodeURIComponent(name)}.webp`;
}

// ── State ─────────────────────────────────────────────────────────────────────
let allItems      = [];
let selectedItems = new Set();
let valueMap      = {};

// ── Session username ──────────────────────────────────────────────────────────
function getLoggedInUsername() {
  return sessionStorage.getItem('bw_username') ?? null;
}

// ── Load values ───────────────────────────────────────────────────────────────
async function loadValues() {
  try {
    const res = await fetch('/api/amvgg-values', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    (data.items ?? []).forEach(item => {
      if (item.name) valueMap[item.name] = item.value ?? null;
    });
  } catch (err) {
    console.warn('[BetWing] Could not load amvgg values:', err.message);
  }
}

// ── Inventory fetch ───────────────────────────────────────────────────────────
async function loadInventory() {
  const username = getLoggedInUsername();
  if (!username) {
    renderItems([]);
    showBanner('Not logged in. Please <a href="/">log in</a> first.');
    return;
  }
  setLoadingState(true);
  try {
    const res = await fetch(`/api/inventory?username=${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allItems = data.items ?? [];
    renderItems(allItems);
  } catch (err) {
    console.error('[BetWing] Inventory fetch failed:', err);
    showBanner('Failed to load inventory. Please try refreshing.');
  } finally {
    setLoadingState(false);
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderItems(items) {
  const grid = document.getElementById('itemsGrid');
  [...grid.children].slice(1).forEach(k => k.remove());

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No items in your inventory yet.';
    grid.appendChild(empty);
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    if (selectedItems.has(idx)) card.classList.add('selected');

    const imgUrl  = itemImageUrl(item.name);
    const val     = valueMap[item.name];
    const valHtml = val != null
      ? `<span class="item-value"><span class="item-value-currency">BW$</span>${val}</span>`
      : `<span class="item-value item-value-unknown"><span class="item-value-currency">BW$</span>—</span>`;

    card.innerHTML = `
      <div class="item-img-wrap">
        <img
          src="${escHtml(imgUrl)}"
          alt="${escHtml(item.name)}"
          class="item-img"
          onerror="this.style.display='none'"
        />
      </div>
      <span class="item-name">${escHtml(item.name)}</span>
      ${valHtml}
    `;

    card.addEventListener('click', () => toggleSelect(idx, card));
    grid.appendChild(card);
  });

  updateWithdrawBtn();
}

// ── Selection ─────────────────────────────────────────────────────────────────
function toggleSelect(idx, card) {
  if (selectedItems.has(idx)) {
    selectedItems.delete(idx);
    card.classList.remove('selected');
  } else {
    selectedItems.add(idx);
    card.classList.add('selected');
  }
  updateWithdrawBtn();
}

function updateWithdrawBtn() {
  const btn = document.getElementById('withdrawBtn');
  btn.textContent = `Withdraw (${selectedItems.size})`;
  btn.disabled = selectedItems.size === 0;
}

// ── Search / filter ───────────────────────────────────────────────────────────
function filterItems() {
  const val = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = val ? allItems.filter(i => i.name.toLowerCase().includes(val)) : allItems;
  selectedItems.clear();
  renderItems(filtered);
}

// ── Refresh ───────────────────────────────────────────────────────────────────
function refreshInventory() {
  document.getElementById('searchInput').value = '';
  selectedItems.clear();
  loadInventory();
}

// ── Deposit ───────────────────────────────────────────────────────────────────
function showDepositMsg() {
  alert('Deposits are coming soon. Stay tuned for the BetWing launch!');
}

// ── Withdraw ──────────────────────────────────────────────────────────────────
async function handleWithdraw() {
  const username = getLoggedInUsername();
  if (!username) { showBanner('Not logged in.'); return; }
  if (selectedItems.size === 0) return;

  const btn = document.getElementById('withdrawBtn');
  btn.disabled = true;
  btn.textContent = 'Withdrawing…';

  // Collect the names of selected items
  const itemNames = [...selectedItems].map(idx => allItems[idx].name);

  try {
    const res = await fetch('/api/withdraw', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ username, items: itemNames }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    // Remove withdrawn items from local allItems array
    const removedNames = new Set(itemNames.map(n => n.toLowerCase()));
    allItems = allItems.filter(i => !removedNames.has(i.name.toLowerCase()));
    selectedItems.clear();
    renderItems(allItems);

    showWithdrawModal(itemNames);
  } catch (err) {
    console.error('[BetWing] Withdraw error:', err);
    showBanner(`Withdraw failed: ${err.message}`);
    updateWithdrawBtn();
  }
}

// ── Withdraw confirmation modal ───────────────────────────────────────────────
function showWithdrawModal(itemNames) {
  // Remove any existing modal
  document.getElementById('withdrawModal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'withdrawModal';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease;
  `;

  const itemListHtml = itemNames
    .map(n => `<li style="color:#c4b5fd;font-size:13px;padding:3px 0;">${escHtml(n)}</li>`)
    .join('');

  overlay.innerHTML = `
    <div style="
      background: #0d1525;
      border: 1px solid rgba(168,85,247,0.35);
      border-radius: 14px;
      padding: 32px 28px;
      max-width: 380px;
      width: 90%;
      text-align: center;
      box-shadow: 0 0 40px rgba(168,85,247,0.15);
      animation: slideUp 0.25s ease;
    ">
      <!-- Checkmark icon -->
      <div style="
        width: 56px; height: 56px; border-radius: 50%;
        background: rgba(34,197,94,0.12);
        border: 2px solid rgba(34,197,94,0.4);
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 18px;
      ">
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#22c55e" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>

      <h2 style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px;">
        Withdrawal Confirmed!
      </h2>
      <p style="font-size:13px;color:#64748b;margin-bottom:16px;line-height:1.6;">
        Your items have been queued for withdrawal.<br>
        Please join the game and trade with the bot to receive them.
      </p>

      <!-- Item list -->
      <ul style="
        list-style:none; background:rgba(255,255,255,0.04);
        border:1px solid rgba(255,255,255,0.07); border-radius:8px;
        padding:10px 14px; margin-bottom:20px; text-align:left;
        max-height:140px; overflow-y:auto;
      ">
        ${itemListHtml}
      </ul>

      <!-- Buttons -->
      <div style="display:flex;gap:10px;justify-content:center;">
        <a
          href="https://www.roblox.com/share?code=34fd0967d7599041b56ff5fb8c4467ac&type=Server"
          target="_blank"
          rel="noopener noreferrer"
          style="
            flex:1; padding:11px 0; border-radius:8px; text-decoration:none;
            background:linear-gradient(135deg,#16a34a,#15803d);
            color:#fff; font-size:13px; font-weight:700;
            display:flex; align-items:center; justify-content:center; gap:7px;
            box-shadow:0 4px 16px rgba(22,163,74,0.3);
            transition:opacity 0.2s;
          "
          onmouseover="this.style.opacity='0.85'"
          onmouseout="this.style.opacity='1'"
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          </svg>
          Join Game
        </a>
        <button
          onclick="document.getElementById('withdrawModal').remove()"
          style="
            flex:1; padding:11px 0; border-radius:8px; cursor:pointer;
            background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8; font-size:13px; font-weight:600;
            transition:background 0.2s;
          "
          onmouseover="this.style.background='rgba(255,255,255,0.1)'"
          onmouseout="this.style.background='rgba(255,255,255,0.06)'"
        >
          Close
        </button>
      </div>
    </div>

    <style>
      @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
      @keyframes slideUp { from { transform:translateY(16px);opacity:0 } to { transform:translateY(0);opacity:1 } }
    </style>
  `;

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

// ── Loading state ─────────────────────────────────────────────────────────────
function setLoadingState(on) {
  document.getElementById('itemsGrid').classList.toggle('loading', on);
}

// ── Banner ────────────────────────────────────────────────────────────────────
function showBanner(html) {
  let banner = document.getElementById('invBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'invBanner';
    banner.className = 'inv-banner';
    document.querySelector('.inventory-panel').prepend(banner);
  }
  banner.innerHTML = html;
  banner.style.display = 'block';
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function addMsg(name, text, colorClass = '', scroll = true) {
  const box = document.getElementById('chatMessages');
  const initials = name.slice(0, 2).toUpperCase();
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `
    <div class="chat-avatar">${initials}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-name ${colorClass}">${escHtml(name)}</div>
      <div class="chat-msg-text">${escHtml(text)}</div>
      <div class="chat-msg-time">${getTime()}</div>
    </div>
  `;
  box.appendChild(div);
  if (scroll) box.scrollTop = box.scrollHeight;
  while (box.children.length > 60) box.removeChild(box.firstChild);
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  addMsg('You', text, 'green');
  input.value = '';
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendMessage();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  // Wire up the withdraw button
  document.getElementById('withdrawBtn').addEventListener('click', handleWithdraw);

  await loadValues();
  loadInventory();
}

boot();