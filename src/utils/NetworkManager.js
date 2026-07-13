// Thin WebSocket client for the multiplayer presence server (see server/index.js).
// Reconnects with backoff, throttles outgoing position updates, and hands the
// latest peer list to the scene via onState — it owns no Phaser objects itself.
export default class NetworkManager {
    constructor(url, { onState, onConnectionChange, onModes, onHit } = {}) {
        this.url = url;
        this.onState = onState || (() => {});
        this.onConnectionChange = onConnectionChange || (() => {});
        this.onModes = onModes || (() => {});   // live game-mode vote tallies
        this.onHit = onHit || (() => {});        // an incoming PvP hit on us
        this.id = null;
        this.num = null;
        this.ws = null;
        this.connected = false;
        this._destroyed = false;
        this._reconnectDelay = 1000;
        this._lastSendAt = 0;
        this._sendIntervalMs = 100;
        this._connect();
    }

    _setConnected(connected) {
        if (this.connected === connected) return;
        this.connected = connected;
        this.onConnectionChange(connected);
    }

    _connect() {
        if (this._destroyed) return;
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            this._scheduleReconnect();
            return;
        }
        this.ws.onopen = () => { this._reconnectDelay = 1000; this._setConnected(true); };
        this.ws.onmessage = (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch (e) { return; }
            if (msg.type === 'welcome') {
                this.id = msg.id;
                this.num = msg.num;
            } else if (msg.type === 'state' && Array.isArray(msg.players)) {
                this.onState(msg.players.filter(p => p.id !== this.id));
                if (msg.modes) this.onModes(msg.modes);
            } else if (msg.type === 'hit') {
                this.onHit(msg);
            }
        };
        this.ws.onclose = () => { this._setConnected(false); if (!this._destroyed) this._scheduleReconnect(); };
        this.ws.onerror = () => { if (this.ws) this.ws.close(); };
    }

    _scheduleReconnect() {
        setTimeout(() => this._connect(), this._reconnectDelay);
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 10000);
    }

    // Called every frame; internally throttled so the socket only gets ~10 msgs/sec.
    sendPos(x, y, dir) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const now = Date.now();
        if (now - this._lastSendAt < this._sendIntervalMs) return;
        this._lastSendAt = now;
        this.ws.send(JSON.stringify({ type: 'pos', x: Math.round(x), y: Math.round(y), dir }));
    }

    _send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(obj));
        return true;
    }

    // Cast/clear this client's vote on a game mode (1 = ✓, -1 = ✗, 0 = abstain).
    sendVote(mode, val) { return this._send({ type: 'vote', mode, val }); }

    // Announce our PvP + spectator state so peers know whether we're fightable.
    sendPvp(on, spectator) { return this._send({ type: 'pvp', on: !!on, spectator: !!spectator }); }

    // Tell the server we struck another player; it forwards to that target.
    // kbAngle (radians, optional) is the direction to launch them — e.g. the
    // dash direction when the hit was a dash-into-player collision.
    sendHit(targetId, dmg, kbAngle) {
        const payload = { type: 'hit', target: targetId, dmg };
        if (typeof kbAngle === 'number' && Number.isFinite(kbAngle)) payload.kb = kbAngle;
        return this._send(payload);
    }

    destroy() {
        this._destroyed = true;
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
    }
}
