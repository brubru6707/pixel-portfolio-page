// The Cowgirl (on her pig): opt-in airborne contact attacker with a wide,
// slow turn radius and a lasso-on-hit effect. Merged onto MainScene.prototype.
export default {
    // ===== The Cowgirl (on her pig) =====
    // Opt-in via the "cowgirl?" HUD button, right next to the cowboy toggle.
    // Unlike the cowboy's ranged standoff, she's a pure airborne contact
    // attacker: always flying straight at the player, never stopping, and
    // NOT bound by the world edges (setCollideWorldBounds is left off on
    // purpose). Her turn rate is capped low, so overshooting the player
    // means a wide swooping arc to come back around instead of snapping
    // onto them — that's the whole "hard to rotate" feel. On contact she
    // deals a heart of damage, knocks the player back, and lassoes them.

    setCowgirlEnabled(on) {
        this.cowgirlEnabled = on;
        document.body.classList.toggle('cowgirl-on', on);
        if (this._updateModesUI) this._updateModesUI();
        if (on) {
            this.showToast(this.t('toastCowgirlRideIn'), 2600);
            if (!this.cowgirl) this._spawnCowgirl();
        } else {
            if (this._cowgirlRespawn) { this._cowgirlRespawn.remove(); this._cowgirlRespawn = null; }
            this._despawnCowgirl();
        }
    },

    _despawnCowgirl() {
        if (this._cowgirlColliders) {
            this._cowgirlColliders.forEach(c => c && c.destroy && c.destroy());
            this._cowgirlColliders = null;
        }
        if (this.cowgirl) { this.cowgirl.destroy(); this.cowgirl = null; }
    },

    _spawnCowgirl() {
        if (this.cowgirl) return;
        // Ride in from a random bearing, well outside the player's view.
        const ang = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(ang) * 700;
        const y = this.player.y + Math.sin(ang) * 700;
        const g = this.physics.add.sprite(x, y, 'cowgirl', 0).setScale(0.6);
        // No setCollideWorldBounds() — she's free to swoop outside the
        // 2000x2000 world while she works her wide turns back around.
        g.setDepth(5);
        g._hp = this.COWGIRL_HP;
        g._heading = Math.atan2(this.player.y - y, this.player.x - x);
        g._stunUntil = 0;
        g.anims.play('cowgirl-fly');
        this.cowgirl = g;
        this._cowgirlColliders = [
            this.physics.add.overlap(this.axe, g, this._axeHitsCowgirl, null, this),
            // Same single-object-first rule as the cowboy: `g` must come
            // first when paired with a Group or the callback args swap and
            // _popSlash/_popAxeGun end up destroying her sprite directly.
            this.physics.add.overlap(g, this.slashGroup, this._slashHitsCowgirl, null, this),
            this.physics.add.overlap(g, this.axeGunGroup, this._axeGunHitsCowgirl, null, this),
            this.physics.add.overlap(this.player, g, this._cowgirlTouchPlayer, null, this),
        ];
        this._pixelBurst(x, y, {
            colors: [0xffb6c1, 0xff69b4, 0x8b5a2b],
            count: 18, minSpeed: 70, maxSpeed: 220, gravity: 0
        });
    },

    // Per-frame cowgirl steering (runs in 2D and DOOM). Pure pursuit with a
    // hard cap on turn rate — that's what produces the wide, slow arcs.
    _updateCowgirl() {
        const g = this.cowgirl;
        if (!g || !g.active) return;
        const now = this.time.now;
        const dt = this.game.loop.delta / 1000;

        // A dash-shield knockback (or Zenith axe) owns her velocity while it
        // bleeds off — same pattern as zombies/the cowboy.
        if (now < (g._stunUntil || 0)) {
            g.setVelocity(g.body.velocity.x * 0.9, g.body.velocity.y * 0.9);
            return;
        }

        const desired = Math.atan2(this.player.y - g.y, this.player.x - g.x);
        let diff = Phaser.Math.Angle.Wrap(desired - g._heading);
        const maxTurn = this.COWGIRL_TURN_RATE * dt;
        diff = Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
        g._heading = Phaser.Math.Angle.Wrap(g._heading + diff);

        g.setVelocity(Math.cos(g._heading) * this.COWGIRL_SPEED, Math.sin(g._heading) * this.COWGIRL_SPEED);
        // Always look AT the player, no matter which way she's actually flying —
        // she watches him the whole time (flip on the side he's standing on).
        g.setFlipX(this.player.x < g.x);
        // Subtle bank into the turn — the sprite itself stays upright
        // (rotating a side-view rider+pig sheet 90°+ would look broken).
        g.setAngle(Phaser.Math.Clamp(Phaser.Math.RadToDeg(diff) * -4, -15, 15));
    },

    _axeHitsCowgirl(axe, g) {
        if (!this.canChop || !g.active) return;
        this.canChop = false;
        this.sounds.chop();
        this._damageCowgirl(2);
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    },

    _slashHitsCowgirl(g, s) {
        if (!s.active || !g.active) return;
        this._popSlash(s);
        this._damageCowgirl(1);
    },

    _axeGunHitsCowgirl(g, a) {
        if (!a.active || !g.active) return;
        this._popAxeGun(a);
        this._damageCowgirl(this.AXEGUN_DAMAGE);
    },

    // Player/single object first — see the comment on _spawnCowgirl's
    // colliders. Contact damage, knockback, and a 3s lasso.
    _cowgirlTouchPlayer(player, g) {
        const now = this.time.now;
        if (now < this._cowgirlDmgUntil || now < (g._stunUntil || 0)) return;
        if (now < this._invincibleUntil) return; // Zenith: untouchable
        this._cowgirlDmgUntil = now + 1800;
        g._stunUntil = now + 900; // she peels off after landing the hit
        g.setVelocity(0, 0);
        this.sounds.smash();
        this.damage(1);
        this.cameras.main.shake(180, 0.012);
        this._pixelBurst(player.x, player.y, {
            colors: [0xffb6c1, 0xff69b4, 0x8b5a2b, 0xffffff],
            count: 20, minSpeed: 90, maxSpeed: 260, gravity: 380
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(player.x, player.y, { colors: ['#ffb6c1', '#ff69b4', '#8b5a2b'], count: 16 });
        }
        const ang = Math.atan2(player.y - g.y, player.x - g.x);
        player.setVelocity(Math.cos(ang) * 900, Math.sin(ang) * 900);
        this._knockbackUntil = now + 500;
        this._lassoedUntil = now + 3000;
        this.showToast(this.t('toastLassoed'), 1600);
    },

    // Three thick, dark rope lines cinched horizontally across the middle of
    // the player while lassoed — drawn fresh every frame so they track exactly.
    _updateLasso() {
        if (!this._lassoGfx) {
            this._lassoGfx = this.add.graphics().setDepth(16001);
            if (this.miniMap) this.miniMap.ignore(this._lassoGfx);
        }
        this._lassoGfx.clear();
        if (this.time.now >= this._lassoedUntil) return;
        const px = this.player.x, py = this.player.y;
        const w = 30;                 // half-width of each rope line
        const gap = 9;                // vertical spacing between the three lines
        // Thick rope, drawn as three tight horizontal bands centred on the body.
        for (const oy of [-gap, 0, gap]) {
            this._lassoGfx.lineStyle(7, 0x3a2410, 1);   // dark rope core
            this._lassoGfx.beginPath();
            this._lassoGfx.moveTo(px - w, py + oy);
            this._lassoGfx.lineTo(px + w, py + oy);
            this._lassoGfx.strokePath();
            this._lassoGfx.lineStyle(3, 0x6b431d, 1);   // lighter braid highlight
            this._lassoGfx.beginPath();
            this._lassoGfx.moveTo(px - w, py + oy);
            this._lassoGfx.lineTo(px + w, py + oy);
            this._lassoGfx.strokePath();
        }
    },

    _damageCowgirl(dmg) {
        const g = this.cowgirl;
        if (!g || !g.active) return;
        g._hp -= dmg;
        g.setTintFill(0xffffff);
        this.time.delayedCall(90, () => { if (g.active) g.clearTint(); });
        this._pixelBurst(g.x, g.y, {
            colors: [0xff3b3b, 0xffb6c1, 0x8b5a2b],
            count: 8, minSpeed: 70, maxSpeed: 200, gravity: 0
        });
        if (g._hp <= 0) this._killCowgirl();
    },

    _killCowgirl() {
        const g = this.cowgirl;
        if (!g) return;
        const gx = g.x, gy = g.y;
        this._despawnCowgirl();
        this.sounds.smash();
        this.cowgirlKills += 1;
        try { localStorage.setItem('cowgirlKills', this.cowgirlKills); } catch (e) {}
        if (this._gscoreVal) this._gscoreVal.textContent = this.cowgirlKills;
        this._pixelBurst(gx, gy, {
            colors: [0xffb6c1, 0xff69b4, 0x8b5a2b, 0xe0e0e0, 0xff3b3b],
            count: 30, minSpeed: 110, maxSpeed: 320, gravity: 0
        });
        this.showCutText(gx, gy - 40, 'YEEHAW\'D!');
        this.doomView.burstAtWorld(gx, gy, { colors: ['#ffb6c1', '#ff69b4', '#8b5a2b', '#e0e0e0'], count: 30, wz: 30 });
        this.doomView.textAtWorld(gx, gy, "YEEHAW'D!");
        if (this.cowgirlEnabled) {
            this.showToast(this.t('toastCowgirlDown'), 3000);
            this._cowgirlRespawn = this.time.delayedCall(30000, () => {
                this._cowgirlRespawn = null;
                if (this.cowgirlEnabled) this._spawnCowgirl();
            });
        }
    },
};
