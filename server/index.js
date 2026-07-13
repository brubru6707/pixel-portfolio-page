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
const SCORES_PATH = process.env.SCORES_PATH || `${__dirname}/scores.json`;
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

// ---- Top-10 kill-count leaderboard --------------------------------------
// Anonymous by design, same as everything else here: a client self-reports
// its lifetime cowboy/cowgirl/zombie kill counters (already tracked
// client-side in localStorage) and, like PvP `dmg`/`kb`, the numbers are
// never independently verified — there's no server-side kill tracking to
// check them against. Low stakes (a portfolio game's top-10 list), so a
// clamp + a per-IP cooldown is enough; this is not an anti-cheat system.
const MAX_LEADERBOARD = 10;
const MAX_KILLS = 999999; // a legit lifetime tally won't get anywhere near this
const SCORE_POST_COOLDOWN_MS = 5000;
let leaderboard = []; // [{name, cowboy, cowgirl, zombie, total, ts}], sorted desc by total
const lastScorePostByIp = new Map(); // ipHash -> last POST time, flood guard

function loadLeaderboard() {
    try {
        const raw = JSON.parse(fs.readFileSync(SCORES_PATH, 'utf8'));
        if (Array.isArray(raw)) leaderboard = raw.slice(0, MAX_LEADERBOARD);
    } catch (e) { /* no file yet, or corrupt — start fresh */ }
}

function saveLeaderboard() {
    try { fs.writeFileSync(SCORES_PATH, JSON.stringify(leaderboard)); } catch (e) {}
}

loadLeaderboard();

function clampKills(n) {
    n = Math.round(Number(n));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MAX_KILLS);
}

// Classic arcade three-letter initials — uppercase A-Z/0-9 only.
function sanitizeName(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

// Inserts/updates `name`'s entry if it earns a top-10 spot (by total kills);
// one entry per name, keeping that name's best-ever run. Returns the
// (possibly unchanged) leaderboard.
function tryAddScore(name, cowboy, cowgirl, zombie) {
    const total = cowboy + cowgirl + zombie;
    if (total <= 0) return leaderboard;
    if (leaderboard.length >= MAX_LEADERBOARD && total <= leaderboard[leaderboard.length - 1].total) return leaderboard;
    const existingIdx = leaderboard.findIndex(e => e.name === name);
    if (existingIdx !== -1) {
        if (total <= leaderboard[existingIdx].total) return leaderboard;
        leaderboard.splice(existingIdx, 1);
    }
    leaderboard.push({ name, cowboy, cowgirl, zombie, total, ts: Date.now() });
    leaderboard.sort((a, b) => b.total - a.total);
    leaderboard = leaderboard.slice(0, MAX_LEADERBOARD);
    saveLeaderboard();
    return leaderboard;
}

// Small helper since the raw https server has no body-parsing middleware.
function readBody(req, maxBytes, cb) {
    let data = '';
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { aborted = true; req.destroy(); return; }
        data += chunk;
    });
    req.on('end', () => { if (!aborted) cb(data); });
    req.on('error', () => {});
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

    // The game is served from a different origin (GitHub Pages) than this
    // box, so a POST with a JSON body triggers a real CORS preflight.
    if (req.method === 'OPTIONS' && (req.url === '/leaderboard' || req.url === '/score')) {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/leaderboard') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(leaderboard));
        return;
    }

    if (req.method === 'POST' && req.url === '/score') {
        const ipHash = hashIp(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown');
        const now = Date.now();
        if (now - (lastScorePostByIp.get(ipHash) || 0) < SCORE_POST_COOLDOWN_MS) {
            res.writeHead(429, { 'Access-Control-Allow-Origin': '*' });
            res.end();
            return;
        }
        readBody(req, 1024, (body) => {
            let msg;
            try { msg = JSON.parse(body); } catch (e) { msg = null; }
            const name = msg && sanitizeName(msg.name);
            if (!name) {
                res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
                res.end();
                return;
            }
            lastScorePostByIp.set(ipHash, now);
            const updated = tryAddScore(name, clampKills(msg.cowboy), clampKills(msg.cowgirl), clampKills(msg.zombie));
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
            });
            res.end(JSON.stringify(updated));
        });
        return;
    }

    // WebSocketServer only wires up the 'upgrade' event; without a 'request'
    // handler, plain HTTP hits (health checks, stray browsers) hang forever
    // instead of getting a response.
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('Upgrade Required');
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

const players = new Map(); // id -> { ws, num, x, y, dir, pvp, spectator, votes }
const usedNumbers = new Set();
let nextId = 1;

// The opt-in game modes players can vote on. Majority of active ✓ over ✗
// turns a mode on for everyone (shared world state).
const MODES = ['zombies', 'cowboy', 'cowgirl'];

function nextPlayerNumber() {
    let n = 1;
    while (usedNumbers.has(n)) n++;
    usedNumbers.add(n);
    return n;
}

// Tally every active player's vote per mode. A mode is "on" when strictly more
// players voted ✓ (1) than ✗ (-1); abstentions (0) don't count either way.
function tallyModes() {
    const out = {};
    for (const mode of MODES) {
        let yes = 0, no = 0;
        for (const p of players.values()) {
            const v = p.votes[mode];
            if (v === 1) yes++;
            else if (v === -1) no++;
        }
        out[mode] = { yes, no, on: yes > no };
    }
    return out;
}

function broadcastState() {
    if (players.size === 0) return;
    const list = [...players.values()].map(p => ({
        id: p.id, num: p.num, x: p.x, y: p.y, dir: p.dir,
        pvp: !!p.pvp, spectator: !!p.spectator
    }));
    const modes = tallyModes();
    const payload = JSON.stringify({ type: 'state', players: list, modes });
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
    const player = {
        id, ws, num, x: 0, y: 0, dir: 'idle',
        pvp: false, spectator: false,
        votes: { zombies: 0, cowboy: 0, cowgirl: 0 },
        _msgWindowStart: Date.now(), _msgCount: 0
    };
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

        if (msg.type === 'pos') {
            if (typeof msg.x !== 'number' || typeof msg.y !== 'number' || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
            player.x = Math.max(0, Math.min(WORLD_SIZE, msg.x));
            player.y = Math.max(0, Math.min(WORLD_SIZE, msg.y));
            player.dir = typeof msg.dir === 'string' ? msg.dir.slice(0, 16) : 'idle';
            return;
        }

        // A player's ✓/✗ vote on one game mode (1 = yes, -1 = no, 0 = abstain).
        // The next broadcastState re-tallies and ships the new on/off state.
        if (msg.type === 'vote') {
            if (!MODES.includes(msg.mode)) return;
            const v = msg.val === 1 ? 1 : msg.val === -1 ? -1 : 0;
            player.votes[msg.mode] = v;
            broadcastState(); // reflect the new tally immediately, don't wait for the tick
            return;
        }

        // Player's PvP / spectator state. Broadcast so peers know who's fightable.
        if (msg.type === 'pvp') {
            player.pvp = !!msg.on;
            player.spectator = !!msg.spectator;
            broadcastState();
            return;
        }

        // Player claims to have struck another player. Only forwarded (never
        // trusted for authoritative HP) — and only when BOTH sides opted into
        // PvP and neither is spectating. The target applies the damage (and
        // any knockback) locally. `kb` is an optional launch angle in radians
        // (e.g. a dash-into-player hit) — passed through as-is, same
        // never-trusted-just-relayed treatment as `dmg`.
        if (msg.type === 'hit') {
            const target = players.get(msg.target);
            if (!target || target.id === player.id) return;
            if (!player.pvp || player.spectator || !target.pvp || target.spectator) return;
            const dmg = Math.max(0, Math.min(3, Number(msg.dmg) || 0));
            if (dmg <= 0) return;
            const payload = { type: 'hit', from: player.num, dmg };
            if (typeof msg.kb === 'number' && Number.isFinite(msg.kb)) payload.kb = msg.kb;
            if (target.ws.readyState === target.ws.OPEN) {
                target.ws.send(JSON.stringify(payload));
            }
            return;
        }
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
