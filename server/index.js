// Multiplayer presence server. Anonymous, in-memory, no persistence: clients
// connect, get assigned the lowest free "Player N" slot, and broadcast their
// x/y/facing. Everyone else renders them as a non-interactive ghost. That's
// the entire feature — there is no auth, no world state, no interaction.
//
// Cloudflare only proxies wss:// (port 443) to the origin on port 443, so
// this terminates real TLS itself using the Let's Encrypt cert copied to
// CERT_PATH/KEY_PATH by server/deploy/copy-certs.sh (see that script's
// certbot deploy-hook for how it stays fresh).
const { WebSocketServer } = require('ws');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 443;
const CERT_PATH = process.env.CERT_PATH || `${__dirname}/certs/fullchain.pem`;
const KEY_PATH = process.env.KEY_PATH || `${__dirname}/certs/privkey.pem`;
const STATS_PATH = process.env.STATS_PATH || `${__dirname}/stats.json`;
const TICK_MS = 100;
const MAX_PLAYERS = 60;
const MAX_MESSAGE_BYTES = 512;
const HEARTBEAT_MS = 20000;
const WORLD_SIZE = 2000; // matches MainScene's worldWidth/worldHeight
const MAX_MSGS_PER_SECOND = 20;
const HOUR_MS = 3600000;
const STATS_WINDOW_HOURS = 24;

// ---- Rolling 24h unique-visitor stats -------------------------------------
// Anonymous by design (no accounts): "unique" means a distinct hashed IP
// connecting within that clock hour. Hashed (not raw) so the persisted file
// on disk never holds a real IP. Bucketed by epoch hour and persisted to a
// small JSON file so a Spot-instance restart doesn't lose the rolling window.
const hourlyVisitors = new Map(); // hourStart(ms) -> Set<ipHash>

function hashIp(ip) {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function pruneStats() {
    const cutoff = Date.now() - STATS_WINDOW_HOURS * HOUR_MS;
    for (const hourStart of hourlyVisitors.keys()) {
        if (hourStart < cutoff) hourlyVisitors.delete(hourStart);
    }
}

function loadStats() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
        for (const [hourStart, ipHashes] of raw) hourlyVisitors.set(hourStart, new Set(ipHashes));
        pruneStats();
    } catch (e) { /* no file yet, or corrupt — start fresh */ }
}

function saveStats() {
    pruneStats();
    const serializable = [...hourlyVisitors.entries()].map(([hourStart, ipHashes]) => [hourStart, [...ipHashes]]);
    // Synchronous: small payload, infrequent (60s + shutdown), and the
    // shutdown handler calls process.exit() right after — an async write
    // would get killed mid-flight and never land.
    try { fs.writeFileSync(STATS_PATH, JSON.stringify(serializable)); } catch (e) {}
}

function recordVisit(ip) {
    const hourStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    let bucket = hourlyVisitors.get(hourStart);
    if (!bucket) { bucket = new Set(); hourlyVisitors.set(hourStart, bucket); }
    bucket.add(hashIp(ip));
}

// Always exactly STATS_WINDOW_HOURS points, oldest -> newest, zero-filled for
// hours with no visitors — the client charts this directly, one bar per hour.
function getStats() {
    pruneStats();
    const nowHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const hourly = [];
    const totalSeen = new Set();
    for (let i = STATS_WINDOW_HOURS - 1; i >= 0; i--) {
        const hourStart = nowHour - i * HOUR_MS;
        const bucket = hourlyVisitors.get(hourStart);
        hourly.push({ hour: hourStart, count: bucket ? bucket.size : 0 });
        if (bucket) for (const h of bucket) totalSeen.add(h);
    }
    const peak = hourly.reduce((m, b) => Math.max(m, b.count), 0);
    return { hourly, peak, totalUnique24h: totalSeen.size };
}

loadStats();
setInterval(saveStats, 60000);
for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => { saveStats(); process.exit(0); });
}

const server = https.createServer({
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
}, (req, res) => {
    if (req.method === 'GET' && req.url === '/stats') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            // Anonymous aggregate counts only (hashed IPs, hourly buckets) —
            // nothing origin-sensitive here, so any origin can read it (lets
            // local dev/testing fetch it too, not just the live site).
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(getStats()));
        return;
    }
    // WebSocketServer only wires up the 'upgrade' event; without a 'request'
    // handler, plain HTTP hits (health checks, stray browsers) hang forever
    // instead of getting a response.
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('Upgrade Required');
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

const players = new Map(); // id -> { ws, num, x, y, dir }
const usedNumbers = new Set();
let nextId = 1;

function nextPlayerNumber() {
    let n = 1;
    while (usedNumbers.has(n)) n++;
    usedNumbers.add(n);
    return n;
}

function broadcastState() {
    if (players.size === 0) return;
    const list = [...players.values()].map(p => ({ id: p.id, num: p.num, x: p.x, y: p.y, dir: p.dir }));
    const payload = JSON.stringify({ type: 'state', players: list });
    for (const p of players.values()) {
        if (p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
    }
}

wss.on('connection', (ws, req) => {
    if (players.size >= MAX_PLAYERS) {
        ws.close(1013, 'server full');
        return;
    }

    // Cloudflare (proxied) sets this to the real client IP; remoteAddress
    // would otherwise just be Cloudflare's edge IP.
    recordVisit(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown');

    const id = nextId++;
    const num = nextPlayerNumber();
    const player = { id, ws, num, x: 0, y: 0, dir: 'idle', _msgWindowStart: Date.now(), _msgCount: 0 };
    players.set(id, player);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({ type: 'welcome', id, num }));
    broadcastState();

    ws.on('message', (raw) => {
        // Per-connection rate limit — independent of the client's own
        // throttle, since a non-browser client can just ignore that.
        const now = Date.now();
        if (now - player._msgWindowStart > 1000) { player._msgWindowStart = now; player._msgCount = 0; }
        player._msgCount++;
        if (player._msgCount > MAX_MSGS_PER_SECOND) return;

        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        if (msg.type !== 'pos') return;
        if (typeof msg.x !== 'number' || typeof msg.y !== 'number' || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
        player.x = Math.max(0, Math.min(WORLD_SIZE, msg.x));
        player.y = Math.max(0, Math.min(WORLD_SIZE, msg.y));
        player.dir = typeof msg.dir === 'string' ? msg.dir.slice(0, 16) : 'idle';
    });

    ws.on('close', () => {
        players.delete(id);
        usedNumbers.delete(num);
        broadcastState();
    });

    ws.on('error', () => {});
});

// Browsers don't always send a clean close frame (tab killed, laptop closed,
// network dies mid-session) — without this, those connections' entries in
// `players` never get cleaned up and their ghosts freeze in place forever.
// Standard ws heartbeat pattern: ping everyone each interval, terminate
// anyone who didn't pong since the last one.
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_MS);

setInterval(broadcastState, TICK_MS);

server.listen(PORT, () => console.log(`Presence server listening on :${PORT}`));
