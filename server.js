/**
 * server.js – Local proxy server for Taufa.ai
 * Run: node server.js
 * Then open: http://localhost:3000
 */

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const { execFile } = require('child_process');

const PORT   = 3000;
const TARGET = 'taufa.ai';

// ── Resolve base directory (works both as .js and bundled .exe) ─────────────
// When packaged with pkg, static files sit next to the .exe
const BASE_DIR = process.pkg
  ? path.dirname(process.execPath)   // next to the .exe
  : __dirname;                        // normal node run

// ── Read session cookie from cookie.txt ─────────────────────────────────────
let SESSION_COOKIE = '';
try {
  SESSION_COOKIE = fs.readFileSync(path.join(BASE_DIR, 'cookie.txt'), 'utf8').trim();
  console.log('✅ Session cookie loaded');
} catch (e) {
  console.warn('⚠️  cookie.txt not found next to the exe. Create it and paste your taufa.ai cookie string.');
}

// ── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── Main server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Save Cookie Endpoint ────────────────────────────────────────────────
  if (pathname === '/api/save-cookie' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const cookieStr = (payload.cookie || '').trim();
        const cookieType = (payload.type || 'taufa').trim().toLowerCase();
        if (!cookieStr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No cookie provided' }));
          return;
        }

        const cookieFilePath = path.join(BASE_DIR, 'cookie.txt');
        let existing = '';
        if (fs.existsSync(cookieFilePath)) {
          try { existing = fs.readFileSync(cookieFilePath, 'utf8'); } catch (e) {}
        }

        let taufaCookies = '';
        let leetcodeCookies = '';

        const lines = existing.split(/\r?\n/);
        let sec = null;
        for (const line of lines) {
          const l = line.trim();
          if (!l) continue;
          if (l.toLowerCase().includes('leetcode')) { sec = 'lc'; continue; }
          if (l.toLowerCase().includes('taufa')) { sec = 'tf'; continue; }
          if (sec === 'lc' || l.includes('LEETCODE_SESSION')) {
            leetcodeCookies += (leetcodeCookies ? '; ' : '') + l;
          } else {
            taufaCookies += (taufaCookies ? '; ' : '') + l;
          }
        }

        if (cookieType === 'leetcode') {
          leetcodeCookies = cookieStr;
        } else {
          taufaCookies = cookieStr;
        }

        let out = '';
        if (taufaCookies) out += '# Taufa.ai Session Cookies\n' + taufaCookies + '\n\n';
        if (leetcodeCookies) out += '# LeetCode Session Cookies\n' + leetcodeCookies + '\n';

        fs.writeFileSync(cookieFilePath, out.trim() + '\n', 'utf8');
        SESSION_COOKIE = taufaCookies || cookieStr;
        console.log(`✅ Updated cookie.txt via extension API (${cookieType})! Length:`, cookieStr.length);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, length: cookieStr.length, type: cookieType }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }


  // ── Proctor Tools & Process Scan Endpoint ──────────────────────────────
  if (pathname === '/api/proctor-scan' && req.method === 'GET') {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ safe: true, detected: [] }));
        return;
      }
      const procs = (stdout || '').toLowerCase();
      const blacklist = [
        { name: 'comet.exe', label: 'Perplexity Comet Browser / AI' },
        { name: 'chatgpt.exe', label: 'ChatGPT' },
        { name: 'claude.exe', label: 'Claude AI Desktop' },
        { name: 'perplexity.exe', label: 'Perplexity' },
        { name: 'deepseek.exe', label: 'DeepSeek' },
        { name: 'cursor.exe', label: 'Cursor AI' },
      ];
      const detected = blacklist.filter(item => procs.includes(item.name));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        safe: detected.length === 0,
        detected
      }));
    });
    return;
  }

  // ── Cookie Status Endpoint ──────────────────────────────────────────────
  if (pathname === '/api/cookie-status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasCookie: !!SESSION_COOKIE && SESSION_COOKIE !== 'PASTE_YOUR_COOKIE_HERE',
      length: SESSION_COOKIE ? SESSION_COOKIE.length : 0
    }));
    return;
  }

  // ── Proxy /proxy/* → https://taufa.ai/* ────────────────────────────────────
  if (pathname.startsWith('/proxy/')) {
    const targetPath = pathname.replace('/proxy', '');
    proxyRequest(req, res, targetPath);
    return;
  }

  // ── Serve static files ──────────────────────────────────────────────────────
  let filePath = path.join(BASE_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// ── Proxy function ────────────────────────────────────────────────────────────
function proxyRequest(req, res, targetPath) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname: TARGET,
      port: 443,
      path: targetPath,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cookie': SESSION_COOKIE,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Referer': 'https://taufa.ai/chat/000e9900-de38-46e9-aa31-c5f36d696dc3',
        'Origin': 'https://taufa.ai',
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Pass through SSE headers
      const headers = {
        'Content-Type': proxyRes.headers['content-type'] || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      };
      if (proxyRes.headers['transfer-encoding']) {
        headers['Transfer-Encoding'] = proxyRes.headers['transfer-encoding'];
      }
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      console.error('Proxy error:', e);
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

server.listen(PORT, () => {
  console.log(`\n🚀 Quiz server running at http://localhost:${PORT}`);
  console.log(`📝 Make sure cookie.txt contains your taufa.ai session cookie\n`);
});
