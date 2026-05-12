// ── Particles ────────────────────────────────────────────────────────────────
const particleContainer = document.getElementById('particles');
const colors = ['#a855f7', '#3b82f6', '#06b6d4', '#ec4899'];

for (let i = 0; i < 25; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  const size = Math.random() * 4 + 2;
  p.style.cssText = `
    width:${size}px;height:${size}px;
    left:${Math.random() * 100}%;
    background:${colors[Math.floor(Math.random() * colors.length)]};
    animation-duration:${Math.random() * 15 + 10}s;
    animation-delay:${Math.random() * 10}s;
  `;
  particleContainer.appendChild(p);
}

// ── Bio word pools ────────────────────────────────────────────────────────────
const words = [
  'crown', 'sword', 'shield', 'arrow', 'castle', 'dragon', 'vault', 'coin',
  'flag', 'throne', 'blade', 'gem', 'tower', 'mask', 'cape', 'map',
  'key', 'chest', 'anchor', 'dice', 'lantern', 'compass', 'glove', 'badge',
  'clock', 'ring', 'chain', 'staff', 'helmet', 'robe', 'scroll', 'mirror',
  'cannon', 'rope', 'torch', 'lens', 'ticket', 'board', 'card', 'wheel'
];

let currentWords = [];

function pickWords() {
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 9);
}

function buildBio(username) {
  const name = username.trim() || 'BetWing';
  return `${name} | ${currentWords.join(' ')}`;
}

function updateBio() {
  const username = document.getElementById('robloxUsername').value;
  document.getElementById('generatedBio').value = buildBio(username);
  resetCopyBtn();
}

function refreshBio() {
  currentWords = pickWords();
  updateBio();
}

function resetCopyBtn() {
  const btn = document.getElementById('copyBtn');
  btn.textContent = 'Copy';
  btn.classList.remove('copied');
}

function copyBio() {
  const bio = document.getElementById('generatedBio').value;
  navigator.clipboard.writeText(bio).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(resetCopyBtn, 2000);
  });
}

// ── Notification ──────────────────────────────────────────────────────────────
function showNotification(message, type = 'error') {
  const existing = document.getElementById('bw-notification');
  if (existing) existing.remove();

  const n = document.createElement('div');
  n.id = 'bw-notification';
  n.className = `bw-notification bw-notification--${type}`;

  const icon = type === 'success' ? '✓' : type === 'loading' ? '⟳' : '✕';
  n.innerHTML = `<span class="bw-notif-icon">${icon}</span><span class="bw-notif-msg">${message}</span>`;
  document.body.appendChild(n);

  requestAnimationFrame(() => n.classList.add('bw-notification--visible'));

  if (type !== 'loading') {
    setTimeout(() => {
      n.classList.remove('bw-notification--visible');
      setTimeout(() => n.remove(), 400);
    }, 5000);
  }

  return n;
}

// ── Roblox API — calls our private Vercel serverless function ─────────────────
async function fetchRobloxProfile(username) {
  const res = await fetch(
    `/api/roblox?username=${encodeURIComponent(username)}`,
    { signal: AbortSignal.timeout(12000) }
  );
  if (!res.ok) throw new Error(`api_${res.status}`);
  return res.json(); // { found, id, username, displayName, bio }
}

// ── Login handler ─────────────────────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById('robloxUsername').value.trim();
  const input    = document.getElementById('robloxUsername');

  if (!username) {
    input.classList.add('error');
    input.focus();
    setTimeout(() => input.classList.remove('error'), 1200);
    showNotification('Please enter your Roblox username.');
    return;
  }

  if (!currentWords.length) {
    showNotification('No verification code generated. Please refresh the code first.');
    return;
  }

  const btn = document.querySelector('.submit-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  const notif = showNotification('Looking up your Roblox profile…', 'loading');

  try {
    const profile = await fetchRobloxProfile(username);

    if (!profile.found) {
      notif.remove();
      showNotification(
        `"${username}" wasn't found on Roblox. Double-check your exact username and try again.`
      );
      return;
    }

    notif.querySelector('.bw-notif-msg').textContent = 'Checking your Roblox bio…';
    const bioLower     = profile.bio.toLowerCase();
    const missingWords = currentWords.filter(w => !bioLower.includes(w));

    if (missingWords.length === 0) {
      notif.remove();
      showNotification('Bio verified! Redirecting…', 'success');
      // Save the Roblox-resolved username so the inventory page can fetch the right user
      sessionStorage.setItem('bw_username', profile.username);
      setTimeout(() => { window.location.href = '/inventory'; }, 1400);
    } else {
      notif.remove();
      showNotification(
        `Bio verification failed — the code wasn't found in your Roblox bio. ` +
        `Make sure you copied the full code, saved your bio on Roblox, then try again.`
      );
    }

  } catch (err) {
    notif.remove();
    if (err.name === 'TimeoutError') {
      showNotification('Request timed out. Please try again.');
    } else {
      showNotification('Something went wrong. Please try again in a moment.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal() {
  currentWords = pickWords();
  updateBio();
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  resetCopyBtn();
}

function closeOnOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});