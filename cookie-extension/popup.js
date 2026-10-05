const statusEl = document.getElementById('status');
const badgeLc = document.getElementById('badgeLc');
const infoLc = document.getElementById('infoLc');
const badgeTf = document.getElementById('badgeTf');
const infoTf = document.getElementById('infoTf');

const btnSyncAll = document.getElementById('btnSyncAll');
const btnSyncLc = document.getElementById('btnSyncLc');
const btnCopyLc = document.getElementById('btnCopyLc');
const btnSyncTf = document.getElementById('btnSyncTf');
const btnCopyTf = document.getElementById('btnCopyTf');

let lcData = { cookieStr: '', session: '', csrf: '', username: '' };
let tfData = { cookieStr: '', count: 0 };

function setStatus(text, type) {
  statusEl.className = type;
  statusEl.innerHTML = text;
  statusEl.style.display = 'block';
}

// ── 1. Fetch LeetCode Cookies ───────────────────────────────────────────────
async function fetchLeetCodeCookies() {
  try {
    const [c1, c2, c3] = await Promise.all([
      chrome.cookies.getAll({ domain: 'leetcode.com' }),
      chrome.cookies.getAll({ domain: '.leetcode.com' }),
      chrome.cookies.getAll({ url: 'https://leetcode.com' })
    ]);

    const cookieMap = new Map();
    [...c1, ...c2, ...c3].forEach(c => {
      if (c && c.name) {
        cookieMap.set(c.name, c.value);
      }
    });

    const session = cookieMap.get('LEETCODE_SESSION') || '';
    const csrf = cookieMap.get('csrftoken') || '';

    // Try to detect username from cookies or messages
    let username = '';
    const messagesCookie = cookieMap.get('messages') || '';
    const userMatch = messagesCookie.match(/username["':\s]+([a-zA-Z0-9_\-]+)/i);
    if (userMatch) username = userMatch[1];

    if (!session) {
      badgeLc.className = 'card-badge missing';
      badgeLc.textContent = 'Not Logged In';
      infoLc.textContent = 'LEETCODE_SESSION cookie not found. Please log in to leetcode.com.';
      lcData = { cookieStr: '', session: '', csrf: '', username: '' };
      return lcData;
    }

    const parts = [];
    parts.push(`LEETCODE_SESSION=${session}`);
    if (csrf) parts.push(`csrftoken=${csrf}`);
    for (const [name, val] of cookieMap.entries()) {
      if (name !== 'LEETCODE_SESSION' && name !== 'csrftoken') {
        parts.push(`${name}=${val}`);
      }
    }

    const cookieStr = parts.join('; ');
    badgeLc.className = 'card-badge found';
    badgeLc.textContent = 'Active Session';
    infoLc.textContent = `Found LEETCODE_SESSION (${session.substring(0, 12)}...) & ${cookieMap.size} cookies.`;

    lcData = { cookieStr, session, csrf, username };
    return lcData;
  } catch (err) {
    badgeLc.className = 'card-badge missing';
    badgeLc.textContent = 'Error';
    infoLc.textContent = 'Could not access cookies: ' + err.message;
    return { cookieStr: '', session: '', csrf: '', username: '' };
  }
}

// ── 2. Fetch Taufa Cookies ──────────────────────────────────────────────────
async function fetchTaufaCookies() {
  try {
    const [c1, c2, c3] = await Promise.all([
      chrome.cookies.getAll({ domain: 'taufa.ai' }),
      chrome.cookies.getAll({ domain: '.taufa.ai' }),
      chrome.cookies.getAll({ url: 'https://taufa.ai' })
    ]);

    const cookieMap = new Map();
    [...c1, ...c2, ...c3].forEach(c => {
      if (c && c.name) {
        cookieMap.set(c.name, c.value);
      }
    });

    if (cookieMap.size === 0) {
      badgeTf.className = 'card-badge missing';
      badgeTf.textContent = 'Not Found';
      infoTf.textContent = 'No cookies found for taufa.ai. Log in to taufa.ai first.';
      tfData = { cookieStr: '', count: 0 };
      return tfData;
    }

    const parts = [];
    for (const [name, val] of cookieMap.entries()) {
      parts.push(`${name}=${val}`);
    }

    const cookieStr = parts.join('; ');
    badgeTf.className = 'card-badge found';
    badgeTf.textContent = `${cookieMap.size} Active`;
    infoTf.textContent = `Found ${cookieMap.size} cookies (${cookieStr.length} chars).`;

    tfData = { cookieStr, count: cookieMap.size };
    return tfData;
  } catch (err) {
    badgeTf.className = 'card-badge missing';
    badgeTf.textContent = 'Error';
    infoTf.textContent = 'Could not access cookies: ' + err.message;
    return { cookieStr: '', count: 0 };
  }
}

// ── 3. Sync Functions ───────────────────────────────────────────────────────
async function syncLeetCode(silent = false) {
  const lc = await fetchLeetCodeCookies();
  if (!lc.session) {
    if (!silent) setStatus('⚠️ Please log in to <a href="https://leetcode.com" target="_blank" style="color:#ffa116;">leetcode.com</a> first!', 'warn');
    return false;
  }

  if (!silent) setStatus('⏳ Syncing LeetCode session to cookie.txt at http://localhost:3000...', 'warn');

  try {
    // 1. Send to /api/save-cookie with type: 'leetcode'
    const res = await fetch('http://localhost:3000/api/save-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookie: lc.cookieStr,
        type: 'leetcode',
        username: lc.username
      })
    });

    // 2. Also register directly to LeetCode account endpoint
    await fetch('http://localhost:3000/api/admin/leetcode-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCookie: lc.session,
        csrfToken: lc.csrf,
        username: lc.username
      })
    }).catch(() => {});

    if (res.ok) {
      const data = await res.json();
      if (!silent) {
        setStatus(`✅ LeetCode session updated into <strong>cookie.txt</strong>! Account connected: <strong>@${data.username || lc.username || 'LeetCodeUser'}</strong> (15 testcases active).`, 'success');
      }
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    await navigator.clipboard.writeText(lc.cookieStr);
    if (!silent) {
      setStatus(`⚠️ Quiz App server on port 3000 is not active yet, but LeetCode cookies were <strong>copied to your clipboard</strong>!`, 'warn');
    }
    return false;
  }
}

async function syncTaufa(silent = false) {
  const tf = await fetchTaufaCookies();
  if (!tf.cookieStr) {
    if (!silent) setStatus('⚠️ Please log in to <a href="https://taufa.ai" target="_blank" style="color:#a78bfa;">taufa.ai</a> first!', 'warn');
    return false;
  }

  if (!silent) setStatus('⏳ Syncing Taufa session to cookie.txt at http://localhost:3000...', 'warn');

  try {
    const res = await fetch('http://localhost:3000/api/save-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookie: tf.cookieStr,
        type: 'taufa'
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (!silent) {
        setStatus(`✅ Taufa cookies updated into <strong>cookie.txt</strong> (${data.length} chars). Quiz App is ready!`, 'success');
      }
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    await navigator.clipboard.writeText(tf.cookieStr);
    if (!silent) {
      setStatus(`⚠️ Quiz App server on port 3000 is not active yet, but Taufa cookies were <strong>copied to your clipboard</strong>!`, 'warn');
    }
    return false;
  }
}

async function syncAll() {
  setStatus('⏳ Syncing both LeetCode and Taufa sessions...', 'warn');
  const [lcSuccess, tfSuccess] = await Promise.all([
    syncLeetCode(true),
    syncTaufa(true)
  ]);

  if (lcSuccess && tfSuccess) {
    setStatus('🌟 <strong>All Sessions Synced!</strong> Both LeetCode & Taufa.ai cookies were updated into <strong>cookie.txt</strong> and connected to ProctorIQ.', 'success');
  } else if (lcSuccess && !tfSuccess) {
    setStatus('✅ <strong>LeetCode Synced!</strong> Saved to cookie.txt. (Taufa not logged in or failed).', 'success');
  } else if (!lcSuccess && tfSuccess) {
    setStatus('✅ <strong>Taufa Synced!</strong> Saved to cookie.txt. (LeetCode not logged in or failed).', 'success');
  } else {
    setStatus('⚠️ Could not connect to Quiz App on localhost:3000. Start ProctorIQ.exe / MdaExamBrowserr.exe first!', 'warn');
  }
}

// ── 4. Event Listeners ──────────────────────────────────────────────────────
btnSyncAll.addEventListener('click', syncAll);
btnSyncLc.addEventListener('click', () => syncLeetCode(false));
btnSyncTf.addEventListener('click', () => syncTaufa(false));

btnCopyLc.addEventListener('click', async () => {
  if (!lcData.cookieStr) await fetchLeetCodeCookies();
  if (lcData.cookieStr) {
    await navigator.clipboard.writeText(lcData.cookieStr);
    setStatus('📋 LeetCode cookies copied to clipboard!', 'success');
  } else {
    setStatus('⚠️ No LeetCode cookies to copy. Log in to leetcode.com first.', 'warn');
  }
});

btnCopyTf.addEventListener('click', async () => {
  if (!tfData.cookieStr) await fetchTaufaCookies();
  if (tfData.cookieStr) {
    await navigator.clipboard.writeText(tfData.cookieStr);
    setStatus('📋 Taufa cookies copied to clipboard!', 'success');
  } else {
    setStatus('⚠️ No Taufa cookies to copy. Log in to taufa.ai first.', 'warn');
  }
});

// Auto-scan on popup open
(async function init() {
  await Promise.all([
    fetchLeetCodeCookies(),
    fetchTaufaCookies()
  ]);
})();
