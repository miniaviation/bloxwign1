// ── Inventory ─────────────────────────────────────────────────────────────────
function refreshInventory() {
  document.getElementById('searchInput').value = '';
  renderItems();
}

function renderItems(filter = '') {
  const grid = document.getElementById('itemsGrid');
  // Remove all cards except the deposit card (first child)
  const kids = [...grid.children];
  kids.slice(1).forEach(k => k.remove());
  // Items will be populated by the backend later
}

function filterItems() {
  const val = document.getElementById('searchInput').value.toLowerCase();
  renderItems(val);
}

function showDepositMsg() {
  alert('Deposits are coming soon. Stay tuned for the BetWing launch!');
}

renderItems();

// ── Chat ──────────────────────────────────────────────────────────────────────
// Backend will be connected later. Input + send button are wired up but
// messages won't appear until the real WebSocket/API is hooked in.

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

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
  // Keep max 60 messages
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