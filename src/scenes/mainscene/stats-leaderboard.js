// Rolling 24h visitor-stats chart + the top-10 kill-count leaderboard, both
// polling server/index.js. Merged onto MainScene.prototype (see MainScene.js).
import { STATS_URL, LEADERBOARD_URL, SCORE_URL } from '../../config/network.js';

export default {
    // Rolling 24h unique-visitor chart: white-bordered box, rainbow polyline,
    // white axes, one point per hour, plus a peak readout and a total-unique
    // line below. Pulls from server/index.js's GET /stats (hashed IPs,
    // bucketed by hour — see that file for the privacy/persistence notes).
    _buildStatsHud() {
        const wrap = document.createElement('div');
        wrap.id = 'stats-hud';

        const box = document.createElement('div');
        box.id = 'stats-chart-box';

        const peak = document.createElement('div');
        peak.id = 'stats-peak';
        peak.textContent = 'peak: —';
        box.appendChild(peak);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.id = 'stats-svg';
        svg.setAttribute('viewBox', '0 0 200 80');
        svg.setAttribute('preserveAspectRatio', 'none');

        const defs = document.createElementNS(svgNS, 'defs');
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.id = 'stats-rainbow';
        grad.setAttribute('x1', '0');
        grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '200');
        grad.setAttribute('y2', '0');
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        [['0%', '#ff2d55'], ['16%', '#ff9500'], ['33%', '#ffe500'], ['50%', '#34d158'],
         ['66%', '#00c7ff'], ['83%', '#5e5ce6'], ['100%', '#ff2dd4']].forEach(([offset, color]) => {
            const stop = document.createElementNS(svgNS, 'stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', color);
            grad.appendChild(stop);
        });
        defs.appendChild(grad);
        svg.appendChild(defs);

        const yAxis = document.createElementNS(svgNS, 'line');
        yAxis.setAttribute('class', 'stats-axis');
        yAxis.setAttribute('x1', '10'); yAxis.setAttribute('y1', '4');
        yAxis.setAttribute('x2', '10'); yAxis.setAttribute('y2', '70');
        svg.appendChild(yAxis);

        const xAxis = document.createElementNS(svgNS, 'line');
        xAxis.setAttribute('class', 'stats-axis');
        xAxis.setAttribute('x1', '10'); xAxis.setAttribute('y1', '70');
        xAxis.setAttribute('x2', '196'); xAxis.setAttribute('y2', '70');
        svg.appendChild(xAxis);

        const line = document.createElementNS(svgNS, 'polyline');
        line.id = 'stats-line';
        svg.appendChild(line);

        box.appendChild(svg);
        wrap.appendChild(box);

        const total = document.createElement('div');
        total.id = 'stats-total';
        total.textContent = 'total users (24h): —';
        wrap.appendChild(total);

        document.body.appendChild(wrap);
        this._hudEls.push(wrap);
        this._statsPeakEl = peak;
        this._statsLineEl = line;
        this._statsTotalEl = total;

        this._fetchStats();
        this._statsPollTimer = setInterval(() => this._fetchStats(), 5 * 60 * 1000);
    },

    _fetchStats() {
        fetch(STATS_URL).then(r => (r.ok ? r.json() : null)).then(data => {
            if (data) this._renderStats(data);
        }).catch(() => {});
    },

    _renderStats({ hourly, peak, totalUnique24h }) {
        if (!this._statsLineEl || !Array.isArray(hourly) || hourly.length === 0) return;
        const maxCount = Math.max(peak, 1); // avoid a divide-by-zero when everything's 0
        const left = 10, right = 196, top = 6, bottom = 70;
        const stepX = (right - left) / (hourly.length - 1 || 1);
        const points = hourly.map((h, i) => {
            const x = left + i * stepX;
            const y = bottom - (h.count / maxCount) * (bottom - top);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        this._statsLineEl.setAttribute('points', points);
        this._statsPeakEl.textContent = `peak: ${peak}`;
        this._statsTotalEl.textContent = `total users (24h): ${totalUnique24h}`;
    },

    // ===== Global top-10 leaderboard =====
    // Lifetime cowboy/cowgirl/zombie kill totals (each already tracked +
    // persisted client-side — see the constructor's localStorage reads)
    // self-reported to server/index.js's GET /leaderboard + POST /score.
    // Same trust model as PvP hit relaying elsewhere in this file: the
    // server never re-derives these numbers itself, it just clamps + ranks
    // whatever a client claims — fine for a portfolio game's top-10 list,
    // not an anti-cheat system.
    _buildLeaderboardHud() {
        const wrap = document.createElement('div');
        wrap.id = 'leaderboard-hud';

        const title = document.createElement('div');
        title.id = 'lb-title';
        title.textContent = this.t('lbTitle');
        wrap.appendChild(title);

        const legend = document.createElement('div');
        legend.id = 'lb-legend';
        legend.innerHTML = '<span class="lb-icon lb-icon-cowboy"></span>' +
            '<span class="lb-icon lb-icon-cowgirl"></span>' +
            '<span class="lb-icon lb-icon-zombie"></span>';
        wrap.appendChild(legend);

        const list = document.createElement('div');
        list.id = 'lb-list';
        wrap.appendChild(list);

        document.body.appendChild(wrap);
        this._hudEls.push(wrap);
        this._lbListEl = list;
        this._leaderboardCache = [];

        this._fetchLeaderboard();
        this._leaderboardPollTimer = setInterval(() => this._fetchLeaderboard(), 5 * 60 * 1000);
    },

    _fetchLeaderboard() {
        fetch(LEADERBOARD_URL).then(r => (r.ok ? r.json() : null)).then(data => {
            if (Array.isArray(data)) { this._leaderboardCache = data; this._renderLeaderboard(data); }
        }).catch(() => {});
    },

    _renderLeaderboard(list) {
        if (!this._lbListEl) return;
        this._lbListEl.innerHTML = '';
        if (!list.length) {
            const empty = document.createElement('div');
            empty.id = 'lb-empty';
            empty.textContent = this.t('lbEmpty');
            this._lbListEl.appendChild(empty);
            return;
        }
        list.forEach((entry, i) => {
            const row = document.createElement('div');
            row.className = 'lb-row';
            row.innerHTML = `
                <div class="lb-row-top">
                    <span class="lb-rank">${i + 1}.</span>
                    <span class="lb-name">${entry.name}</span>
                    <span class="lb-total">${entry.total}</span>
                </div>
                <div class="lb-row-breakdown">
                    <span class="lb-icon lb-icon-cowboy"></span><span class="lb-num lb-num-cowboy">${entry.cowboy}</span>
                    <span class="lb-icon lb-icon-cowgirl"></span><span class="lb-num lb-num-cowgirl">${entry.cowgirl}</span>
                    <span class="lb-icon lb-icon-zombie"></span><span class="lb-num lb-num-zombie">${entry.zombie}</span>
                </div>`;
            this._lbListEl.appendChild(row);
        });
    },

    // Submits this browser's current lifetime kill totals (called from the
    // new-high-score flow in _showGameOver()) and re-renders the panel with
    // whatever the server ends up returning — that reflects the real top 10
    // even if this particular submission didn't end up making the cut.
    _submitScore(name, cowboy, cowgirl, zombie) {
        return fetch(SCORE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, cowboy, cowgirl, zombie }),
        }).then(r => (r.ok ? r.json() : null)).then(data => {
            if (Array.isArray(data)) { this._leaderboardCache = data; this._renderLeaderboard(data); }
            return data;
        }).catch(() => null);
    },

    _buildShareText(total, cowboy, cowgirl, zombie) {
        return this.t('shareText')
            .replace('{total}', total).replace('{cowboy}', cowboy)
            .replace('{cowgirl}', cowgirl).replace('{zombie}', zombie);
    },
};
