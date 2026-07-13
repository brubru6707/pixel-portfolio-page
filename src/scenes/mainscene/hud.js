// HUD chrome: the mode toggle, the action/DOOM-pad/HUD-button scaffolding,
// the tutorial popup, the settings panel (theme/language/sound), the game
// modes voting menu, the PvP toggle, and the toast system. Merged onto
// MainScene.prototype — see MainScene.js's Object.assign wiring at the
// bottom of that file. `this` is the live MainScene instance throughout.
import { isLikelyMobileDevice } from '../../utils/helpers.js';
import { I18N } from './i18n.js';

export default {
    createModeToggle() {
        let btn = document.getElementById('mode-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'mode-toggle';
            document.body.appendChild(btn);
        }
        btn.textContent = '2D';
        btn.setAttribute('aria-label', 'Toggle DOOM 3D view');
        btn.addEventListener('click', () => {
            this.is3D = !this.is3D;
            this.sounds.toggle(this.is3D);
            if (this.is3D) {
                // Start facing the computer so there's something to look at.
                this.doomAngle = Math.atan2(this.computer.y - this.player.y, this.computer.x - this.player.x);
            } else {
                this.player.setVelocity(0, 0);
                this.axe.setVisible(false);
                this.axe.body.enable = false;
            }
            this.doomView.setActive(this.is3D);

            if (this.is3D) {
                this.setActionHint(false);
                // First time in 3D: explain the different controls.
                if (!this._doomIntroShown) {
                    this._doomIntroShown = true;
                    const touch = this.isTouch();
                    this.showToast(
                        touch ? '3D MODE\n◄ ► turn   ▲ ▼ walk\nHold CHOP to swing'
                              : '3D MODE\n← → turn   ↑ ↓ walk\nHold F to chop',
                        4200
                    );
                }
            }

            // Clean card-flip; swap the label at the edge-on midpoint so it
            // reads as the button "turning" between 2D and 3D.
            const label = this.is3D ? '3D' : '2D';
            btn.classList.remove('flipping');
            void btn.offsetWidth; // restart the flip animation
            btn.classList.add('flipping');
            setTimeout(() => { btn.textContent = label; }, 150);
        });
        this.modeToggleBtn = btn;
    },

    // Build the stable DOM HUD: the universal ⚔ action button, the DOOM
    // first-person touch D-pad, a "?" help button, the tutorial popup and a
    // transient toast. All fixed-position, so nothing jitters like the old
    // per-frame-repositioned F/ESC sprites did.
    createHUD() {
        if (this.isTouch()) document.body.classList.add('touch');
        this._hudEls = [];

        // --- Universal action / chop button (2D + DOOM, mouse + touch) ---
        const action = document.createElement('button');
        action.id = 'action-btn';
        action.className = 'pixel-hud-btn';
        action.setAttribute('aria-label', 'Chop / interact');
        action.innerHTML = '<span class="axe-icon"></span><span class="action-label">CHOP</span>';
        const press = (e) => { e.preventDefault(); this.actionHeld = true; action.classList.add('pressed'); };
        const release = (e) => { if (e) e.preventDefault(); this.actionHeld = false; action.classList.remove('pressed'); };
        action.addEventListener('pointerdown', press);
        action.addEventListener('pointerup', release);
        action.addEventListener('pointercancel', release);
        action.addEventListener('pointerleave', release);
        document.body.appendChild(action);
        this._actionBtn = action;
        this._hudEls.push(action);

        // --- DOOM first-person movement pad (shown via CSS on touch + 3D) ---
        const pad = document.createElement('div');
        pad.id = 'doom-touch';
        const dirs = [
            ['fwd', '▲', 'Walk forward'],
            ['left', '◄', 'Turn left'],
            ['right', '►', 'Turn right'],
            ['back', '▼', 'Walk back']
        ];
        for (const [dir, glyph, label] of dirs) {
            const b = document.createElement('button');
            b.className = 'pixel-hud-btn';
            b.dataset.doom = dir;
            b.textContent = glyph;
            b.setAttribute('aria-label', label);
            const on = (e) => { e.preventDefault(); this.doomInput[dir] = true; b.classList.add('pressed'); };
            const off = (e) => { if (e) e.preventDefault(); this.doomInput[dir] = false; b.classList.remove('pressed'); };
            b.addEventListener('pointerdown', on);
            b.addEventListener('pointerup', off);
            b.addEventListener('pointercancel', off);
            b.addEventListener('pointerleave', off);
            pad.appendChild(b);
        }
        document.body.appendChild(pad);
        this._doomPad = pad;
        this._hudEls.push(pad);

        // The help ("?") button and the SFX mute toggle now live INSIDE the
        // gear/settings panel (see _renderSettings) rather than as their own
        // HUD chips. Music was removed entirely. Kept as null so the language
        // re-render + other guards stay happy.
        this._helpBtn = null;
        this._musicBtn = null;
        this._sfxBtn = null;

        // --- Bottom-left HUD row: gear, exit, then game modes — a single flex
        // container so the buttons lay themselves out left-to-right with no
        // hardcoded per-button pixel offsets (which used to overlap once text
        // width varied by language). Gear leads the row; exit sits right of it. ---
        const bottomleft = document.createElement('div');
        bottomleft.id = 'bottomleft-hud';
        document.body.appendChild(bottomleft);
        this._hudEls.push(bottomleft);

        // --- Gear icon: opens the settings panel (theme + language) ---
        const gear = document.createElement('button');
        gear.id = 'gear-btn';
        gear.className = 'pixel-hud-btn';
        gear.innerHTML = '<span class="gear-icon"></span>';
        gear.setAttribute('aria-label', this.t('gearAria'));
        gear.addEventListener('click', () => this.showSettings());
        bottomleft.appendChild(gear);
        this._gearBtn = gear;

        // --- Exit button: reloads back to the intro. ---
        const exit = document.createElement('button');
        exit.id = 'exit-btn';
        exit.className = 'pixel-hud-btn';
        exit.textContent = this.t('exitLabel');
        exit.setAttribute('aria-label', this.t('exitAria'));
        exit.addEventListener('click', () => {
            window.location.reload();
        });
        bottomleft.appendChild(exit);
        this._exitBtn = exit;

        // --- "GAME MODES" button: opens the modes menu (zombies / cowboy /
        // cowgirl), where active players vote each mode on or off. Replaces the
        // three separate always-visible toggle chips. ---
        const extra = document.createElement('div');
        extra.id = 'extra-btns';

        const modesBtn = document.createElement('button');
        modesBtn.id = 'modes-btn';
        modesBtn.className = 'pixel-hud-btn';
        modesBtn.textContent = this.t('gameModesLabel');
        modesBtn.setAttribute('aria-label', this.t('gameModesAria'));
        modesBtn.addEventListener('click', () => this.showGameModes());
        extra.appendChild(modesBtn);
        this._modesBtn = modesBtn;

        // First-time discovery hint: bouncing arrows over the button, gone for
        // good (this browser) the first time the menu is actually opened.
        let modesHintSeen = false;
        try { modesHintSeen = !!localStorage.getItem('modesHintSeen'); } catch (e) {}
        if (!modesHintSeen) {
            const modesHint = document.createElement('div');
            modesHint.id = 'modes-hint';
            modesHint.innerHTML = '<span>&#9660;</span><span>&#9660;</span><span>&#9660;</span>';
            extra.appendChild(modesHint);
            this._modesHintEl = modesHint;
        }
        // Row-toggle refs the old code updated now point at the menu rows; the
        // Game Modes menu builds + wires them (see _buildGameModes).
        this._zombieBtn = null;
        this._cowboyBtn = null;
        this._cowgirlBtn = null;

        bottomleft.appendChild(extra);
        this._buildGameModes();

        // --- Top-left HUD: presence-server status + live FPS readout,
        // side by side so one's text length never nudges the other. ---
        const topleft = document.createElement('div');
        topleft.id = 'topleft-hud';

        const srv = document.createElement('div');
        srv.id = 'server-status';
        srv.textContent = isLikelyMobileDevice() ? 'srv: off' : 'server: inactive';
        topleft.appendChild(srv);
        this._serverStatusEl = srv;

        const fps = document.createElement('div');
        fps.id = 'fps-counter';
        fps.textContent = 'fps: --';
        topleft.appendChild(fps);
        this._fpsEl = fps;
        this._fpsUpdateAt = 0;

        // --- PvP / spectator toggle, right next to the FPS readout. Default is
        // FIGHT: you + anyone else who's also fighting can hit each other.
        // Toggle to SPECTATE to become a harmless ghost to other players. ---
        const pvp = document.createElement('button');
        pvp.id = 'pvp-btn';
        pvp.setAttribute('aria-label', this.t('pvpAria'));
        pvp.addEventListener('click', () => this.setPvpEnabled(!this.pvpEnabled));
        topleft.appendChild(pvp);
        this._pvpBtn = pvp;
        this._updatePvpBtn();

        document.body.appendChild(topleft);
        this._hudEls.push(topleft);

        // --- Rolling 24h unique-visitor chart, top-right under the hearts,
        // left of the minimap. Polls server/index.js's GET /stats. ---
        this._buildStatsHud();

        // --- Top-10 kill-count leaderboard, right under the minimap. ---
        this._buildLeaderboardHud();

        // --- Player hearts (top-right, just left of the minimap camera) ---
        // Health now runs in HALF-heart steps (cowboy bullets cost 0.5, the
        // big zombie 1.5, half-heart pickups restore 0.5).
        const hearts = document.createElement('div');
        hearts.id = 'hearts-hud';
        this._hearts = [];
        this.health = this.maxHealth;
        for (let i = 0; i < this.maxHealth; i++) {
            const h = document.createElement('div');
            h.className = 'heart';
            hearts.appendChild(h);
            this._hearts.push(h);
        }
        document.body.appendChild(hearts);
        this._heartsHud = hearts;
        this._hudEls.push(hearts);

        // --- Tool row: three chips (axe / axe gun / plank), one tap each to
        // switch straight to that tool. Keyboard: 1 / 2 / 3 do the same. ---
        const toolRow = document.createElement('div');
        toolRow.id = 'tool-hud';

        const axeTool = document.createElement('button');
        axeTool.id = 'axe-tool-btn';
        axeTool.className = 'pixel-hud-btn';
        axeTool.setAttribute('aria-label', this.t('axeToolAria'));
        axeTool.innerHTML = '<span class="axe-icon"></span>';
        axeTool.addEventListener('click', () => this.setTool('axe'));
        toolRow.appendChild(axeTool);
        this._axeToolBtn = axeTool;

        const gunTool = document.createElement('button');
        gunTool.id = 'axegun-tool-btn';
        gunTool.className = 'pixel-hud-btn';
        gunTool.setAttribute('aria-label', this.t('axeGunToolAria'));
        gunTool.innerHTML = '<span class="axegun-icon"></span>';
        gunTool.addEventListener('click', () => this.setTool('axegun'));
        toolRow.appendChild(gunTool);
        this._axeGunToolBtn = gunTool;

        const plank = document.createElement('button');
        plank.id = 'plank-tool-btn';
        plank.className = 'pixel-hud-btn';
        plank.setAttribute('aria-label', this.t('plankToolAria'));
        const plankIcon = document.createElement('div');
        plankIcon.className = 'plank-icon';
        const plankVal = document.createElement('span');
        plankVal.className = 'plank-val';
        plankVal.textContent = this.planks;
        plank.appendChild(plankIcon);
        plank.appendChild(plankVal);
        plank.addEventListener('click', () => this.setTool('plank'));
        toolRow.appendChild(plank);
        this._plankHud = plank;
        this._plankVal = plankVal;

        document.body.appendChild(toolRow);
        this._toolHud = toolRow;
        this._hudEls.push(toolRow);
        this._updateToolHud();

        // --- Tree-cut score (persisted in localStorage), left of the hearts ---
        const score = document.createElement('div');
        score.id = 'score-hud';
        const scoreIcon = document.createElement('div');
        scoreIcon.className = 'score-icon';
        const scoreVal = document.createElement('span');
        scoreVal.className = 'score-val';
        scoreVal.textContent = this.logs;
        score.appendChild(scoreIcon);
        score.appendChild(scoreVal);
        document.body.appendChild(score);
        this._scoreHud = score;
        this._scoreVal = scoreVal;
        this._hudEls.push(score);

        // --- Zombie-kill counter (left of the tree score; shown while zombies are on) ---
        const zscore = document.createElement('div');
        zscore.id = 'zscore-hud';
        const zscoreIcon = document.createElement('div');
        zscoreIcon.className = 'zscore-icon';
        const zscoreVal = document.createElement('span');
        zscoreVal.className = 'zscore-val';
        zscoreVal.textContent = this.zombieKills;
        zscore.appendChild(zscoreIcon);
        zscore.appendChild(zscoreVal);
        document.body.appendChild(zscore);
        this._zscoreVal = zscoreVal;
        this._hudEls.push(zscore);

        // --- Cowboy-kill counter (shown while the cowboy duel is on) ---
        const cscore = document.createElement('div');
        cscore.id = 'cscore-hud';
        const cscoreIcon = document.createElement('div');
        cscoreIcon.className = 'cscore-icon';
        const cscoreVal = document.createElement('span');
        cscoreVal.className = 'cscore-val';
        cscoreVal.textContent = this.cowboyKills;
        cscore.appendChild(cscoreIcon);
        cscore.appendChild(cscoreVal);
        document.body.appendChild(cscore);
        this._cscoreVal = cscoreVal;
        this._hudEls.push(cscore);

        // --- Cowgirl-kill counter (shown while the cowgirl mode is on) ---
        const gscore = document.createElement('div');
        gscore.id = 'gscore-hud';
        const gscoreIcon = document.createElement('div');
        gscoreIcon.className = 'gscore-icon';
        const gscoreVal = document.createElement('span');
        gscoreVal.className = 'gscore-val';
        gscoreVal.textContent = this.cowgirlKills;
        gscore.appendChild(gscoreIcon);
        gscore.appendChild(gscoreVal);
        document.body.appendChild(gscore);
        this._gscoreVal = gscoreVal;
        this._hudEls.push(gscore);

        // --- Tutorial popup + settings popup + toast ---
        this._buildTutorial();
        this._buildSettings();
        const toast = document.createElement('div');
        toast.id = 'hud-toast';
        document.body.appendChild(toast);
        this._toast = toast;
        this._hudEls.push(toast);

        document.body.classList.add('hud-ready');
        if (typeof window.hideGameLoading === 'function') window.hideGameLoading();

        // Fire once per session: the player actually reached a playable world.
        // (posthog.capture only exists once posthog.init runs — i.e. a real key is set.)
        if (window.posthog && typeof window.posthog.capture === 'function' && !window.__gameStartedTracked) {
            window.__gameStartedTracked = true;
            window.posthog.capture('game_started');
        }

        // Show the controls tutorial once on entry.
        if (!this.tutorialShown) this.showTutorial();
    },

    _buildTutorial() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        document.body.appendChild(overlay);
        this._tutorial = overlay;
        this._hudEls.push(overlay);
        this._renderTutorial();
    },

    // Rebuilt (not just re-translated) on language change, since innerHTML
    // replacement drops the button's listener — re-bind it every time.
    _renderTutorial() {
        const overlay = this._tutorial;
        if (!overlay) return;
        const wasOpen = overlay.classList.contains('open');
        const touch = this.isTouch();
        const axe = '<span class="axe-icon"></span>';
        const gear = '<span class="gear-icon tutorial-note-icon"></span>';
        const moveKey = touch ? 'TAP' : 'WASD';
        const moveText = touch ? this.t('tutMoveTouch') : this.t('tutMoveDesktop');
        const chopText = (touch ? this.t('tutChopTouch') : this.t('tutChopDesktop')).replace('{axe}', axe);
        const doomText = touch ? this.t('tutDoomTouch') : this.t('tutDoomDesktop');
        const escText = touch ? this.t('tutEscTouch') : this.t('tutEscDesktop');

        overlay.innerHTML = `
            <div class="tutorial-card">
                <h2>${this.t('tutTitle').replace('{axe}', axe)}</h2>
                <div class="tutorial-row"><span class="tutorial-key">${moveKey}</span><span>${moveText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">${axe}</span><span>${chopText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">3D</span><span>${doomText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">ESC</span><span>${escText}</span></div>
                <button class="tutorial-start">${this.t('tutStart')}</button>
                <div class="tutorial-note">${this.t('tutNote').replace('{gear}', gear)}</div>
            </div>`;
        overlay.querySelector('.tutorial-start').addEventListener('click', () => this.hideTutorial());
        overlay.classList.toggle('open', wasOpen);
    },

    showTutorial() {
        if (this._tutorial) this._tutorial.classList.add('open');
        this._startTutorialParticles();
    },

    hideTutorial() {
        this.tutorialShown = true;
        if (this._tutorial) this._tutorial.classList.remove('open');
        this._stopTutorialParticles();
        // Dismissing the tutorial counts as "ready to play": drop the little
        // move-to-begin image and unblock gameplay immediately.
        if (this.instructionsImage) this.instructionsImage.setVisible(false);
        this.playerMoved = true;
    },

    // ---- Settings modal (gear icon): light/dark theme + language ----

    _buildSettings() {
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        document.body.appendChild(overlay);
        this._settings = overlay;
        this._hudEls.push(overlay);
        this._renderSettings();
    },

    // Rebuilt on open and on every theme/language change so the active
    // state + button labels always reflect the current choice.
    _renderSettings() {
        const overlay = this._settings;
        if (!overlay) return;
        const wasOpen = overlay.classList.contains('open');
        const LANGS = [['en', 'EN'], ['es', 'ES'], ['zh', '中文'], ['fr', 'FR']];
        overlay.innerHTML = `
            <div class="settings-card">
                <h2>${this.t('settingsTitle')}</h2>
                <div class="settings-section">
                    <div class="settings-label">${this.t('themeLabel')}</div>
                    <div class="settings-choices">
                        <button class="settings-choice-btn${this.theme === 'dark' ? ' active' : ''}" data-theme="dark">${this.t('themeDark')}</button>
                        <button class="settings-choice-btn${this.theme === 'light' ? ' active' : ''}" data-theme="light">${this.t('themeLight')}</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-label">${this.t('languageLabel')}</div>
                    <div class="settings-choices">
                        ${LANGS.map(([code, label]) => `<button class="settings-choice-btn${this.lang === code ? ' active' : ''}" data-lang="${code}">${label}</button>`).join('')}
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-label">${this.t('soundLabel')}</div>
                    <div class="settings-choices">
                        <button class="settings-choice-btn${!this.sounds.sfxMuted ? ' active' : ''}" data-sfx="1">${this.t('sfxOn')}</button>
                        <button class="settings-choice-btn${this.sounds.sfxMuted ? ' active' : ''}" data-sfx="0">${this.t('sfxOff')}</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-label">${this.t('doomPanelLabel')}</div>
                    <div id="doom-controls-slot"></div>
                </div>
                <button class="settings-help">${this.t('helpLabel')}</button>
                <button class="settings-close">${this.t('settingsClose')}</button>
            </div>`;
        overlay.querySelectorAll('[data-theme]').forEach(btn => {
            btn.addEventListener('click', () => this._applyTheme(btn.dataset.theme));
        });
        overlay.querySelectorAll('[data-lang]').forEach(btn => {
            btn.addEventListener('click', () => this._applyLanguage(btn.dataset.lang));
        });
        overlay.querySelectorAll('[data-sfx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const wantMuted = btn.dataset.sfx === '0';
                if (this.sounds.sfxMuted !== wantMuted) this.sounds.toggleSfx();
                this._renderSettings();
            });
        });
        // The live DOOM sliders (src/utils/DoomView.js) are a single DOM node
        // built once — rebuilding overlay.innerHTML above just detached it
        // from the DOM, so re-parent the same node rather than recreate it
        // (recreating would drop its slider listeners).
        if (this.doomView) overlay.querySelector('#doom-controls-slot').appendChild(this.doomView.panel);
        overlay.querySelector('.settings-help').addEventListener('click', () => {
            this.hideSettings();
            this.showTutorial();
        });
        overlay.querySelector('.settings-close').addEventListener('click', () => this.hideSettings());
        overlay.classList.toggle('open', wasOpen);
    },

    showSettings() {
        if (this._settings) this._settings.classList.add('open');
    },

    hideSettings() {
        if (this._settings) this._settings.classList.remove('open');
    },

    // ===== Game Modes menu (voting) =====
    // The three opt-in modes now live behind one "GAME MODES" button. Each row
    // has a ✓ vote (left) and ✗ vote (right) with live counts; active players
    // vote and the majority decides whether the mode is on for EVERYONE.
    _buildGameModes() {
        const overlay = document.createElement('div');
        overlay.id = 'modes-overlay';
        document.body.appendChild(overlay);
        this._modesOverlay = overlay;
        this._hudEls.push(overlay);

        const modes = ['zombies', 'cowboy', 'cowgirl'];
        const labelKey = { zombies: 'zombiesLabel', cowboy: 'cowboyLabel', cowgirl: 'cowgirlLabel' };

        const card = document.createElement('div');
        card.className = 'modes-card';
        const h2 = document.createElement('h2');
        h2.className = 'modes-title';
        h2.textContent = this.t('modesTitle');
        card.appendChild(h2);
        const note = document.createElement('p');
        note.className = 'modes-note';
        note.innerHTML = this.t('modesNote').replace('{check}', '<span class="modes-note-check">✓</span>');
        card.appendChild(note);

        const list = document.createElement('div');
        list.className = 'modes-list';
        this._modeRows = {};
        for (const mode of modes) {
            const row = document.createElement('div');
            row.className = 'mode-row';

            const yesBtn = document.createElement('button');
            yesBtn.className = 'vote-btn yes';
            yesBtn.setAttribute('aria-label', this.t('voteYesAria'));
            yesBtn.innerHTML = '<span class="vote-mark">✓</span><span class="vote-count yes-count">0</span>';
            yesBtn.addEventListener('click', () => this._castVote(mode, 1));

            const name = document.createElement('div');
            name.className = 'mode-name';
            name.innerHTML = `<span class="mode-name-text">${this.t(labelKey[mode])}</span><span class="mode-on-badge">${this.t('modeOn')}</span>`;

            const noBtn = document.createElement('button');
            noBtn.className = 'vote-btn no';
            noBtn.setAttribute('aria-label', this.t('voteNoAria'));
            noBtn.innerHTML = '<span class="vote-mark">✗</span><span class="vote-count no-count">0</span>';
            noBtn.addEventListener('click', () => this._castVote(mode, -1));

            row.appendChild(yesBtn);
            row.appendChild(name);
            row.appendChild(noBtn);
            list.appendChild(row);
            this._modeRows[mode] = {
                el: row, yesBtn, noBtn,
                yesCount: yesBtn.querySelector('.yes-count'),
                noCount: noBtn.querySelector('.no-count'),
                nameText: name.querySelector('.mode-name-text')
            };
        }
        card.appendChild(list);

        const close = document.createElement('button');
        close.className = 'modes-close';
        close.textContent = this.t('settingsClose');
        close.addEventListener('click', () => this.hideGameModes());
        card.appendChild(close);

        overlay.appendChild(card);
        // Click the dark backdrop (not the card itself) to dismiss, same as
        // tapping outside any other modal-style popup.
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideGameModes();
        });
        this._updateModesUI();
    },

    // On (re)connect, push our current votes + PvP state so the server's tally
    // reflects choices we made while it was unreachable (or before a reload).
    _onNetConnectionChange(connected) {
        this._setServerStatus(connected);
        if (!connected) { this._modesSynced = false; return; }
        for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
            if (this._myVotes[mode]) this._network.sendVote(mode, this._myVotes[mode]);
        }
        if (this.pvpEnabled) this._network.sendPvp(true, false);
    },

    showGameModes() {
        if (this._modesOverlay) this._modesOverlay.classList.add('open');
        // They found the button — the discovery hint has done its job.
        if (this._modesHintEl) {
            this._modesHintEl.remove();
            this._modesHintEl = null;
            try { localStorage.setItem('modesHintSeen', '1'); } catch (e) {}
        }
    },
    hideGameModes() { if (this._modesOverlay) this._modesOverlay.classList.remove('open'); },

    // Cast (or, if repeated, clear) our ✓/✗ vote on one mode. We always tell the
    // server (it re-tallies across every active player and echoes the
    // authoritative on/off via _applyServerModes). Until a vote-aware server has
    // actually confirmed a tally, we also decide locally so solo play — and the
    // window before the updated server is deployed — still works instantly.
    _castVote(mode, val) {
        this._myVotes[mode] = (this._myVotes[mode] === val) ? 0 : val;
        if (this._network) this._network.sendVote(mode, this._myVotes[mode]);
        if (!this._modesSynced) {
            this._modeTally[mode] = {
                yes: this._myVotes[mode] === 1 ? 1 : 0,
                no: this._myVotes[mode] === -1 ? 1 : 0,
                on: this._myVotes[mode] === 1
            };
            this._setModeEnabled(mode, this._myVotes[mode] === 1);
        }
        this._updateModesUI();
    },

    // Server told us the live vote tally + resulting on/off for every mode. Once
    // this fires, the server is authoritative (it counts every player, including
    // us) and overrides any optimistic local state.
    _applyServerModes(modes) {
        this._modesSynced = true;
        for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
            if (!modes[mode]) continue;
            this._modeTally[mode] = modes[mode];
            this._setModeEnabled(mode, !!modes[mode].on);
        }
        this._updateModesUI();
    },

    // Enable/disable a mode by name, only when it actually changed (the setters
    // spawn/despawn entities, so calling them redundantly every tick is wasteful).
    _setModeEnabled(mode, on) {
        if (mode === 'zombies' && on !== this.zombiesEnabled) this.setZombiesEnabled(on);
        else if (mode === 'cowboy' && on !== this.cowboyEnabled) this.setCowboyEnabled(on);
        else if (mode === 'cowgirl' && on !== this.cowgirlEnabled) this.setCowgirlEnabled(on);
    },

    // Repaint vote counts, my-vote highlights and the ON badges.
    _updateModesUI() {
        if (this._modeRows) {
            const state = { zombies: this.zombiesEnabled, cowboy: this.cowboyEnabled, cowgirl: this.cowgirlEnabled };
            for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
                const row = this._modeRows[mode];
                if (!row) continue;
                const t = this._modeTally[mode] || { yes: 0, no: 0, on: false };
                row.yesCount.textContent = t.yes;
                row.noCount.textContent = t.no;
                const my = this._myVotes[mode];
                row.yesBtn.classList.toggle('mine', my === 1);
                row.noBtn.classList.toggle('mine', my === -1);
                row.el.classList.toggle('on', !!state[mode]);
            }
        }
        if (this._modesBtn) this._modesBtn.classList.toggle('active', this._anyGameModeOn());
    },

    // ===== PvP / spectator =====
    // Default is spectator (harmless ghost). Toggle on to become a fighter:
    // you can strike — and be struck by — any other player who's also fighting.
    setPvpEnabled(on) {
        this.pvpEnabled = on;
        this._updatePvpBtn();
        if (this._network) this._network.sendPvp(on, !on); // spectator = not fighting
        // Refresh peer look (solid vs translucent) right away.
        for (const rp of (this.remotePlayers || [])) {
            const fightable = rp.pvp && !rp.spectator && this.pvpEnabled;
            rp.sprite.setAlpha(fightable ? 0.95 : 0.6);
        }
        this.showToast(on ? this.t('toastPvpOn') : this.t('toastPvpOff'), 2200);
    },

    _updatePvpBtn() {
        if (!this._pvpBtn) return;
        this._pvpBtn.textContent = this.pvpEnabled ? this.t('pvpFight') : this.t('pvpSpectate');
        this._pvpBtn.classList.toggle('on', this.pvpEnabled);
        this._pvpBtn.setAttribute('aria-label', this.t('pvpAria'));
    },

    // Another fighter's hit was forwarded to us — take the damage (and any
    // knockback) locally. `kb` is the angle THEY were dashing at when they
    // hit us (radians); we launch ourselves along it, same push as an NPC
    // gets from the same move (see _dashKnockback) and same decay-to-rest
    // mechanic as a bomb launch (the shared `_knockbackUntil` window in
    // update()/updateDoomMovement()).
    _onPvpHit(msg) {
        if (!this.pvpEnabled) return; // safety: server shouldn't forward, but guard
        const dmg = Math.max(0, Math.min(3, Number(msg && msg.dmg) || 0));
        if (dmg <= 0) return;
        this.cameras.main.shake(120, 0.008);
        this.damage(dmg);
        const kb = msg && msg.kb;
        if (typeof kb === 'number' && Number.isFinite(kb)) {
            this.player.setVelocity(Math.cos(kb) * this.DASH_KNOCKBACK_SPEED, Math.sin(kb) * this.DASH_KNOCKBACK_SPEED);
            this._knockbackUntil = this.time.now + this.DASH_KNOCKBACK_STUN;
        }
    },

    // Main-world camera background: black in dark mode, dark grey in light mode
    // (light mode used to leave the world pitch black, which looked unfinished).
    _mainBgColor() {
        return this.theme === 'light' ? '#3a3a3a' : '#000000';
    },

    _applyTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        this.theme = theme;
        try { localStorage.setItem('theme', theme); } catch (e) {}
        document.body.classList.toggle('theme-light', theme === 'light');
        // Recolour the live world unless we're inside a sub-world (which owns
        // its own tinted background).
        if (!this.inOhs && this.cameras && this.cameras.main) {
            this.cameras.main.setBackgroundColor(this._mainBgColor());
        }
        this._renderSettings();
    },

    // Re-renders every piece of currently-built UI chrome that carries
    // translated text: HUD button labels/aria-labels, the tutorial card,
    // and the settings panel itself. In-flight toasts aren't retranslated
    // (they're transient); new ones already pick up the new language via t().
    _applyLanguage(lang) {
        if (!I18N[lang]) return;
        this.lang = lang;
        try { localStorage.setItem('lang', lang); } catch (e) {}

        if (this._helpBtn) this._helpBtn.setAttribute('aria-label', this.t('helpAria'));
        if (this._musicBtn) this._musicBtn.setAttribute('aria-label', this.t('musicAria'));
        if (this._sfxBtn) this._sfxBtn.setAttribute('aria-label', this.t('sfxAria'));
        if (this._exitBtn) {
            this._exitBtn.textContent = this.t('exitLabel');
            this._exitBtn.setAttribute('aria-label', this.t('exitAria'));
        }
        if (this._gearBtn) this._gearBtn.setAttribute('aria-label', this.t('gearAria'));
        if (this._modesBtn) {
            this._modesBtn.textContent = this.t('gameModesLabel');
            this._modesBtn.setAttribute('aria-label', this.t('gameModesAria'));
        }
        this._updatePvpBtn();
        // Re-label the game-modes menu (title, note, mode names, ON badges).
        if (this._modesOverlay) {
            const titleEl = this._modesOverlay.querySelector('.modes-title');
            if (titleEl) titleEl.textContent = this.t('modesTitle');
            const noteEl = this._modesOverlay.querySelector('.modes-note');
            if (noteEl) noteEl.innerHTML = this.t('modesNote').replace('{check}', '<span class="modes-note-check">✓</span>');
            const closeEl = this._modesOverlay.querySelector('.modes-close');
            if (closeEl) closeEl.textContent = this.t('settingsClose');
            const labelKey = { zombies: 'zombiesLabel', cowboy: 'cowboyLabel', cowgirl: 'cowgirlLabel' };
            for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
                const row = this._modeRows && this._modeRows[mode];
                if (row && row.nameText) row.nameText.textContent = this.t(labelKey[mode]);
            }
        }
        if (this._axeToolBtn) this._axeToolBtn.setAttribute('aria-label', this.t('axeToolAria'));
        if (this._axeGunToolBtn) this._axeGunToolBtn.setAttribute('aria-label', this.t('axeGunToolAria'));
        if (this._plankHud) this._plankHud.setAttribute('aria-label', this.t('plankToolAria'));
        if (this.tool) this._updateToolHud();

        this._renderTutorial();
        this._renderSettings();
    },

    // Toggle the "in range" state of the action button. While active it streams
    // small green particles out of the button instead of a CSS glow.
    setActionHint(on) {
        if (!this._actionBtn) return;
        this._actionBtn.classList.toggle('hint', !!on);
        if (on) this._spawnAxeParticle();
    },

    // Stream little pixel particles out of the action button while it glows.
    // Throttled, but spawns a small cluster each tick so the button really
    // erupts with pixels when you're in range. Each particle self-removes.
    _spawnAxeParticle() {
        const now = performance.now();
        if (now - (this._lastAxeParticle || 0) < 45) return;
        this._lastAxeParticle = now;

        const r = this._actionBtn.getBoundingClientRect();
        // Mostly the signature green, with the occasional bright pixel for pop.
        const colors = ['#c6ff33', '#c6ff33', '#c6ff33', '#eaffb0', '#ffe500', '#7ea82a'];
        const cluster = 2 + Math.floor(Math.random() * 2); // 2-3 per tick
        for (let i = 0; i < cluster; i++) {
            const p = document.createElement('div');
            p.className = 'axe-particle';
            const size = 3 + Math.floor(Math.random() * 5);
            p.style.width = p.style.height = `${size}px`;
            const col = colors[Math.floor(Math.random() * colors.length)];
            p.style.background = col;
            p.style.boxShadow = `0 0 4px ${col}`;
            p.style.left = `${r.left + r.width * 0.5 + (Math.random() - 0.5) * r.width * 0.9}px`;
            p.style.top = `${r.top + r.height * 0.5 + (Math.random() - 0.5) * r.height * 0.6}px`;
            p.style.setProperty('--dx', `${((Math.random() - 0.5) * 110).toFixed(0)}px`);
            p.style.setProperty('--dy', `${(-50 - Math.random() * 90).toFixed(0)}px`);
            p.addEventListener('animationend', () => p.remove());
            document.body.appendChild(p);
        }
    },

    // Continuously spray bright pixel sparks around the border of the tutorial
    // card while it's open, so the popup looks like it's shining.
    _startTutorialParticles() {
        this._stopTutorialParticles();
        const spawn = () => {
            if (!this._tutorial || !this._tutorial.classList.contains('open')) return;
            const card = this._tutorial.querySelector('.tutorial-card');
            if (!card) return;
            const r = card.getBoundingClientRect();
            for (let i = 0; i < 3; i++) this._spawnTutorialSpark(r);
        };
        this._tutorialFxTimer = setInterval(spawn, 85);
        spawn(); // immediate first burst
    },

    _stopTutorialParticles() {
        clearInterval(this._tutorialFxTimer);
        this._tutorialFxTimer = null;
    },

    // One pixel spark at a random point on the card's perimeter, drifting
    // outward (along the edge normal) while it twinkles. Self-removes.
    _spawnTutorialSpark(r) {
        const colors = ['#c6ff33', '#ffe500', '#ff9500', '#00c7ff', '#ff2dd4', '#ffffff'];
        const per = 2 * (r.width + r.height);
        let d = Math.random() * per;
        let x, y, nx, ny;
        if (d < r.width) { x = r.left + d; y = r.top; nx = 0; ny = -1; }
        else if (d < r.width + r.height) { x = r.right; y = r.top + (d - r.width); nx = 1; ny = 0; }
        else if (d < 2 * r.width + r.height) { x = r.right - (d - r.width - r.height); y = r.bottom; nx = 0; ny = 1; }
        else { x = r.left; y = r.bottom - (d - 2 * r.width - r.height); nx = -1; ny = 0; }

        const p = document.createElement('div');
        p.className = 'tutorial-spark';
        const size = 3 + Math.floor(Math.random() * 5);
        p.style.width = p.style.height = `${size}px`;
        const col = colors[Math.floor(Math.random() * colors.length)];
        p.style.background = col;
        p.style.boxShadow = `0 0 6px ${col}`;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        // Outward drift along the border normal, plus a little tangential spread.
        const dist = 14 + Math.random() * 34;
        const spread = (Math.random() - 0.5) * 30;
        p.style.setProperty('--dx', `${(nx * dist + (ny !== 0 ? spread : 0)).toFixed(0)}px`);
        p.style.setProperty('--dy', `${(ny * dist + (nx !== 0 ? spread : 0)).toFixed(0)}px`);
        p.addEventListener('animationend', () => p.remove());
        document.body.appendChild(p);
    },

    // Clear all held HUD input (used when the HUD is hidden mid-hold, so its
    // buttons can never deliver the matching pointerup).
    resetHeldInput() {
        this.actionHeld = false;
        this.doomInput.left = this.doomInput.right = this.doomInput.fwd = this.doomInput.back = false;
        if (this._actionBtn) this._actionBtn.classList.remove('pressed', 'hint');
        if (this._doomPad) this._doomPad.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
    },

    // Brief self-dismissing pixel message near the top of the screen.
    // i18n lookup — falls back to English, then the raw key, so a missing
    // translation never renders blank.
    t(key) {
        const table = I18N[this.lang] || I18N.en;
        return table[key] ?? I18N.en[key] ?? key;
    },

    showToast(message, ms = 3000) {
        if (!this._toast) return;
        this._toast.textContent = message;      // \n in the message wraps via white-space
        this._toast.style.whiteSpace = 'pre-line';
        this._toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => this._toast.classList.remove('show'), ms);
    },

    destroyHUD() {
        clearTimeout(this._toastTimer);
        clearInterval(this._statsPollTimer);
        clearInterval(this._leaderboardPollTimer);
        this._stopTutorialParticles();
        if (this._hudEls) this._hudEls.forEach(el => el.remove());
        this._hudEls = [];
        document.body.classList.remove('hud-ready', 'touch', 'zombies-on', 'cowboy-on', 'cowgirl-on');
    },

    // Reflects NetworkManager's live WebSocket state — "active" means the
    // presence server (the EC2 Spot box) is actually up and reachable right now.
    // Phones get the short form: "server: active" is wide enough at any
    // legible font size to still run into the hearts/minimap cluster on the
    // right, even stacked in its own row.
    _setServerStatus(connected) {
        if (!this._serverStatusEl) return;
        const text = isLikelyMobileDevice()
            ? (connected ? 'srv: on' : 'srv: off')
            : (connected ? 'server: active' : 'server: inactive');
        this._serverStatusEl.textContent = text;
        this._serverStatusEl.classList.toggle('active', connected);
        this._serverStatusEl.classList.toggle('inactive', !connected);
    },
};
