// The Cowboy: opt-in ranged duelist who keeps his distance and snipes.
// Merged onto MainScene.prototype.
export default {
    // ===== The Cowboy =====
    // Opt-in duel via the "cowboy?" HUD button. He rides in from the EAST
    // (right side of the world) and plays it like a gunslinger: he KEEPS his
    // distance, backing off if the player closes in, and snipes from afar at
    // any angle. His art faces right by default, so we flip him to always look
    // toward the player. He paths around trees, but walks straight over hidden
    // bombs — and pays for it.

    setCowboyEnabled(on) {
        this.cowboyEnabled = on;
        document.body.classList.toggle('cowboy-on', on);
        if (this._updateModesUI) this._updateModesUI();
        if (on) {
            this.showToast(this.t('toastCowboyRideIn'), 2600);
            if (!this.cowboy) this._spawnCowboy();
        } else {
            if (this._cowboyRespawn) { this._cowboyRespawn.remove(); this._cowboyRespawn = null; }
            this._despawnCowboy();
            this.bulletGroup.clear(true, true);
        }
    },

    _despawnCowboy() {
        if (this._cowboyColliders) {
            this._cowboyColliders.forEach(c => c && c.destroy && c.destroy());
            this._cowboyColliders = null;
        }
        if (this.cowboy) { this.cowboy.destroy(); this.cowboy = null; }
    },

    _spawnCowboy() {
        if (this.cowboy) return;
        const x = 1880;   // rides in from the EAST — the right side of the world
        const y = Phaser.Math.Clamp(this.player.y, 120, 1880);
        const c = this.physics.add.sprite(x, y, 'cowboy', 0).setScale(3);
        c.setFlipX(true);  // spawns east of the player, so he looks west toward them
        c.setCollideWorldBounds(true);
        c.setDepth(5);
        c._hp = this.COWBOY_HP;
        c._path = null;
        c._nextRepath = 0;
        c._nextShot = this.time.now + 2500;
        c._shootingUntil = 0;
        this.cowboy = c;
        this._cowboyColliders = [
            this.physics.add.collider(c, this.trees),
            this.physics.add.collider(c, this.plankGroup),
            this.physics.add.collider(c, this.computer),
            this.physics.add.collider(c, this.orb),
            this.physics.add.collider(c, this.contributeSign),
            this.physics.add.collider(c, this.ohsSchool),
            this.physics.add.collider(c, this.brownSchool),
            this.physics.add.overlap(this.axe, c, this._axeHitsCowboy, null, this),
            // Cowboy `c` is a single sprite, slashGroup/axeGunGroup are Groups —
            // Phaser's arcade overlap always calls back with the single object
            // FIRST regardless of the order passed here, so `c` must be passed
            // first or these handlers receive (cowboy, projectile) swapped and
            // end up destroying the cowboy sprite directly (see _slashHitsCowboy
            // / _axeGunHitsCowboy below). Matches the player/bulletGroup pattern.
            this.physics.add.overlap(c, this.slashGroup, this._slashHitsCowboy, null, this),
            this.physics.add.overlap(c, this.axeGunGroup, this._axeGunHitsCowboy, null, this),
            this.physics.add.overlap(c, this.bombs, this._cowboyTripsBomb, null, this),
        ];
        this._pixelBurst(x, y, {
            colors: [0xc9a24a, 0x8b5a2b, 0xe0e0e0],
            count: 18, minSpeed: 70, maxSpeed: 220, gravity: 420
        });
    },

    // Per-frame cowboy brain + bullet housekeeping (runs in 2D and DOOM).
    _updateCowboy() {
        const now = this.time.now;

        // Bullet trails: a flurry of orange pixels streaming off each bullet.
        this.bulletGroup.getChildren().forEach(b => {
            if (!b.active) return;
            if (now > (b._dieAt || 0)) { this._popBullet(b); return; }
            if (now - (b._lastTrail || 0) > 30) {
                b._lastTrail = now;
                for (let i = 0; i < 2; i++) {
                    const p = this.add.image(
                        b.x - 10 + Phaser.Math.Between(-6, 2),
                        b.y + Phaser.Math.Between(-5, 5),
                        'fxSpark'
                    ).setTint(Phaser.Utils.Array.GetRandom([0xff9500, 0xffb340, 0xff6a00, 0xffe500]))
                     .setScale(1.4 + Math.random() * 1.4)
                     .setDepth(5);
                    if (this.miniMap) this.miniMap.ignore(p);
                    this.tweens.add({ targets: p, alpha: 0, scale: 0.3, duration: 300, onComplete: () => p.destroy() });
                }
            }
        });

        const c = this.cowboy;
        if (!c || !c.active) return;

        // A dash-shield knockback (or anything else that sets _stunUntil)
        // owns his velocity while it bleeds off — same pattern as zombies.
        if (now < (c._stunUntil || 0)) {
            c.setVelocity(c.body.velocity.x * 0.9, c.body.velocity.y * 0.9);
            return;
        }

        const dxp = this.player.x - c.x, dyp = this.player.y - c.y;
        const distToPlayer = Math.hypot(dxp, dyp);
        // Always look toward the player (art faces right → flip when they're west).
        c.setFlipX(dxp < 0);

        // Mid quick-draw: stand still and look menacing.
        if (now < c._shootingUntil) {
            c.setVelocity(0, 0);
            c.anims.play('cowboy-shoot', true);
            return;
        }

        // Gunslinger spacing: hold a standoff of STAND px, retreating along his
        // own bearing from the player if they crowd him (he never charges in).
        const STAND = 430;
        let tx, ty;
        if (distToPlayer < 1) { tx = c.x + 1; ty = c.y; }
        else {
            const ux = -dxp / distToPlayer, uy = -dyp / distToPlayer; // player → cowboy
            tx = Phaser.Math.Clamp(this.player.x + ux * STAND, 80, 1920);
            ty = Phaser.Math.Clamp(this.player.y + uy * STAND, 80, 1920);
        }
        const dist = Phaser.Math.Distance.Between(c.x, c.y, tx, ty);
        if (dist > 60) {
            if (this._navDirty) this._buildNavGrid();
            if (now >= c._nextRepath) {
                c._path = this._findPath(c.x, c.y, tx, ty);
                c._nextRepath = now + 500 + Math.random() * 250;
            }
            let wx = tx, wy = ty;
            if (c._path && c._path.length) {
                while (c._path.length && Phaser.Math.Distance.Between(c.x, c.y, c._path[0].x, c._path[0].y) < 30) {
                    c._path.shift();
                }
                if (c._path.length) { wx = c._path[0].x; wy = c._path[0].y; }
            }
            const ang = Math.atan2(wy - c.y, wx - c.x);
            // Backpedal faster than he closes so the player can't corner him.
            const sp = distToPlayer < STAND - 40 ? 175 : 130;
            c.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
            c.anims.play('cowboy-walk', true);
        } else {
            c.setVelocity(0, 0);
            c.anims.play('cowboy-idle', true);
        }

        // Snipe from afar: fire whenever he's reloaded and the player is in range,
        // at any angle (the shot itself aims straight at the player).
        if (now >= c._nextShot && distToPlayer < 900) {
            this._cowboyShoot();
            c._nextShot = now + 1900 + Math.random() * 1600;
        }
    },

    _cowboyShoot() {
        const c = this.cowboy;
        if (!c || !c.active) return;
        c._shootingUntil = this.time.now + 420;
        // Aim straight at the player, wherever they are.
        const dx = this.player.x - c.x, dy = this.player.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        c.setFlipX(dx < 0);
        c.anims.play('cowboy-shoot', true);
        this.sounds.whoosh();
        const mx = c.x + ux * 34, my = c.y + uy * 34 + 4;
        const b = this.bulletGroup.create(mx, my, 'fxBullet');
        b.setDepth(6);
        b.body.setAllowGravity(false);
        b.setVelocity(ux * 760, uy * 760);
        b.setRotation(Math.atan2(uy, ux));
        b._dieAt = this.time.now + 2200;
        if (this.miniMap) this.miniMap.ignore(b);
        // Muzzle flash.
        this._pixelBurst(mx, my, {
            colors: [0xffe500, 0xff9500, 0xffffff],
            count: 8, minSpeed: 60, maxSpeed: 180, gravity: 200
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(mx, my, { colors: ['#ffe500', '#ff9500'], count: 8 });
        }
    },

    // Phaser always calls overlap callbacks with the single game object
    // first and the group member second, regardless of the order they're
    // passed to physics.add.overlap() — so `player` comes first here.
    _bulletHitsPlayer(player, b) {
        if (!b.active) return;
        this._popBullet(b);
        if (this.time.now < this._invincibleUntil) return;
        this.sounds.smash();
        this.damage(0.5);
        this.cameras.main.shake(120, 0.008);
        this._pixelBurst(this.player.x, this.player.y, {
            colors: [0xff2b2b, 0xff9500, 0xff5555],
            count: 12, minSpeed: 80, maxSpeed: 220, gravity: 380
        });
    },

    _popBullet(b) {
        if (!b.active) return;
        const bx = b.x, by = b.y;
        b.destroy();
        this._pixelBurst(bx, by, {
            colors: [0xff9500, 0xffb340, 0xffe500],
            count: 6, minSpeed: 50, maxSpeed: 160, gravity: 300
        });
    },

    _axeHitsCowboy(axe, c) {
        if (!this.canChop || !c.active) return;
        this.canChop = false;
        this.sounds.chop();
        this._damageCowboy(2);
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    },

    _slashHitsCowboy(c, s) {
        if (!s.active || !c.active) return;
        this._popSlash(s);
        this._damageCowboy(1);
    },

    // He walks right over hidden bombs — and they hurt him badly.
    _cowboyTripsBomb(c, bomb) {
        if (!c.active || !bomb.active) return;
        bomb.disableBody(true, true);
        this.sounds.smash();
        const explosion = this.add.sprite(bomb.x, bomb.y, 'explosive').setScale(3).setDepth(16000);
        explosion.play('explode');
        explosion.on('animationcomplete', () => explosion.destroy());
        if (this.miniMap) this.miniMap.ignore(explosion);
        this._pixelBurst(bomb.x, bomb.y, {
            colors: [0xff2b2b, 0xff9500, 0xffe500, 0xffffff],
            count: 26, minSpeed: 120, maxSpeed: 340, gravity: 500
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(bomb.x, bomb.y, { colors: ['#ff2b2b', '#ff9500', '#ffe500'], count: 26 });
        }
        this._damageCowboy(10);
        this._checkBombRegen();
    },

    _damageCowboy(dmg) {
        const c = this.cowboy;
        if (!c || !c.active) return;
        c._hp -= dmg;
        c.setTintFill(0xffffff);
        this.time.delayedCall(90, () => { if (c.active) c.clearTint(); });
        this._pixelBurst(c.x, c.y, {
            colors: [0xff3b3b, 0xc9a24a, 0x8b5a2b],
            count: 8, minSpeed: 70, maxSpeed: 200, gravity: 420
        });
        if (c._hp <= 0) this._killCowboy();
    },

    _killCowboy() {
        const c = this.cowboy;
        if (!c) return;
        const cx = c.x, cy = c.y;
        this._despawnCowboy();
        this.sounds.smash();
        this.cowboyKills += 1;
        try { localStorage.setItem('cowboyKills', this.cowboyKills); } catch (e) {}
        if (this._cscoreVal) this._cscoreVal.textContent = this.cowboyKills;
        this._pixelBurst(cx, cy, {
            colors: [0xc9a24a, 0x8b5a2b, 0xff3b3b, 0xe0e0e0, 0x2d6b1c],
            count: 30, minSpeed: 110, maxSpeed: 320, gravity: 520
        });
        this.showCutText(cx, cy - 40, 'GOT \'EM!');
        this.doomView.burstAtWorld(cx, cy, { colors: ['#c9a24a', '#8b5a2b', '#ff3b3b', '#e0e0e0'], count: 30, wz: 30 });
        this.doomView.textAtWorld(cx, cy, "GOT 'EM!");
        if (this.cowboyEnabled) {
            this.showToast(this.t('toastCowboyDown'), 3000);
            this._cowboyRespawn = this.time.delayedCall(30000, () => {
                this._cowboyRespawn = null;
                if (this.cowboyEnabled) this._spawnCowboy();
            });
        }
    },
};
