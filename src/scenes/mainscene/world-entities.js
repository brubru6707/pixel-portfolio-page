// Main-world landmarks (computer/OHS-school/Brown-university/contribute-sign/
// orb chop handlers), tree/bomb spawning, decorative ghosts, the full-screen
// sub-page iframe flow, and the orb's video modal. Merged onto
// MainScene.prototype.
export default {
    cutTree(axe, tree) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();

        // Remember where the tree stood before the shake tween moves it.
        const tx = tree.x, ty = tree.y;

        // === Shake the tree ===
        this.tweens.add({
            targets: tree,
            x: { value: tree.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: tree.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.sounds.smash();
                tree.destroy();
                this._navDirty = true; // a blocker is gone — zombies can re-path through
                this.logs += 1;
                // Persist the running tree-cut total + update the HUD counter.
                try { localStorage.setItem('treesCut', this.logs); } catch (e) {}
                if (this._scoreVal) this._scoreVal.textContent = this.logs;
                // Every 3 trees bank one plank (press 3 to place them).
                this._treesTowardPlank += 1;
                if (this._treesTowardPlank >= 3) {
                    this._treesTowardPlank = 0;
                    this.planks += 1;
                    if (this._plankVal) this._plankVal.textContent = this.planks;
                    if (this.planks === 1) this.showToast(this.t('toastPlankEarned'), 3200);
                }
                // Chopped the very last tree? The whole forest regrows.
                if (this.trees.countActive(true) === 0) {
                    this.time.delayedCall(900, () => {
                        this._spawnTrees();
                        this._navDirty = true;
                        this.showToast('THE FOREST REGROWS...', 2600);
                    });
                }
                // It breaks -> woody particle burst + a hype word popup.
                const word = this.pickCutWord();
                this.emitBreakParticles(tx, ty);
                this.showCutText(tx, ty - 40, word);
                // Same effect on the DOOM overlay canvas (Phaser FX above is
                // invisible in first-person). These self-guard on 3D being active.
                this.doomView.burstAtWorld(tx, ty, { colors: ['#8b5a2b', '#5a3a1a', '#a9772f', '#3f8a2f', '#2f6d22', '#c9a24a'], count: 26, wz: 30 });
                this.doomView.textAtWorld(tx, ty, word);
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    },

    // True while any of the opt-in game modes (zombies / cowboy / cowgirl) is
    // running — either toggled locally or enabled by the live majority vote.
    _anyGameModeOn() {
        return !!(this.zombiesEnabled || this.cowboyEnabled || this.cowgirlEnabled);
    },

    // How many chops it takes to open an entity's iframe/sub-page. Doubles
    // (3 -> 6) while a game mode is on, so opening a project is a real commitment
    // when the world is dangerous.
    _entityChopsNeeded() {
        return this._anyGameModeOn() ? 6 : 3;
    },

    hitComputer(axe, computer) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y); // doesn't break -> rainbow sparkle
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'], count: 16, wz: 40 });

        // Shake the computer randomly
        this.tweens.add({
            targets: computer,
            x: { value: computer.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: computer.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.computerChops++;
                if (this.computerChops >= this._entityChopsNeeded()) {
                    this.sounds.smash();
                    this.openSubPage('personalWebsite/index.html');
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    },

    // ===== OHS sub-world =====
    // Rainbow palette reused by several hit handlers (DOOM canvas needs CSS strings).
    get _rainbowFx() { return ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4']; },

    // Chop the OHS school 3x -> enter the OHS world.
    hitOhs(axe, school) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: this._rainbowFx, count: 16, wz: 40 });
        this.tweens.add({
            targets: school,
            x: { value: school.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: school.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.ohsChops++;
                if (this.ohsChops >= this._entityChopsNeeded()) { this.sounds.smash(); this.enterOhsWorld(); }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    },

    // Chop Brown University 3x -> enter the Brown world (shape up / bloom /
    // chipathon), the same in-place swap as the OHS world.
    hitBrown(axe, school) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: this._rainbowFx, count: 16, wz: 40 });
        this.tweens.add({
            targets: school,
            x: { value: school.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: school.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.brownChops++;
                if (this.brownChops >= this._entityChopsNeeded()) { this.sounds.smash(); this.enterBrownWorld(); }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    },

    // ===== World spawning / regeneration =====

    // Scatter 100 trees, skipping anything too close to another tree, the
    // landmarks, or the player (so a regrowing forest can't trap anyone).
    _spawnTrees() {
        const worldWidth = 2000, worldHeight = 2000;
        for (let i = 0; i < 40; i++) {
            let x, y, overlap, tries = 0;
            do {
                x = Phaser.Math.Between(0, worldWidth);
                y = Phaser.Math.Between(0, worldHeight);
                overlap = false;
                this.trees.getChildren().forEach(tree => {
                    if (Phaser.Math.Distance.Between(x, y, tree.x, tree.y) < 80) overlap = true;
                });
                if (!overlap) {
                    if (Phaser.Math.Distance.Between(x, y, this.computer.x, this.computer.y) < 350) overlap = true;
                    else if (Phaser.Math.Distance.Between(x, y, this.contributeSign.x, this.contributeSign.y) < 160) overlap = true;
                    else if (Phaser.Math.Distance.Between(x, y, this.ohsSchool.x, this.ohsSchool.y) < 340) overlap = true;
                    else if (Phaser.Math.Distance.Between(x, y, this.brownSchool.x, this.brownSchool.y) < 380) overlap = true;
                    else if (this.player && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 140) overlap = true;
                }
            } while (overlap && tries++ < 60);
            if (overlap) continue;
            const tree = this.trees.create(x, y, 'tree').setScale(3).refreshBody();
            tree.chopProgress = 0;
        }
    },

    // Scatter a fresh batch of hidden bombs (used at start + regeneration).
    _spawnBombs() {
        const worldWidth = 2000, worldHeight = 2000;
        for (let i = 0; i < this.BOMB_COUNT; i++) {
            const bx = Phaser.Math.Between(150, worldWidth - 150);
            const by = Phaser.Math.Between(150, worldHeight - 150);
            if (Phaser.Math.Distance.Between(bx, by, worldWidth / 2, worldHeight / 2) < 350) { i--; continue; }
            if (this.player && Phaser.Math.Distance.Between(bx, by, this.player.x, this.player.y) < 250) { i--; continue; }
            const b = this.bombs.create(bx, by, 'hidden-bomb').setImmovable(true).setScale(3).refreshBody();
            if (this.anims.exists('bomb-idle')) b.anims.play('bomb-idle');
            // Inside a sub-world? Keep the fresh batch hidden until we're back.
            if (this.inOhs) { b.setVisible(false); b.body.enable = false; }
        }
        this._bombRegenQueued = false;
    },

    // Once every hidden bomb has been used up, bury a fresh batch.
    _checkBombRegen() {
        if (this._bombRegenQueued) return;
        const anyLive = this.bombs.getChildren().some(b => b.active);
        if (anyLive) return;
        this._bombRegenQueued = true;
        this.time.delayedCall(3000, () => {
            this.bombs.clear(true, true);
            this._spawnBombs();
            if (!this.inOhs) this.showToast('...more bombs were buried.', 2200);
        });
    },

    // Chop the contribute sign 3x -> new tab to the CONTRIBUTING guide.
    // GitHub blocks framing, so this can't go through openSubPage's iframe.
    hitContributeSign(axe, sign) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: this._rainbowFx, count: 16, wz: 40 });

        this.tweens.add({
            targets: sign,
            x: { value: sign.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: sign.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.contributeSignChops++;
                if (this.contributeSignChops >= 3) {
                    this.contributeSignChops = 0;
                    this.sounds.smash();
                    window.open('https://github.com/brubru6707/bruno-rodriguez-mendez/blob/main/CONTRIBUTING.md', '_blank', 'noopener,noreferrer');
                }
            }
        });

        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    },

    hitOrb(axe, orb) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y); // doesn't break -> rainbow sparkle
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'], count: 16, wz: 40 });

        this.tweens.add({
            targets: orb,
            x: { value: orb.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: orb.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.orbChops++;
                if (this.orbChops >= this._entityChopsNeeded()) {
                    this.sounds.smash();
                    this.orbActivated = true;
                    let title = "I'm Salutatorian ^_^";
                    let description = 'My silly speech';
                    let videoUrl = 'https://www.youtube.com/embed/8MPoMOXszWM';
                    this.enterModal(title, description, videoUrl);
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    },

    // Opens a full-screen sub-page (personal website or a subdomain) as a
    // natural extension of the world. One code path + one set of global close
    // handlers, so closing always tears down the right iframe and restores
    // the player exactly where they were.
    openSubPage(url, ghost = null) {
        if (this.activeSubPage) return;
        if (window.posthog && typeof window.posthog.capture === 'function') window.posthog.capture('subpage_open', { url });

        // The HUD is about to be hidden, so its buttons can't fire pointerup —
        // clear held state or it would auto-chop/auto-walk on return.
        this.resetHeldInput();

        this.preSubPageState = {
            x: this.player.x,
            y: this.player.y
        };

        this.scene.pause();
        this.game.canvas.style.display = 'none';
        document.body.classList.add('subpage-open'); // hides world previews + mode toggle via CSS
        document.body.style.overflow = 'hidden';

        const el = document.createElement('iframe');
        el.id = 'subPageFrame';
        el.className = 'subpage-frame';
        el.src = url;
        // Always scrollable — the personal site is a tall page. (It used to be
        // locked via a 'DISABLE INTERACTION' message, which is why it wouldn't
        // scroll; we no longer send that.)
        el.setAttribute('scrolling', 'yes');
        document.body.appendChild(el);

        // Single, clean pixel "BACK" button (replaces the old esc-key image and
        // the personal site's own duplicate esc button — we no longer trigger
        // that one, so only this one shows).
        const escButton = document.createElement('button');
        escButton.id = 'subPageEscButton';
        escButton.className = 'subpage-back pixel-hud-btn';
        escButton.innerHTML = '&#10005; BACK';
        escButton.setAttribute('aria-label', 'Back to world');
        escButton.addEventListener('click', () => this.closeSubPage());
        document.body.appendChild(escButton);

        this.activeSubPage = { el, escButton, ghost };
    },

    closeSubPage() {
        if (!this.activeSubPage) return;
        const { el, escButton, ghost } = this.activeSubPage;
        this.activeSubPage = null;

        el.remove();
        escButton.remove();
        document.body.classList.remove('subpage-open');
        document.body.style.overflow = 'hidden';
        this.game.canvas.style.display = 'block';

        // Reset chop counters so the page doesn't immediately reopen
        if (ghost) ghost.chops = 0;
        this.computerChops = 0;

        // Restore the player exactly where they were and re-attach the camera
        if (this.preSubPageState) {
            this.player.setPosition(this.preSubPageState.x, this.preSubPageState.y);
            this.player.setVelocity(0, 0);
        }
        this.cameras.main.startFollow(this.player);
        this.scene.resume();
    },

    spawnGhost() {
        if (this.inOhs) return; // OHS has its own roaming ghosts
        // Decorative ghost inside the current camera view (world coordinates)
        const cam = this.cameras.main;
        const x = Phaser.Math.Between(cam.worldView.x, cam.worldView.x + cam.worldView.width);
        const y = Phaser.Math.Between(cam.worldView.y, cam.worldView.y + cam.worldView.height);

        const ghost = this.add.sprite(x, y, 'ghost').setAlpha(0.5).setScale(3);
        ghost.play('ghost_float');

        this.time.delayedCall(5000, () => {
            // Fade out over 2 seconds
            this.tweens.add({
                targets: ghost,
                alpha: 0,
                duration: 2000,
                onComplete: () => ghost.destroy()
            });
        });
    },

    triggerExplosion(player, bomb) {
        // Zenith mode: the player is untouchable — don't even waste the bomb.
        if (this.time.now < this._invincibleUntil) return;
        bomb.disableBody(true, true); // hide & disable this bomb
        this.sounds.smash();

        const explosion = this.add.sprite(bomb.x, bomb.y, 'explosive').setScale(3).setDepth(16000);
        explosion.play('explode');
        explosion.on('animationcomplete', () => explosion.destroy());
        if (this.miniMap) this.miniMap.ignore(explosion);

        // Red pixel burst at the blast — 2D uses numeric tints (Phaser sprites),
        // DOOM uses CSS-string colours (canvas fillStyle).
        this._pixelBurst(bomb.x, bomb.y, {
            colors: [0xff2b2b, 0xff5555, 0xff8080, 0xc40000, 0xffffff],
            count: 26, minSpeed: 120, maxSpeed: 340, gravity: 500
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(bomb.x, bomb.y, {
                colors: ['#ff2b2b', '#ff5555', '#ff8080', '#c40000', '#ffffff'], count: 26
            });
        }

        // Blow one of the hearts in the top-right HUD.
        this.loseHeart();

        // Launch the player away from the blast with great velocity that decays
        // to rest. The knockback window (below) ignores movement input and bleeds
        // the velocity off each frame — see update()/updateDoomMovement().
        const angle = Math.atan2(player.y - bomb.y, player.x - bomb.x);
        const force = 1500; // moderate launch — a shove that quickly decays to rest
        player.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
        this._knockbackUntil = this.time.now + 800;
    },

    enterModal(title, description, videoUrl) {
        // Set modal content
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-description').textContent = description;
        document.getElementById('modal-video').src = videoUrl;
        document.getElementById('project-modal').style.display = 'flex';
        document.body.classList.add('modal-open');
        this.resetHeldInput(); // HUD hidden — avoid stuck held buttons

        this.scene.pause(); // Pause game logic

        // Keyboard close handler
        const keyHandler = (e) => {
            if (e.code == 'Escape') {
                this.hideProjectModal();
            }
        };

        // Mobile click-to-close handler (tap backdrop)
        const clickHandler = (e) => {
            // Check if click is outside modal content (on backdrop)
            if (!e.target.closest('.modal-content')) {
                this.hideProjectModal();
            }
        };

        // Explicit close button (reliable on touch — replaces the ESC sprite)
        const closeHandler = () => this.hideProjectModal();
        const closeBtn = document.getElementById('modal-close');

        // Store handlers for later removal
        this.currentModalHandlers = { keyHandler, clickHandler, closeHandler, closeBtn };

        window.addEventListener('keydown', keyHandler);
        document.getElementById('project-modal').addEventListener('click', clickHandler);
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    },

    hideProjectModal() {
        // Clear video source and hide modal
        document.getElementById('modal-video').src = '';
        document.getElementById('project-modal').style.display = 'none';
        document.body.classList.remove('modal-open');

        // Remove event listeners
        if (this.currentModalHandlers) {
            window.removeEventListener('keydown', this.currentModalHandlers.keyHandler);
            document.getElementById('project-modal').removeEventListener('click', this.currentModalHandlers.clickHandler);
            if (this.currentModalHandlers.closeBtn) {
                this.currentModalHandlers.closeBtn.removeEventListener('click', this.currentModalHandlers.closeHandler);
            }
            this.currentModalHandlers = null;
        }

        this.orbActivated = false;
        this.orbChops = 0;
        this.scene.resume(); // Resume game logic
    },
};
