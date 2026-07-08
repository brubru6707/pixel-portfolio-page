// Thin WebSocket client for the multiplayer presence server (see server/index.js).
// Reconnects with backoff, throttles outgoing position updates, and hands the
// latest peer list to the scene via onState — it owns no Phaser objects itself.
export default class NetworkManager {
    constructor(url, { onState } = {}) {
        this.url = url;
        this.onState = onState || (() => {});
        this.id = null;
        this.num = null;
        this.ws = null;
        this._destroyed = false;
        this._reconnectDelay = 1000;
        this._lastSendAt = 0;
        this._sendIntervalMs = 100;
        this._connect();
    }

    _connect() {
        if (this._destroyed) return;
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            this._scheduleReconnect();
            return;
        }
        this.ws.onopen = () => { this._reconnectDelay = 1000; };
        this.ws.onmessage = (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch (e) { return; }
            if (msg.type === 'welcome') {
                this.id = msg.id;
                this.num = msg.num;
            } else if (msg.type === 'state' && Array.isArray(msg.players)) {
                this.onState(msg.players.filter(p => p.id !== this.id));
            }
        };
        this.ws.onclose = () => { if (!this._destroyed) this._scheduleReconnect(); };
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

    destroy() {
        this._destroyed = true;
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
    }
}
