// Zenith frenzy: every 5 zombie kills, 3s of Terraria-Zenith flying axes,
// double speed, gold trail, rainbow flurries, invincibility. Merged onto
// MainScene.prototype.
export default {
    // ===== Zenith frenzy (every 5 zombie kills) =====

    // 3 seconds of Terraria-Zenith madness: spinning axes dart at everything
    // nearby, the player doubles in speed with a golden wake, and nothing can
    // hurt them until it ends.
    _startZenith() {
        const now = this.time.now;
        this._zenithUntil = now + 3000;
        this._invincibleUntil = now + 3000;
        this.showToast('Z E N I T H !!', 1800);
        this.cameras.main.flash(220, 255, 215, 0);
        if (this._zenithEvent) this._zenithEvent.remove();
        this._zenithEvent = this.time.addEvent({
            delay: 130,
            repeat: 21,   // ~3s worth of axes
            callback: () => this._spawnZenithAxe()
        });
    },

    // One spinning axe darting from the player to a nearby zombie (or a random
    // point), wrapped in a rainbow flurry, killing what it lands on.
    _spawnZenithAxe() {
        const now = this.time.now;
        if (now > this._zenithUntil) return;
        let tx, ty, targetZ = null;
        const near = this.zombies.filter(z => z.active && Phaser.Math.Distance.Between(z.x, z.y, this.player.x, this.player.y) < 520);
        if (near.length && Math.random() < 0.8) {
            targetZ = Phaser.Utils.Array.GetRandom(near);
            tx = targetZ.x; ty = targetZ.y;
        } else {
            const a = Math.random() * Math.PI * 2;
            const d = 130 + Math.random() * 220;
            tx = this.player.x + Math.cos(a) * d;
            ty = this.player.y + Math.sin(a) * d;
        }
        const axe = this.add.image(this.player.x, this.player.y, 'axe', 0)
            .setScale(4.5).setDepth(15900);
        if (this.miniMap) this.miniMap.ignore(axe);
        this._zenithAxes.push(axe);
        const rainbow = [0xff2d55, 0xff9500, 0xffe500, 0x34d158, 0x00c7ff, 0x5e5ce6, 0xff2dd4];
        let lastFx = 0;
        this.tweens.add({
            targets: axe,
            x: tx, y: ty,
            rotation: Math.PI * 3 * (Math.random() < 0.5 ? 1 : -1),
            duration: 240,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                // Rainbow flurry streaming off the axe as it flies.
                const t = performance.now();
                if (t - lastFx < 28) return;
                lastFx = t;
                const p = this.add.image(axe.x, axe.y, 'fxSpark')
                    .setTint(Phaser.Utils.Array.GetRandom(rainbow))
                    .setScale(1.6 + Math.random() * 1.8)
                    .setDepth(15899);
                if (this.miniMap) this.miniMap.ignore(p);
                this.tweens.add({ targets: p, alpha: 0, scale: 0.3, duration: 380, onComplete: () => p.destroy() });
            },
            onComplete: () => {
                // Smash whatever is standing at the landing spot.
                for (const z of this.zombies.slice()) {
                    if (z.active && Phaser.Math.Distance.Between(z.x, z.y, axe.x, axe.y) < 80) {
                        this._damageZombie(z, 2);
                    }
                }
                if (this.cowboy && this.cowboy.active
                    && Phaser.Math.Distance.Between(this.cowboy.x, this.cowboy.y, axe.x, axe.y) < 80) {
                    this._damageCowboy(2);
                }
                if (this.cowgirl && this.cowgirl.active
                    && Phaser.Math.Distance.Between(this.cowgirl.x, this.cowgirl.y, axe.x, axe.y) < 80) {
                    this._damageCowgirl(2);
                }
                this._pixelBurst(axe.x, axe.y, {
                    colors: rainbow, count: 12, minSpeed: 80, maxSpeed: 240, gravity: 300
                });
                if (this.doomView && this.doomView.active) {
                    this.doomView.burstAtWorld(axe.x, axe.y, { colors: ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'], count: 12 });
                }
                const idx = this._zenithAxes.indexOf(axe);
                if (idx >= 0) this._zenithAxes.splice(idx, 1);
                this.tweens.add({ targets: axe, alpha: 0, scale: 1, duration: 140, onComplete: () => axe.destroy() });
            }
        });
    },

    // Per-frame Zenith upkeep: golden flicker on the player + the gold wake
    // trailing behind them while they move. Runs in 2D and DOOM.
    _updateZenith() {
        const now = this.time.now;
        if (now >= this._zenithUntil) {
            if (this._zenithTinted) { this._zenithTinted = false; this.player.clearTint(); }
            return;
        }
        this._zenithTinted = true;
        this.player.setTint((Math.floor(now / 90) % 2) ? 0xffd700 : 0xfff1a8);
        const speed = this.player.body ? Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y) : 0;
        if (speed > 40 && now - this._lastGoldTrail > 35) {
            this._lastGoldTrail = now;
            for (let i = 0; i < 2; i++) {
                const p = this.add.image(
                    this.player.x + Phaser.Math.Between(-14, 14),
                    this.player.y + Phaser.Math.Between(-4, 18),
                    'fxSpark'
                ).setTint(Phaser.Utils.Array.GetRandom([0xffd700, 0xffc400, 0xfff1a8]))
                 .setScale(2 + Math.random() * 1.6)
                 .setDepth(4)
                 .setAlpha(0.95);
                if (this.miniMap) this.miniMap.ignore(p);
                this.tweens.add({ targets: p, alpha: 0, scale: 0.4, duration: 480, onComplete: () => p.destroy() });
            }
            if (this.doomView && this.doomView.active && now - (this._lastGoldDoom || 0) > 150) {
                this._lastGoldDoom = now;
                this.doomView.burstAtWorld(this.player.x, this.player.y, { colors: ['#ffd700', '#ffc400', '#fff1a8'], count: 6, wz: 10 });
            }
        }
    },
};
