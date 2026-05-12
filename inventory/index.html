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
  const slug = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));
  return `https://amvgg.com/images/items/${slug}.png`;
}

// ── State ─────────────────────────────────────────────────────────────────────
let allItems      = [];
let selectedItems = new Set();

// ── Session username ──────────────────────────────────────────────────────────
// The login page must write the verified username to sessionStorage like:
//   sessionStorage.setItem('bw_username', username);
function getLoggedInUsername() {
  return sessionStorage.getItem('bw_username') ?? null;
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

  // Remove everything except the deposit card (always first)
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

    const imgUrl = itemImageUrl(item.name);

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

// ── Loading state ─────────────────────────────────────────────────────────────
function setLoadingState(on) {
  document.getElementById('itemsGrid').classList.toggle('loading', on);
}

// ── Banner (error / info) ─────────────────────────────────────────────────────
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
  // TODO: send to backend WebSocket/API
  addMsg('You', text, 'green');
  input.value = '';
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendMessage();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
loadInventory();