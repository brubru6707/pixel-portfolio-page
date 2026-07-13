// Health/hearts, the GAME OVER screen (final score + share + new-high-score
// entry), and the rare half-heart field pickups. Merged onto MainScene.prototype.
export default {
    // Take damage in HEARTS (0.5 steps). Zenith mode makes the player
    // invincible, so damage silently no-ops while it's running.
    damage(amount = 1) {
        if (!this._hearts || !this._hearts.length) return;
        if (this.time.now < this._invincibleUntil) return;
        if (this.health <= 0) return;
        const prev = this.health;
        this.health = Math.max(0, Math.round((this.health - amount) * 2) / 2);

        // Explode every heart that just went from alive to fully empty.
        for (let i = 0; i < this._hearts.length; i++) {
            const wasAlive = prev > i;
            const nowDead = this.health <= i;
            if (wasAlive && nowDead) {
                const heart = this._hearts[i];
                const r = heart.getBoundingClientRect();
                this._spawnHeartParticles(r.left + r.width / 2, r.top + r.height / 2);
                heart.classList.add('exploding');
                setTimeout(() => {
                    heart.classList.remove('exploding');
                    this._renderHearts();
                }, 420);
            }
        }
        this._renderHearts();

        // Out of hearts → the player is dead. Let the final heart pop play out,
        // then raise the GAME OVER screen (restart / exit).
        if (this.health === 0) {
            setTimeout(() => this._showGameOver(), 700);
        }
    },

    // Full-screen GAME OVER overlay. Under the title sit two buttons: EXIT
    // (left, resets the visitor gate) and RESTART? (right, rainbow-glowing,
    // with a 5s countdown that auto-sends the player back to the 2D world).
    _showGameOver() {
        if (this._gameOverEl) return;
        this._isGameOver = true; // freezes update() — see the check at its top
        this.player.setVelocity(0, 0);
        // Dying with the settings/modes/tutorial popup open (e.g. a PvP hit
        // lands while you're mid-menu) would otherwise leave it open behind
        // the game-over overlay — close everything so it's a clean screen.
        this.hideSettings();
        this.hideGameModes();
        if (this._tutorial) this._tutorial.classList.remove('open');
        document.body.classList.add('game-over-open'); // hides the gameplay HUD
        const overlay = document.createElement('div');
        overlay.id = 'game-over';

        const title = document.createElement('div');
        title.id = 'game-over-title';
        title.textContent = this.t('gameOverLabel');
        overlay.appendChild(title);

        // Final score + share — the "beat this" hook, shown every death
        // regardless of whether this run cracked the top 10.
        const cowboy = this.cowboyKills || 0;
        const cowgirl = this.cowgirlKills || 0;
        const zombie = this.zombieKills || 0;
        const total = cowboy + cowgirl + zombie;

        const summary = document.createElement('div');
        summary.id = 'go-summary';

        const scorePanel = document.createElement('div');
        scorePanel.id = 'go-score-panel';
        scorePanel.innerHTML = `
            <div id="go-score-label">${this.t('finalScoreLabel')}: ${total}</div>
            <div id="go-score-breakdown">
                <span class="lb-icon lb-icon-cowboy"></span><span class="lb-num lb-num-cowboy">${cowboy}</span>
                <span class="lb-icon lb-icon-cowgirl"></span><span class="lb-num lb-num-cowgirl">${cowgirl}</span>
                <span class="lb-icon lb-icon-zombie"></span><span class="lb-num lb-num-zombie">${zombie}</span>
            </div>`;
        summary.appendChild(scorePanel);

        const share = document.createElement('button');
        share.id = 'go-share-btn';
        share.textContent = this.t('shareLabel');
        share.setAttribute('aria-label', this.t('shareAria'));
        share.addEventListener('click', () => {
            const text = this._buildShareText(total, cowboy, cowgirl, zombie);
            const url = window.location.origin + window.location.pathname;
            if (navigator.share) {
                navigator.share({ title: 'Chompixel', text, url }).catch(() => {});
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(`${text} ${url}`).then(() => {
                    share.textContent = this.t('shareCopiedLabel');
                    setTimeout(() => { share.textContent = this.t('shareLabel'); }, 2000);
                }).catch(() => {});
            }
        });
        summary.appendChild(share);
        overlay.appendChild(summary);

        // New-high-score initials entry — only when this run's total would
        // actually crack the cached top 10 (fewer than 10 entries yet, or it
        // beats the current 10th place).
        const cache = this._leaderboardCache || [];
        const qualifies = total > 0 && (cache.length < 10 || total > cache[cache.length - 1].total);
        if (qualifies) {
            const hsRow = document.createElement('div');
            hsRow.id = 'go-highscore-row';

            const label = document.createElement('div');
            label.id = 'go-highscore-label';
            label.textContent = this.t('newHighScoreLabel');
            hsRow.appendChild(label);

            const sub = document.createElement('div');
            sub.id = 'go-highscore-sub';
            sub.textContent = this.t('enterInitialsLabel');
            hsRow.appendChild(sub);

            const form = document.createElement('div');
            form.id = 'go-highscore-form';

            const input = document.createElement('input');
            input.id = 'go-initials-input';
            input.maxLength = 3;
            input.autocomplete = 'off';
            input.spellcheck = false;
            try { input.value = (localStorage.getItem('lbName') || '').slice(0, 3); } catch (e) {}
            input.addEventListener('input', () => {
                input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
            });

            const submit = document.createElement('button');
            submit.id = 'go-submit-btn';
            submit.textContent = this.t('submitScoreLabel');
            submit.setAttribute('aria-label', this.t('submitScoreAria'));
            submit.addEventListener('click', () => {
                const name = input.value.trim();
                if (!name) return;
                try { localStorage.setItem('lbName', name); } catch (e) {}
                submit.disabled = true;
                this._submitScore(name, cowboy, cowgirl, zombie).then(() => { hsRow.remove(); });
            });

            form.appendChild(input);
            form.appendChild(submit);
            hsRow.appendChild(form);
            overlay.appendChild(hsRow);
        }

        const row = document.createElement('div');
        row.id = 'game-over-btns';

        // RESTART? — normally a rainbow-glow 5s auto-countdown reload straight
        // back into the 2D world. Skipped when a new high score is on the
        // table so the auto-reload can't yank the initials form away mid-entry
        // — the player restarts manually once they're done with it.
        const restart = document.createElement('button');
        restart.id = 'restart-btn';
        restart.setAttribute('aria-label', this.t('restartAria'));
        const goRestart = () => { clearInterval(this._gameOverTimer); window.location.reload(); };
        restart.addEventListener('click', goRestart);
        if (qualifies) {
            restart.textContent = this.t('restartLabel');
        } else {
            let secs = 5;
            const paint = () => { restart.innerHTML = `${this.t('restartLabel')} <span class="restart-secs">${secs}</span>`; };
            paint();
            this._gameOverTimer = setInterval(() => {
                secs -= 1;
                paint();
                if (secs <= 0) goRestart();
            }, 1000);
        }

        // EXIT — reload back to the intro.
        const exit = document.createElement('button');
        exit.id = 'game-over-exit';
        exit.textContent = this.t('exitLabel');
        exit.setAttribute('aria-label', this.t('exitGameAria'));
        exit.addEventListener('click', () => {
            clearInterval(this._gameOverTimer);
            window.location.reload();
        });

        // DOM order: EXIT first (left), then RESTART? (right).
        row.appendChild(exit);
        row.appendChild(restart);

        overlay.appendChild(row);
        document.body.appendChild(overlay);
        this._gameOverEl = overlay;
    },

    // Legacy single-heart hit (bombs, regular zombies).
    loseHeart() { this.damage(1); },

    heal(amount = 0.5) {
        this.health = Math.min(this.maxHealth, Math.round((this.health + amount) * 2) / 2);
        this._renderHearts();
    },

    // Paint the heart row from this.health: full / half / lost per slot.
    _renderHearts() {
        if (!this._hearts) return;
        this._hearts.forEach((h, i) => {
            if (h.classList.contains('exploding')) return; // let the pop finish
            h.classList.toggle('lost', this.health <= i);
            h.classList.toggle('half', this.health > i && this.health < i + 1);
        });
    },

    refillHearts() {
        this.health = this.maxHealth;
        this._hearts.forEach(h => h.classList.remove('lost', 'half', 'exploding'));
    },

    // Red DOM pixel burst radiating from a screen point (used by loseHeart).
    _spawnHeartParticles(x, y) {
        const colors = ['#ff2b2b', '#ff5555', '#ff8080', '#c40000', '#ffd0d0'];
        for (let i = 0; i < 18; i++) {
            const p = document.createElement('div');
            p.className = 'heart-particle';
            const size = 3 + Math.floor(Math.random() * 5);
            p.style.width = p.style.height = `${size}px`;
            const col = colors[Math.floor(Math.random() * colors.length)];
            p.style.background = col;
            p.style.boxShadow = `0 0 5px ${col}`;
            p.style.left = `${x}px`;
            p.style.top = `${y}px`;
            const ang = Math.random() * Math.PI * 2;
            const dist = 24 + Math.random() * 60;
            p.style.setProperty('--dx', `${(Math.cos(ang) * dist).toFixed(0)}px`);
            p.style.setProperty('--dy', `${(Math.sin(ang) * dist + 20).toFixed(0)}px`);
            p.addEventListener('animationend', () => p.remove());
            document.body.appendChild(p);
        }
    },

    // ===== Half-heart pickups =====

    // Rarely drop a lone half-heart somewhere in the main world (at most 2
    // out at once, coin-flip per 16s tick — so roughly one every ~30s).
    _maybeSpawnHeartPickup() {
        if (this.inOhs) return;
        if (this.heartPickups.countActive(true) >= 2) return;
        if (Math.random() < 0.5) return;
        let x = 0, y = 0, tries = 0, ok = false;
        while (tries++ < 40 && !ok) {
            x = Phaser.Math.Between(150, 1850);
            y = Phaser.Math.Between(150, 1850);
            if (this._navDirty) this._buildNavGrid();
            ok = !this._navBlockedAt(x, y)
                && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > 300;
        }
        if (!ok) return;
        const h = this.heartPickups.create(x, y, 'halfHeartPix');
        h.setScale(2).setDepth(4);
        h.body.setAllowGravity(false);
        h.setImmovable(true);
        h.body.moves = false; // let the bob tween own the position
        // Gentle bob + pulse so it catches the eye.
        this.tweens.add({ targets: h, y: y - 8, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: h, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });
    },

    _collectHeart(player, h) {
        if (!h.active) return;
        const hx = h.x, hy = h.y;
        h.destroy();
        this.heal(0.5);
        this.sounds.chop();
        this._pixelBurst(hx, hy, {
            colors: [0xff3b3b, 0xff8080, 0xffd0d0, 0xffffff],
            count: 14, minSpeed: 70, maxSpeed: 210, gravity: 260
        });
        this.showCutText(hx, hy - 30, '+ HALF HEART');
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(hx, hy, { colors: ['#ff3b3b', '#ff8080', '#ffd0d0'], count: 14 });
            this.doomView.textAtWorld(hx, hy, '+ HALF HEART');
        }
    },
};
