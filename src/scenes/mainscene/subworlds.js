// OHS + Brown sub-worlds: the in-place world swap (not a second Phaser
// scene — see _enterSubWorld), their project images, exit sign, and roaming
// ghosts. Merged onto MainScene.prototype. `this._rainbowFx` is defined as a
// getter in world-entities.js — available here too since both mixins land
// on the same MainScene.prototype.
export default {
    // Fetches any project preview images not already in the texture cache,
    // reusing the same loading overlay as the initial preload (real progress,
    // driven by this scene's persistent 'progress' listener from preload()
    // above — not a fake timer). Calls back once everything's ready; no-ops
    // straight to the callback if a repeat visit finds everything cached.
    _loadSubWorldAssets(projects, cb) {
        const missing = projects.filter(p => !this.textures.exists(p.key));
        if (!missing.length) { cb(); return; }
        if (typeof window.showGameLoading === 'function') window.showGameLoading();
        missing.forEach(p => this.load.image(p.key, p.path));
        this.load.once('complete', () => {
            if (typeof window.hideGameLoading === 'function') window.hideGameLoading();
            cb();
        });
        this.load.start();
    },

    // Chop a project image 3x -> open its site.
    hitProject(axe, spr) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: this._rainbowFx, count: 16, wz: 40 });
        this.tweens.add({
            targets: spr,
            x: { value: spr.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: spr.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                spr.chops++;
                if (spr.chops >= 3) {
                    spr.chops = 0; // so it doesn't instantly reopen on return
                    this.sounds.smash();
                    if (spr.newTab) window.open(spr.pageUrl, '_blank', 'noopener,noreferrer');
                    else this.openSubPage(spr.pageUrl);
                }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    },

    // One chop of the exit sign -> back to the main world.
    hitExitSign(axe, sign) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.sounds.smash();
        this.exitOhsWorld();
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    },

    // Chop an OHS ghost -> it vanishes in a spray of white pixels.
    hitOhsGhost(axe, g) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this._pixelBurst(g.x, g.y, {
            colors: [0xffffff, 0xf0f0f0, 0xcccccc, 0xffffff],
            count: 26, minSpeed: 120, maxSpeed: 330, gravity: 380
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(g.x, g.y, { colors: ['#ffffff', '#e8e8e8', '#cccccc'], count: 26 });
        }
        this.sounds.smash();
        const idx = this.ohsGhosts.indexOf(g);
        if (idx >= 0) this.ohsGhosts.splice(idx, 1);
        g.destroy();
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    },

    enterOhsWorld() {
        const projects = this.ohsProjects.map(p => ({
            key: p.key, label: p.label,
            url: `https://${p.key}.bruno-rodriguez-mendez.com`,
            path: `assets/subdomains/${p.key}.png`
        }));
        this._loadSubWorldAssets(projects, () => {
            this._enterSubWorld('ohs', {
                projects,
                bg: '#33343a', // dark cement
                toast: 'Welcome to OHS!\nChop a project to open it — hit the EXIT sign to leave.'
            });
        });
    },

    enterBrownWorld() {
        this._loadSubWorldAssets(this.brownProjects, () => {
            this._enterSubWorld('brown', {
                projects: this.brownProjects,
                bg: '#4e3629', // Brown University brown
                toast: 'Welcome to BROWN!\nChop a project to open it — hit the EXIT sign to leave.'
            });
        });
    },

    // Shared in-place world swap used by the OHS + Brown sub-worlds. (The
    // `inOhs` flag and the `ohs*` collections mean "current sub-world" now.)
    _enterSubWorld(id, { projects, bg, toast }) {
        if (this.inOhs) return;
        this.inOhs = true;
        this.subWorldId = id;
        this.ohsChops = 0;
        this.brownChops = 0;
        this.resetHeldInput();

        this._setMainWorldActive(false);
        this.cameras.main.setBackgroundColor(bg);
        if (this.doomView) this.doomView.setFloorColor && this.doomView.setFloorColor(bg);

        const worldW = 2000, worldH = 2000;
        this.player.setPosition(300, worldH / 2);
        this.player.setVelocity(0, 0);
        this._navDirty = true; // different obstacles in here — zombies re-path

        // Layout: up to 3 projects sit in one centered row; more (OHS's 6)
        // fall into the 2-column x 3-row grid.
        const spots = projects.length <= 3
            ? projects.map((p, i) => ({ x: 500 + i * 500, y: 1000 }))
            : projects.map((p, i) => ({ x: [760, 1240][i % 2], y: [560, 1000, 1440][Math.floor(i / 2)] }));
        projects.forEach((p, i) => {
            const { x: cx, y: cy } = spots[i];
            const spr = this.physics.add.staticImage(cx, cy, p.key).setScale(0.12).refreshBody();
            spr.pageUrl = p.url;
            spr.newTab = !!p.newTab;
            spr.chops = 0;
            this.ohsProjectSprites.push(spr);

            const label = this.add.text(cx, cy - 108, p.label, {
                fontFamily: 'monospace', fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(20);
            this.miniMap.ignore(label);
            this.ohsLabels.push(label);

            this.ohsColliders.push(this.physics.add.collider(this.player, spr));
            this.ohsColliders.push(this.physics.add.collider(this.zombieGroup, spr));
            this.ohsColliders.push(this.physics.add.overlap(this.axe, spr, this.hitProject, null, this));
        });

        // Exit sign, bottom-right.
        this.ohsExitSign = this.physics.add.staticImage(worldW - 260, worldH - 260, 'exit-sign').setScale(4).refreshBody();
        this.ohsColliders.push(this.physics.add.overlap(this.axe, this.ohsExitSign, this.hitExitSign, null, this));

        // The orb lives specifically in OHS (bottom-left corner), not Brown or
        // the main world — it's created once in create() at this exact spot
        // and just shown/hidden here rather than moved.
        const orbHere = id === 'ohs';
        this.orb.setVisible(orbHere);
        if (this.orb.body) this.orb.body.enable = orbHere;

        // A few roaming (non-carrying) ghosts.
        for (let i = 0; i < 5; i++) {
            const gx = Phaser.Math.Between(220, worldW - 220);
            const gy = Phaser.Math.Between(220, worldH - 220);
            const g = this.physics.add.sprite(gx, gy, 'ghost').setScale(3);
            g.setCollideWorldBounds(true);
            g.play('ghost_float');
            g._dir = null; g._moveTimer = 0; g._idle = false; g._idleTimer = 0;
            this._ghostPickDir(g);
            this.ohsGhosts.push(g);
            this.ohsColliders.push(this.physics.add.overlap(this.axe, g, this.hitOhsGhost, null, this));
        }

        this.showToast(toast, 4000);
    },

    exitOhsWorld() {
        if (!this.inOhs) return;
        const cameFrom = this.subWorldId;
        this.inOhs = false;
        this.subWorldId = null;
        this.resetHeldInput();

        this.ohsColliders.forEach(c => c && c.destroy && c.destroy());
        this.ohsColliders = [];
        this.ohsProjectSprites.forEach(s => s.destroy());
        this.ohsProjectSprites = [];
        this.ohsLabels.forEach(l => l.destroy());
        this.ohsLabels = [];
        this.ohsGhosts.forEach(g => g.destroy());
        this.ohsGhosts = [];
        if (this.ohsExitSign) { this.ohsExitSign.destroy(); this.ohsExitSign = null; }
        this.orb.setVisible(false);
        if (this.orb.body) this.orb.body.enable = false;

        this.cameras.main.setBackgroundColor(this._mainBgColor());
        if (this.doomView) this.doomView.setFloorColor && this.doomView.setFloorColor(null);
        this._setMainWorldActive(true);
        this.ohsChops = 0;
        this.brownChops = 0;
        this._navDirty = true; // back to the main world's obstacles

        // Drop the player just to the right of whichever school we entered.
        const school = cameFrom === 'brown' ? this.brownSchool : this.ohsSchool;
        this.player.setPosition(school.x + 240, school.y);
        this.player.setVelocity(0, 0);
    },

    // Show/hide + enable/disable every main-world entity when swapping worlds.
    _setMainWorldActive(on) {
        const set = (o) => { if (!o) return; o.setVisible(on); if (o.body) o.body.enable = on; };
        this.trees.getChildren().forEach(set);
        set(this.computer);
        if (this.computerPreview) this.computerPreview.setVisible(on);
        set(this.contributeSign);
        set(this.ohsSchool);
        set(this.brownSchool);
        if (this._bombOverlap) this._bombOverlap.active = on;
        this.bombs.getChildren().forEach(b => {
            // Only re-show bombs that were never triggered (triggered ones stay gone).
            b.setVisible(on && b.active);
            if (b.body) b.body.enable = on && b.active;
        });
        // Half-heart pickups only live in the main world.
        this.heartPickups.getChildren().forEach(h => {
            h.setVisible(on && h.active);
            if (h.body) h.body.enable = on && h.active;
        });
    },

    // Lightweight random wander for OHS ghosts (no DOM preview, unlike GhostEntity).
    _wanderGhost(g, delta) {
        if (!g.active) return;
        g.setDepth(5);
        if (g._idle) {
            g._idleTimer -= delta;
            if (g._idleTimer <= 0) this._ghostPickDir(g);
        } else {
            g._moveTimer -= delta;
            if (g._moveTimer <= 0) { this._ghostPickDir(g); return; }
            const sp = 40;
            if (g._dir === 'left') { g.setVelocity(-sp, 0); g.setFlipX(true); }
            else if (g._dir === 'right') { g.setVelocity(sp, 0); g.setFlipX(false); }
            else if (g._dir === 'up') g.setVelocity(0, -sp);
            else if (g._dir === 'down') g.setVelocity(0, sp);
        }
    },

    _ghostPickDir(g) {
        if (Math.random() < 0.3) {
            g._idle = true; g._idleTimer = Phaser.Math.Between(1000, 3000); g.setVelocity(0, 0);
        } else {
            g._idle = false;
            g._dir = Phaser.Math.RND.pick(['left', 'right', 'up', 'down']);
            g._moveTimer = Phaser.Math.Between(2000, 4000);
        }
    },

    hitGhost(axe, ghostSprite) {
        if (!this.canChop) return;
        this.canChop = false;

        // Find the ghost entity that owns this exact sprite so the right
        // subdomain opens
        const ghost = this.ghosts.find(g => g.sprite === ghostSprite);
        if (!ghost) {
            this.canChop = true;
            return;
        }
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y); // doesn't break -> rainbow sparkle
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'], count: 16, wz: 40 });

        this.tweens.add({
            targets: ghostSprite,
            x: { value: ghostSprite.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: ghostSprite.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                ghost.chops++;
                if (ghost.chops >= this._entityChopsNeeded()) {
                    this.sounds.smash();
                    this.openSubPage(`https://${ghost.subdomain}.bruno-rodriguez-mendez.com`, ghost);
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    },
};
