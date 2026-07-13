// Dash mechanic (double-tap-a-held-direction burst) + its shield/knockback.
// Merged onto MainScene.prototype (see MainScene.js).
export default {
    // ===== Dash =====
    // Double-tap whichever movement key you're already on (WASD or arrows,
    // either scheme, mixed freely) to burst a few blocks that way. Works in
    // both top-down and DOOM mode; 1s cooldown from the moment it fires.

    // Watches all 8 movement keys for a same-direction double-press within
    // DASH_WINDOW ms and kicks off a dash if the cooldown's clear.
    _pollDashInput() {
        const now = this.time.now;
        const check = (justDown, dir) => {
            if (!justDown) return;
            // Roped up by the cowgirl's lasso: dashing is off the table.
            if (now - (this._dashKeyDownAt[dir] || 0) <= this.DASH_WINDOW && now >= this._dashCooldownUntil
                && now >= this._lassoedUntil) {
                this._startDash(dir);
            }
            this._dashKeyDownAt[dir] = now;
        };
        check(Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A), 'left');
        check(Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D), 'right');
        check(Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W), 'up');
        check(Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S), 'down');
    },

    _startDash(dir) {
        const now = this.time.now;
        this._dashDir = dir;
        this._dashUntil = now + this.DASH_DURATION;
        this._dashCooldownUntil = now + this.DASH_COOLDOWN;
        this._dashTrailAt = 0;
        this._dashHitSet = new Set(); // enemies already shield-knocked this dash
        if (!this.is3D) { this.lastDirection = dir; this.facingDirection = dir; }
        this.sounds.dash();
        this.cameras.main.shake(60, 0.003);
        this._pixelBurst(this.player.x, this.player.y, {
            colors: [0xc6ff33, 0xffffff, 0x8fd424],
            count: 14, minSpeed: 40, maxSpeed: 160, gravity: 0, life: 260
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(this.player.x, this.player.y, { colors: ['#c6ff33', '#ffffff'], count: 10 });
        }
    },

    // {vx, vy, angle} while a dash is active, else null. In DOOM mode the
    // dash rides the facing angle (up=forward, down=backward, left/right=
    // strafe) instead of fixed screen axes, since that's what those keys
    // actually do there. `angle` drives the dash shield's facing (below).
    _dashVelocity() {
        if (this.time.now >= this._dashUntil) return null;
        let angle;
        if (this.is3D) {
            const offset = { up: 0, down: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[this._dashDir] || 0;
            angle = this.doomAngle + offset;
        } else {
            angle = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[this._dashDir] ?? 0;
        }
        return { vx: Math.cos(angle) * this.DASH_SPEED, vy: Math.sin(angle) * this.DASH_SPEED, angle };
    },

    // Ghostly copy of the player left behind every ~40ms of a dash — cheap
    // motion-trail juice using a tweened image sprite (Phaser particles don't
    // render in this scene, see the burst helpers elsewhere).
    _spawnDashAfterimage() {
        try {
            const p = this.player;
            const img = this.add.image(p.x, p.y, p.texture.key, p.frame.name)
                .setScale(p.scaleX, p.scaleY)
                .setFlipX(p.flipX)
                .setAlpha(0.45)
                .setTint(0xc6ff33)
                .setDepth(p.depth - 1)
                .setBlendMode(Phaser.BlendModes.ADD);
            if (this.miniMap) this.miniMap.ignore(img);
            this.tweens.add({ targets: img, alpha: 0, duration: 220, onComplete: () => img.destroy() });
        } catch (e) {
            console.error('dash afterimage failed (non-fatal):', e);
        }
    },

    // Rides in front of the player for as long as the dash lasts: keeps the
    // shield sprite glued to the dash direction, and knocks back (once each)
    // any zombie/cowboy caught in the cone ahead. Called every frame the dash
    // owns velocity, in both top-down and DOOM movement.
    _updateDashShield(angle) {
        // Defensive: this runs every frame of every dash, so any exception in
        // here (bad enemy state, a destroyed sprite slipping through, etc.)
        // would otherwise abort the rest of that frame's update() BEFORE
        // rendering ever runs — which reads as the whole game freezing, since
        // it recurs every subsequent frame too. Fail loud in the console, but
        // never let this block movement or rendering from continuing.
        try {
            const sx = this.player.x + Math.cos(angle) * 34;
            const sy = this.player.y + Math.sin(angle) * 34;
            if (!this._dashShield) {
                this._dashShield = this.add.image(sx, sy, 'fxShield')
                    .setDepth(16000).setBlendMode(Phaser.BlendModes.ADD);
                if (this.miniMap) this.miniMap.ignore(this._dashShield);
            }
            this._dashShield.setPosition(sx, sy).setRotation(angle).setVisible(true).setAlpha(0.85).setScale(1.2);

            const foes = [...this.zombies];
            if (this.cowboy && this.cowboy.active) foes.push(this.cowboy);
            if (this.cowgirl && this.cowgirl.active) foes.push(this.cowgirl);
            for (const foe of foes) {
                if (!foe || !foe.active || !foe.body || this._dashHitSet.has(foe)) continue;
                const dx = foe.x - this.player.x, dy = foe.y - this.player.y;
                const dist = Math.hypot(dx, dy);
                if (dist > this.DASH_SHIELD_RANGE) continue;
                const rawRel = Math.atan2(dy, dx) - angle;
                const rel = Math.atan2(Math.sin(rawRel), Math.cos(rawRel)); // wrap to [-PI, PI]
                if (Math.abs(rel) > this.DASH_SHIELD_HALF_ANGLE) continue;
                this._dashHitSet.add(foe);
                this._dashKnockback(foe, angle);
            }

            // PvP: dashing into a fellow fighter's ghost knocks THEM back too —
            // same cone/range test, but we don't own their movement, so it's a
            // network message (see _dashKnockbackRemote) instead of a direct
            // setVelocity like the NPC case above.
            if (this.pvpEnabled && !this.inOhs && this.remotePlayers && this.remotePlayers.length) {
                for (const rp of this.remotePlayers) {
                    if (!rp.pvp || rp.spectator || !rp.sprite || this._dashHitSet.has(rp.id)) continue;
                    const dx = rp.sprite.x - this.player.x, dy = rp.sprite.y - this.player.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > this.DASH_SHIELD_RANGE) continue;
                    const rawRel = Math.atan2(dy, dx) - angle;
                    const rel = Math.atan2(Math.sin(rawRel), Math.cos(rawRel));
                    if (Math.abs(rel) > this.DASH_SHIELD_HALF_ANGLE) continue;
                    this._dashHitSet.add(rp.id);
                    this._dashKnockbackRemote(rp, angle);
                }
            }
        } catch (e) {
            console.error('dash shield update failed (non-fatal, skipping this frame):', e);
        }
    },

    // Shoves a shield-struck enemy away along the dash direction, stuns
    // it briefly so it doesn't just walk straight back into you, and
    // damages it same as a melee axe chop.
    _dashKnockback(foe, angle) {
        foe.setVelocity(Math.cos(angle) * this.DASH_KNOCKBACK_SPEED, Math.sin(angle) * this.DASH_KNOCKBACK_SPEED);
        foe._stunUntil = Math.max(foe._stunUntil || 0, this.time.now + this.DASH_KNOCKBACK_STUN);
        if (foe === this.cowboy) this._damageCowboy(this.DASH_DAMAGE);
        else if (foe === this.cowgirl) this._damageCowgirl(this.DASH_DAMAGE);
        else this._damageZombie(foe, this.DASH_DAMAGE);
        this.sounds.smash();
        this.cameras.main.shake(160, 0.01);
        this._pixelBurst(foe.x, foe.y, {
            colors: [0xc6ff33, 0xffffff, 0x8fd424],
            count: 24, minSpeed: 180, maxSpeed: 420, gravity: 300
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(foe.x, foe.y, { colors: ['#c6ff33', '#ffffff', '#8fd424'], count: 20 });
        }
    },

    // PvP counterpart to _dashKnockback: we can't setVelocity on a remote
    // player's real body (they own their own physics), so the hit + dash
    // angle go over the network — the target applies the knockback to
    // itself on arrival (see _onPvpHit). Everything here is local-only
    // feedback (FX/sound on our copy of their ghost); their actual HP and
    // shove happen on their machine once the server relays it.
    _dashKnockbackRemote(rp, angle) {
        const now = this.time.now;
        if (now < (this._pvpHitCooldown[rp.id] || 0)) return;
        this._pvpHitCooldown[rp.id] = now + 400;
        this._network.sendHit(rp.id, this.DASH_DAMAGE, angle);
        this.sounds.smash();
        this.cameras.main.shake(160, 0.01);
        this._pixelBurst(rp.sprite.x, rp.sprite.y, {
            colors: [0xc6ff33, 0xffffff, 0x8fd424],
            count: 24, minSpeed: 180, maxSpeed: 420, gravity: 300
        });
        rp.sprite.setTint(0xff5a5a);
        this.time.delayedCall(120, () => { if (rp.sprite && rp.sprite.active) rp.sprite.setTint(rp.tint); });
    },

    // Dash ended (or never started this frame) — fade out + clean up the
    // shield sprite if one's still hanging around. Safe to call every frame;
    // no-ops once the sprite's gone.
    _endDashShield() {
        if (!this._dashShield) return;
        const s = this._dashShield;
        this._dashShield = null;
        try {
            this.tweens.add({
                targets: s,
                alpha: 0, scaleX: s.scaleX + 0.5, scaleY: s.scaleY + 0.5,
                duration: 160,
                onComplete: () => s.destroy()
            });
        } catch (e) {
            console.error('dash shield cleanup failed (non-fatal):', e);
            if (s.destroy) s.destroy();
        }
    },
};
