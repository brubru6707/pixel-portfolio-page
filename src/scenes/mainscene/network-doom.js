// Multiplayer ghost sync + PvP hit detection, and the DOOM-mode per-frame
// movement/attack/render glue. Merged onto MainScene.prototype (see
// MainScene.js). REMOTE_PLAYER_TINTS is imported so _syncRemotePlayers can
// assign each peer a stable color by player number.
import { REMOTE_PLAYER_TINTS } from './constants.js';

export default {
    // First-person controls: left/right turn, forward/back walk along the facing
    // direction. Runs instead of the top-down movement while in DOOM mode.
    updateDoomMovement() {
        const s = this.doomView.settings;
        const dt = this.game.loop.delta / 1000;

        // Poll dash input BEFORE the knockback early-return below — otherwise a
        // bomb/zombie-bite knockback landing at the exact moment of a double-tap
        // would silently eat the keypress (JustDown only fires once and is gone
        // next frame). Polling here just records the double-tap; actual dash
        // movement still can't override an in-progress knockback.
        this._pollDashInput();

        // Bomb knockback owns movement while it's sliding out (see triggerExplosion).
        if (this.time.now < this._knockbackUntil) {
            this.player.setVelocity(this.player.body.velocity.x * 0.92, this.player.body.velocity.y * 0.92);
            return;
        }

        const dashVel = this._dashVelocity();
        if (dashVel) {
            this.player.setVelocity(dashVel.vx, dashVel.vy);
            this._updateDashShield(dashVel.angle);
            if (this.time.now - this._dashTrailAt > 40) {
                this._dashTrailAt = this.time.now;
                this._spawnDashAfterimage();
            }
            return;
        }
        this._endDashShield();

        // Keyboard OR the on-screen D-pad (mobile) drive first-person movement.
        const left = this.cursors.left.isDown || this.wasd.A.isDown || this.doomInput.left;
        const right = this.cursors.right.isDown || this.wasd.D.isDown || this.doomInput.right;
        const fwd = this.cursors.up.isDown || this.wasd.W.isDown || this.doomInput.fwd;
        const back = this.cursors.down.isDown || this.wasd.S.isDown || this.doomInput.back;

        if (left) this.doomAngle -= s.turnSpeed * dt;
        if (right) this.doomAngle += s.turnSpeed * dt;

        let vx = 0, vy = 0;
        if (fwd) { vx += Math.cos(this.doomAngle); vy += Math.sin(this.doomAngle); }
        if (back) { vx -= Math.cos(this.doomAngle); vy -= Math.sin(this.doomAngle); }
        const mag = Math.hypot(vx, vy);
        // Zenith frenzy doubles first-person speed too; the cowgirl's lasso
        // does the opposite.
        let spd = s.moveSpeed * (this.time.now < this._zenithUntil ? 2.2 : 1);
        if (this.time.now < this._lassoedUntil) spd *= 0.4;
        if (mag > 0) this.player.setVelocity((vx / mag) * spd, (vy / mag) * spd);
        else this.player.setVelocity(0, 0);
    },

    // One full DOOM frame: move ghosts, drive first-person controls + attack,
    // then paint the raycast view. Replaces the whole top-down update() path.
    updateDoomFrame() {
        if (this.inOhs) this.ohsGhosts.forEach(g => this._wanderGhost(g, this.game.loop.delta));
        this._updateRemotePlayers();
        this._updateZombies();
        this.updateDoomMovement();

        const speedMag = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y);
        if (speedMag > 40) this.sounds.footstep();

        // Attack: put the (invisible) axe body just ahead of the player so the
        // existing chop/overlap handlers fire on whatever we're facing.
        // Driven by the F key (desktop) or the on-screen ⚔ button (touch).
        // The plank tool places a plank ahead of the player instead.
        const actionDown = this.downF.isDown || this.actionHeld;
        if (this.tool === 'plank' && actionDown && !this._actionWasDown) this._placePlank();
        this._actionWasDown = actionDown;
        const attacking = actionDown && this.tool === 'axe';
        const gunning = actionDown && this.tool === 'axegun';
        if (attacking) {
            const reach = 46;
            this.axe.setPosition(this.player.x + Math.cos(this.doomAngle) * reach, this.player.y + Math.sin(this.doomAngle) * reach);
            this.axe.setVisible(false);
            this.axe.body.enable = true;
            if (!this.axeWasActive) this.sounds.swing();
            // Ranged nail-slash flies out along the facing direction too.
            const now = this.time.now;
            if (!this.axeWasActive || now - this.lastSwingAt > 450) {
                this.lastSwingAt = now;
                this._tryFireSlash(Math.cos(this.doomAngle), Math.sin(this.doomAngle));
            }
        } else {
            this.axe.body.enable = false;
            this.axe.setPosition(0, 0);
        }
        this.axeWasActive = attacking;

        if (gunning) {
            const now = this.time.now;
            if (now - this._lastAxeGunShot >= this.AXEGUN_FIRE_RATE) {
                this._lastAxeGunShot = now;
                this.sounds.whoosh();
                this._fireAxeGun(Math.cos(this.doomAngle), Math.sin(this.doomAngle));
            }
        }

        this.doomView.render(this.player.x, this.player.y, this.doomAngle, this._doomEntities(), actionDown, speedMag > 40, this.tool);

        // Pulse the ⚔ button when something choppable is close in front.
        const cosA = Math.cos(this.doomAngle);
        const sinA = Math.sin(this.doomAngle);
        let facingSomething = false;
        for (const e of this._hintTargets()) {
            if (!e || !e.active) continue;
            const dx = e.x - this.player.x;
            const dy = e.y - this.player.y;
            const forward = dx * cosA + dy * sinA;
            const side = Math.abs(-dx * sinA + dy * cosA);
            if (forward > 0 && forward < 140 && side < 90) { facingSomething = true; break; }
        }
        this.setActionHint(facingSomething);
    },

    // Reconcile the scene's remote-player ghosts against the latest state
    // broadcast from the presence server (id → {num, x, y, dir}). Creates
    // sprites for newly-seen players, drops ones who disconnected; actual
    // per-frame motion/animation happens in _updateRemotePlayers.
    _syncRemotePlayers(players) {
        const incomingIds = new Set(players.map(p => p.id));
        this.remotePlayers = this.remotePlayers.filter(rp => {
            if (incomingIds.has(rp.id)) return true;
            rp.sprite.destroy();
            rp.label.destroy();
            return false;
        });
        for (const p of players) {
            let rp = this.remotePlayers.find(r => r.id === p.id);
            if (!rp) {
                const tint = REMOTE_PLAYER_TINTS[p.num % REMOTE_PLAYER_TINTS.length];
                const sprite = this.add.sprite(p.x, p.y, 'me', 0)
                    .setScale(3).setDepth(5).setAlpha(0.6).setTint(tint);
                const label = this.add.text(p.x, p.y - 60, `Player ${p.num}`, {
                    fontFamily: 'monospace', fontSize: '18px', fill: '#ffffff',
                    stroke: '#000000', strokeThickness: 3
                }).setOrigin(0.5).setDepth(6);
                rp = { id: p.id, sprite, label, tint, targetX: p.x, targetY: p.y, dir: p.dir };
                this.remotePlayers.push(rp);
            }
            rp.num = p.num;
            rp.targetX = p.x;
            rp.targetY = p.y;
            rp.dir = p.dir;
            rp.pvp = !!p.pvp;
            rp.spectator = !!p.spectator;
            // A fightable peer (PvP on, not spectating) reads as solid; harmless
            // ghosts stay translucent. Only when we're a fighter too, though.
            const fightable = rp.pvp && !rp.spectator && this.pvpEnabled;
            rp.sprite.setAlpha(fightable ? 0.95 : 0.6);
            rp.label.setText(fightable ? `⚔ Player ${p.num}` : `Player ${p.num}`);
        }
    },

    // Runs every frame (both top-down and DOOM): sends the local player's
    // position to the presence server and smoothly interpolates + animates
    // every other player's ghost sprite toward its latest known position.
    // Ghosts only render in the main world — sub-worlds are a private swap.
    _updateRemotePlayers() {
        this._network.sendPos(this.player.x, this.player.y, this._netDirection());
        const visible = !this.inOhs;
        for (const rp of this.remotePlayers) {
            rp.sprite.setVisible(visible);
            rp.label.setVisible(visible);
            if (!visible) continue;
            rp.sprite.x = Phaser.Math.Linear(rp.sprite.x, rp.targetX, 0.25);
            rp.sprite.y = Phaser.Math.Linear(rp.sprite.y, rp.targetY, 0.25);
            rp.label.setPosition(rp.sprite.x, rp.sprite.y - 60);
            const animKey = rp.dir && rp.dir !== 'idle' ? `${rp.dir}-me` : 'idle-me';
            if (!rp.sprite.anims.currentAnim || rp.sprite.anims.currentAnim.key !== animKey) {
                rp.sprite.play(animKey, true);
            }
        }
        this._pvpCheckHits();
    },

    // PvP: when we're a fighter (not spectating), test our live weapons — the
    // melee axe body, ranged slashes and thrown axe-gun hatchets — against every
    // fellow fighter's ghost. A landed hit is reported to the server, which
    // forwards it so THAT player takes the damage on their own screen.
    _pvpCheckHits() {
        if (!this.pvpEnabled || this.inOhs || !this.remotePlayers || !this.remotePlayers.length) return;
        const now = this.time.now;
        for (const rp of this.remotePlayers) {
            if (!rp.pvp || rp.spectator) continue;
            if (now < (this._pvpHitCooldown[rp.id] || 0)) continue;
            const bx = rp.sprite.x, by = rp.sprite.y;
            let dmg = 0;
            if (this.axe && this.axe.body && this.axe.body.enable &&
                Phaser.Math.Distance.Between(this.axe.x, this.axe.y, bx, by) < 48) {
                dmg = Math.max(dmg, 2);
            }
            for (const s of this.slashGroup.getChildren()) {
                if (s.active && Phaser.Math.Distance.Between(s.x, s.y, bx, by) < 48) { dmg = Math.max(dmg, 1); break; }
            }
            for (const a of this.axeGunGroup.getChildren()) {
                if (a.active && Phaser.Math.Distance.Between(a.x, a.y, bx, by) < 42) { dmg = Math.max(dmg, this.AXEGUN_DAMAGE); break; }
            }
            if (dmg <= 0) continue;
            this._pvpHitCooldown[rp.id] = now + 400;
            this._network.sendHit(rp.id, dmg);
            // Local feedback on the struck ghost (the real HP change happens on
            // their machine when the server forwards the hit).
            this._pixelBurst(bx, by, { colors: [0xff2b2b, 0xffffff, 0xff8080], count: 12, minSpeed: 80, maxSpeed: 220, gravity: 300 });
            rp.sprite.setTint(0xff5a5a);
            this.time.delayedCall(120, () => { if (rp.sprite && rp.sprite.active) rp.sprite.setTint(rp.tint); });
            this.sounds.smash();
        }
    },

    // Direction suffix ('up'/'down'/'left'/'right'/'idle') matching whatever
    // <dir>-me animation is currently playing on the local player, so remote
    // clients can mirror it on their copy of our ghost.
    _netDirection() {
        const key = this.player.anims.currentAnim && this.player.anims.currentAnim.key;
        return key ? key.replace('-me', '') : 'idle';
    },

    // Billboard list for the current world (3D). Main: trees + computer (+ its
    // preview) + orb + live bombs. Sub-worlds: the project images + exit sign
    // + ghosts. Zombies, planks, slashes, the cowboy + his bullets, heart
    // pickups and flying Zenith axes billboard in every world.
    _doomEntities() {
        const extras = [
            ...this.plankGroup.getChildren(),
            ...this.slashGroup.getChildren(),
            ...this.bulletGroup.getChildren(),
            ...this._zenithAxes,
            ...this.remotePlayers.map(rp => rp.sprite),
        ];
        if (this.cowboy && this.cowboy.active) extras.push(this.cowboy);
        if (this.cowgirl && this.cowgirl.active) extras.push(this.cowgirl);
        if (this.inOhs) {
            const ohsList = [...this.ohsProjectSprites, this.ohsExitSign, ...this.ohsGhosts, ...this.zombies, ...extras];
            if (this.subWorldId === 'ohs') ohsList.push(this.orb);
            return ohsList.filter(e => e && e.active);
        }
        const list = this.trees.getChildren().slice();
        list.push(this.computer, this.computerPreview, this.contributeSign, this.ohsSchool, this.brownSchool);
        this.bombs.getChildren().forEach(b => { if (b.active) list.push(b); });
        this.heartPickups.getChildren().forEach(h => { if (h.active) list.push(h); });
        this.zombies.forEach(z => { if (z.active) list.push(z); });
        list.push(...extras);
        return list;
    },

    // Things that light up the CHOP button when you're near/facing them.
    _hintTargets() {
        const foes = [...this.zombies];
        if (this.cowboy && this.cowboy.active) foes.push(this.cowboy);
        if (this.cowgirl && this.cowgirl.active) foes.push(this.cowgirl);
        if (this.inOhs) {
            const ohsList = [...this.ohsProjectSprites, this.ohsExitSign, ...this.ohsGhosts, ...foes];
            if (this.subWorldId === 'ohs') ohsList.push(this.orb);
            return ohsList;
        }
        return [this.computer, this.contributeSign, this.ohsSchool, this.brownSchool, ...this.trees.getChildren(), ...foes];
    },
};
