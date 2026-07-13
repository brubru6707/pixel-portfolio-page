// Tool switching (axe / axe-gun / plank), plank placement + zombie-bite/
// axe-chop wear, the ranged nail-slash, and the axe-gun projectiles.
// Merged onto MainScene.prototype.
export default {
    // ===== Tools & planks =====

    setTool(tool) {
        if (this.tool === tool) return;
        this.tool = tool;
        this._updateToolHud();
        const messages = {
            axe: this.t('toastAxeSelected'),
            axegun: this.t('toastGunSelected'),
            plank: this.t('toastPlankSelected'),
        };
        this.showToast(messages[tool] || '', 1600);
    },

    // Reflects the current tool on the 3-way tool row (which chip is lit up)
    // and on the universal action button (its icon + label become FIRE for
    // the axe gun, PLANK for planks, CHOP otherwise).
    _updateToolHud() {
        if (this._axeToolBtn) this._axeToolBtn.classList.toggle('selected', this.tool === 'axe');
        if (this._axeGunToolBtn) this._axeGunToolBtn.classList.toggle('selected', this.tool === 'axegun');
        if (this._plankHud) this._plankHud.classList.toggle('selected', this.tool === 'plank');
        if (this._actionBtn) {
            const label = this._actionBtn.querySelector('.action-label');
            const icon = this._actionBtn.querySelector('.axe-icon, .axegun-icon');
            if (label) label.textContent = this.tool === 'plank' ? this.t('actionPlank') : (this.tool === 'axegun' ? this.t('actionFire') : this.t('actionChop'));
            if (icon) icon.className = this.tool === 'axegun' ? 'axegun-icon' : 'axe-icon';
            this._actionBtn.setAttribute('aria-label', this.tool === 'axegun' ? this.t('actionAriaFire') : this.t('actionAriaChop'));
        }
    },

    // Drop a plank wall just ahead of the player (facing direction in 2D,
    // view direction in DOOM). Zombies path around it — or chew through it.
    _placePlank() {
        if (this.planks <= 0) {
            this.showToast(this.t('toastNoPlanks'), 2200);
            return;
        }
        let dx = 1, dy = 0;
        if (this.is3D) {
            dx = Math.cos(this.doomAngle); dy = Math.sin(this.doomAngle);
        } else {
            const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1], none: [1, 0] };
            [dx, dy] = dirs[this.lastDirection] || dirs.right;
        }
        const px = Phaser.Math.Clamp(this.player.x + dx * 85, 40, 1960);
        const py = Phaser.Math.Clamp(this.player.y + dy * 85, 40, 1960);
        const plank = this.plankGroup.create(px, py, 'plank').setScale(3).refreshBody();
        plank._hp = 5;             // zombie bites it can absorb
        plank._userHp = 3;         // axe chops the player needs to break it back down
        plank.setDepth(4);
        this.planks -= 1;
        if (this._plankVal) this._plankVal.textContent = this.planks;
        this._navDirty = true;     // zombies + the cowboy re-path around it
        this.sounds.chop();
        this._pixelBurst(px, py, {
            colors: [0x8b5a2b, 0xa9772f, 0xc9a24a],
            count: 12, minSpeed: 60, maxSpeed: 180, gravity: 420
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f', '#c9a24a'], count: 12 });
        }
    },

    // A zombie pressed against a plank gnaws it down over time (big zombies
    // chew twice as fast). Five bites and it's splinters.
    _zombieBitesPlank(z, plank) {
        const now = this.time.now;
        if (now < (plank._lastBite || 0) + 600) return;
        plank._lastBite = now;
        plank._hp -= z._big ? 2 : 1;
        this.tweens.add({
            targets: plank,
            x: { value: plank.x + Phaser.Math.Between(-3, 3), duration: 40, yoyo: true, repeat: 2 },
            alpha: { value: 0.55 + (plank._hp / 5) * 0.45, duration: 80 }
        });
        this._pixelBurst(plank.x, plank.y, {
            colors: [0x8b5a2b, 0x6b431d],
            count: 5, minSpeed: 50, maxSpeed: 150, gravity: 420
        });
        if (plank._hp <= 0) {
            const px = plank.x, py = plank.y;
            plank.destroy();
            this._navDirty = true;
            this.sounds.smash();
            this._pixelBurst(px, py, {
                colors: [0x8b5a2b, 0xa9772f, 0xc9a24a, 0x6b431d],
                count: 18, minSpeed: 90, maxSpeed: 260, gravity: 520
            });
            if (this.doomView && this.doomView.active) {
                this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f', '#c9a24a'], count: 18 });
            }
        }
    },

    // Player chops their own plank back down with the axe — takes 3 chops now,
    // each one splinters + fades it a little, unlike the slow multi-bite grind
    // zombies have to do.
    _axeHitsPlank(axe, plank) {
        if (!this.canChop || !plank.active) return;
        this.canChop = false;
        this.sounds.chop();
        const px = plank.x, py = plank.y;

        if (plank._userHp === undefined) plank._userHp = 3;
        plank._userHp -= 1;

        if (plank._userHp > 0) {
            // Not broken yet — shake, fade a step, and spit a small chip burst.
            this.tweens.add({
                targets: plank,
                x: { value: plank.x + Phaser.Math.Between(-4, 4), duration: 45, yoyo: true, repeat: 2 },
                alpha: { value: 0.55 + (plank._userHp / 3) * 0.45, duration: 90 }
            });
            this._pixelBurst(px, py, {
                colors: [0x8b5a2b, 0x6b431d, 0xa9772f],
                count: 6, minSpeed: 60, maxSpeed: 170, gravity: 460
            });
            if (this.doomView && this.doomView.active) {
                this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f'], count: 6 });
            }
            this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
            return;
        }

        plank.destroy();
        this._navDirty = true;
        this.sounds.smash();
        this._pixelBurst(px, py, {
            colors: [0x8b5a2b, 0xa9772f, 0xc9a24a, 0x6b431d],
            count: 18, minSpeed: 90, maxSpeed: 260, gravity: 520
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f', '#c9a24a'], count: 18 });
        }
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    },

    // True if any active plank's rectangle sits on the segment between the
    // two points — used to make enemy ranged attacks (bullets, fire breath)
    // respect plank cover the same way physics collisions already do.
    _lineBlockedByPlank(x1, y1, x2, y2) {
        if (!this.plankGroup) return false;
        const line = new Phaser.Geom.Line(x1, y1, x2, y2);
        for (const p of this.plankGroup.getChildren()) {
            if (p.active && Phaser.Geom.Intersects.LineToRectangle(line, p.getBounds())) return true;
        }
        return false;
    },

    // ===== Ranged slash (Hollow-Knight style) =====

    // Ranged is a FULL-HEALTH-only privilege: fire the slash if the player has
    // every heart, otherwise nudge them with a throttled warning. Melee (the
    // axe body) is unaffected and keeps working while hurt.
    _tryFireSlash(dx, dy) {
        if (this.health >= this.maxHealth) { this._fireSlash(dx, dy); return true; }
        const now = this.time.now;
        if (!this._rangedWarnAt || now - this._rangedWarnAt > 2500) {
            this._rangedWarnAt = now;
            this.showToast(this.t('toastRangedLocked'), 1400);
        }
        return false;
    },

    // Launch a flying slash arc. 1 damage — two of these kill a regular
    // zombie; the axe itself does 2.
    _fireSlash(dx, dy) {
        const s = this.slashGroup.create(this.player.x + dx * 42, this.player.y + dy * 42, 'fxSlash');
        s.setScale(0.55).setDepth(15998).setAlpha(0.95).setTint(0x8ff0ff);
        s.setRotation(Math.atan2(dy, dx));
        s.body.setSize(46, 46, true);
        s.setVelocity(dx * 520, dy * 520);
        if (this.miniMap) this.miniMap.ignore(s);
        // Ranged, not infinite: fizzles out after ~350px of flight.
        this.time.delayedCall(650, () => { if (s.active) this._popSlash(s, true); });
    },

    _slashHitsZombie(s, z) {
        if (!s.active || !z.active) return;
        this._popSlash(s);
        this._damageZombie(z, 1);
    },

    // The slash dissolves — quietly when it just runs out of range, with a
    // little cyan sparkle when it actually hit something.
    _popSlash(s, quiet = false) {
        if (!s.active) return;
        const sx = s.x, sy = s.y;
        s.destroy();
        if (quiet) return;
        this._pixelBurst(sx, sy, {
            colors: [0x8ff0ff, 0xffffff, 0x00c7ff],
            count: 8, minSpeed: 60, maxSpeed: 180, gravity: 260
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(sx, sy, { colors: ['#8ff0ff', '#ffffff', '#00c7ff'], count: 8 });
        }
    },

    // ===== Axe gun (rapid-fire tool) =====

    // Twin-stick aim: 2D mouse/mouse-look angle from the player to the
    // cursor's world position. Touch has no cursor, so it falls back to the
    // player's last walking direction (matches the mobile FIRE button's
    // original "shoot the way you're facing" behavior).
    _axeGunAimAngle() { return this._aimAngle(); },

    // Shared aim angle for every player attack (melee axe swing, ranged slash,
    // axe gun): point at the mouse cursor's world position on desktop, fall
    // back to the last walking direction on touch (no cursor there). In 3D the
    // whole world is aimed via doomAngle, so use that.
    _aimAngle() {
        if (this.is3D) return this.doomAngle;
        if (!this.isTouch()) {
            const p = this.input.activePointer;
            return Math.atan2(p.worldY - this.player.y, p.worldX - this.player.x);
        }
        const dirs = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 };
        return dirs[this.facingDirection] || 0;
    },

    // Throws a small tumbling hatchet in the given (unit) direction. No
    // full-health gate like the slash — this is a distinct ranged tool, kept
    // in check purely by its low per-hit damage + fire-rate cap.
    _fireAxeGun(dx, dy) {
        const a = this.axeGunGroup.create(this.player.x + dx * 30, this.player.y + dy * 30, 'axe', 0);
        a.setScale(1.6).setDepth(15997);
        a.body.setSize(24, 24, true);
        a.setVelocity(dx * 780, dy * 780);
        if (this.miniMap) this.miniMap.ignore(a);
        // Tumbles end-over-end like a thrown hatchet instead of staying aimed.
        this.tweens.add({ targets: a, angle: '+=900', duration: 500, repeat: -1 });
        // Ranged, not infinite: fizzles out after ~390px of flight.
        this.time.delayedCall(500, () => { if (a.active) this._popAxeGun(a, true); });
    },

    _axeGunHitsZombie(a, z) {
        if (!a.active || !z.active) return;
        this._popAxeGun(a);
        this._damageZombie(z, this.AXEGUN_DAMAGE);
    },

    _axeGunHitsCowboy(c, a) {
        if (!a.active || !c.active) return;
        this._popAxeGun(a);
        this._damageCowboy(this.AXEGUN_DAMAGE);
    },

    // The little axe splinters — quietly when it just runs out of range, with
    // a small wood-and-glow sparkle when it actually hit something.
    _popAxeGun(a, quiet = false) {
        if (!a.active) return;
        const ax = a.x, ay = a.y;
        a.destroy();
        if (quiet) return;
        this._pixelBurst(ax, ay, {
            colors: [0xc6ff33, 0xffffff, 0x8b5a2b],
            count: 6, minSpeed: 50, maxSpeed: 160, gravity: 260
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(ax, ay, { colors: ['#c6ff33', '#ffffff', '#8b5a2b'], count: 6 });
        }
    },
};
