// Zombie horde: spawn/variant rolls, per-frame AI, damage/kill, the A*
// pathfinding nav grid it shares with the cowboy. Merged onto MainScene.prototype.
export default {
    // ===== Zombies =====
    // Opt-in horde toggled by the "zombies?" HUD button. They exist in BOTH
    // worlds and both view modes: plain physics sprites in the top-down sim
    // (so DOOM mode billboards them for free), path-finding around obstacles.

    setZombiesEnabled(on) {
        this.zombiesEnabled = on;
        document.body.classList.toggle('zombies-on', on);
        if (this._updateModesUI) this._updateModesUI();
        if (on) {
            this._navDirty = true;
            for (let i = 0; i < 3; i++) this._spawnZombie();
            this.showToast('ZOMBIES ENABLED...\nRUN.', 2600);
        } else {
            this.zombies.forEach(z => z.destroy());
            this.zombies = [];
        }
    },

    _spawnZombie() {
        if (!this.zombiesEnabled || this.zombies.length >= this.MAX_ZOMBIES) return;
        if (this._navDirty) this._buildNavGrid();
        let x = 0, y = 0, tries = 0, ok = false;
        while (tries++ < 50 && !ok) {
            x = Phaser.Math.Between(120, 1880);
            y = Phaser.Math.Between(120, 1880);
            ok = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > 500
                && !this._navBlockedAt(x, y);
        }
        if (!ok) return;
        // Once in a while a BIG one lumbers in: 7x the health, 1.5 hearts of
        // damage on touch, slower but much harder to put down. Otherwise there's
        // a chance of a FIRE zombie: regular-sized, red-hot, and it spits a
        // cone of flame that scorches the player for half a heart from afar.
        // Otherwise a chance of a FAST zombie: a glass cannon that outruns the
        // player outright (230 vs the player's 200) but dies in one hit —
        // dashing is the real answer to one of these. Otherwise a chance of an
        // IRON HELMET zombie (Plants vs. Zombies conehead/buckethead style):
        // regular speed and bite, but a separate armor pool absorbs hits before
        // its own HP starts dropping — see _damageZombie for the two-stage logic.
        const big = Math.random() < 0.12;
        const fire = !big && Math.random() < 0.25;
        const fast = !big && !fire && Math.random() < 0.18;
        const helmet = !big && !fire && !fast && Math.random() < 0.2;
        const z = this.zombieGroup.create(x, y, 'zombie', 0).setScale(big ? 5.5 : (fast ? 2.6 : 3));
        z.setCollideWorldBounds(true);
        z.setDepth(5);
        z._path = null;
        z._nextRepath = 0;
        z._stunUntil = 0;
        z._big = big;
        z._fire = fire;
        z._fast = fast;
        z._helmet = helmet;
        z._nextSpit = this.time.now + 1200 + Math.random() * 800;
        // Health is in SLASH units: ranged slash = 1, axe chop = 2.
        // Regular zombie: 2 (two slashes or one chop). Big: 7x that. Fire: 3.
        // Fast: 1 (one-shot). Helmet: 4 armor + 2 body once the armor's gone —
        // 6 total, more than a regular zombie but well short of a big one.
        z._hp = big ? 14 : (fire ? 3 : (fast ? 1 : 2));
        z._armorHp = helmet ? 4 : 0;
        z._speed = big ? 60 : (fire ? 78 : (fast ? 230 : 85));
        if (big) z.setTint(0x9adf6a);
        else if (fire) z.setTint(0xff6a3d);
        else if (fast) z.setTint(0xfff200);
        else if (helmet) z.setTint(0x9aa5ad);
        z.play('down-zombie');
        this.zombies.push(z);
        // Rises out of the ground in a puff of pixels — green for the undead,
        // ember-orange for the fire-breathers, electric yellow for the fast
        // ones, gunmetal for the armored ones.
        this._pixelBurst(x, y, fire ? {
            colors: [0xff3b00, 0xff6a00, 0xff9500, 0xffe500],
            count: 18, minSpeed: 60, maxSpeed: 210, gravity: 380
        } : fast ? {
            colors: [0xfff200, 0xffe066, 0xccff00, 0xffffff],
            count: 16, minSpeed: 100, maxSpeed: 300, gravity: 340
        } : helmet ? {
            colors: [0x9aa5ad, 0xb0b8c0, 0x707880, 0xffffff],
            count: 16, minSpeed: 60, maxSpeed: 200, gravity: 380
        } : {
            colors: [0x4a9c2d, 0x7be04a, 0x306b1c, 0x9adf6a],
            count: big ? 30 : 14, minSpeed: 60, maxSpeed: big ? 260 : 190, gravity: 380
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(x, y, {
                colors: fire ? ['#ff3b00', '#ff6a00', '#ffe500'] : fast ? ['#fff200', '#ffe066', '#ccff00'] : helmet ? ['#9aa5ad', '#b0b8c0', '#707880'] : ['#4a9c2d', '#7be04a', '#306b1c'],
                count: 14
            });
        }
        if (big) this.showToast('A BIG ZOMBIE EMERGES...', 2200);
        else if (fire) this.showToast('A FIRE ZOMBIE HISSES...', 2200);
        else if (fast) this.showToast('A FAST ZOMBIE SCREECHES...', 2200);
        else if (helmet) this.showToast('AN IRON-HELMET ZOMBIE CLANKS IN...', 2200);
    },

    // Per-frame zombie brain: staggered A* re-paths toward the player, waypoint
    // following, walk anims, and post-hit stun. Runs in both 2D and DOOM mode.
    _updateZombies() {
        if (!this.zombies.length) return;
        if (this._navDirty) this._buildNavGrid();
        const now = this.time.now;
        for (const z of this.zombies) {
            if (!z.active) continue;
            if (now < z._stunUntil) {
                z.setVelocity(z.body.velocity.x * 0.9, z.body.velocity.y * 0.9);
                continue;
            }
            const distToPlayer = Phaser.Math.Distance.Between(z.x, z.y, this.player.x, this.player.y);
            if (now >= z._nextRepath) {
                z._path = this._findPath(z.x, z.y, this.player.x, this.player.y);
                z._nextRepath = now + 450 + Math.random() * 350; // staggered so they don't all path the same frame
            }
            // Walk toward the next waypoint; close-in, just head straight at the player.
            let tx = this.player.x, ty = this.player.y;
            if (distToPlayer > 90 && z._path && z._path.length) {
                while (z._path.length && Phaser.Math.Distance.Between(z.x, z.y, z._path[0].x, z._path[0].y) < 30) {
                    z._path.shift();
                }
                if (z._path.length) { tx = z._path[0].x; ty = z._path[0].y; }
            }
            const ang = Math.atan2(ty - z.y, tx - z.x);
            const sp = z._speed || 85; // slower than the player's 200 — escapable, relentless
            z.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
            const vx = z.body.velocity.x, vy = z.body.velocity.y;
            if (Math.abs(vx) > Math.abs(vy)) z.play(vx > 0 ? 'right-zombie' : 'left-zombie', true);
            else z.play(vy > 0 ? 'down-zombie' : 'up-zombie', true);

            // Fire zombies belch a cone of flame at the player when in range.
            if (z._fire && now >= (z._nextSpit || 0) && distToPlayer < 260) {
                z._nextSpit = now + 1500 + Math.random() * 900;
                this._zombieSpitFire(z, distToPlayer);
            }
        }
    },

    // A fire zombie spits a gout of flaming pixels toward the player. If the
    // player is close enough to be caught in the cone (in front of it), they
    // take half a heart. Works in both 2D and DOOM.
    _zombieSpitFire(z, distToPlayer) {
        const dx = this.player.x - z.x, dy = this.player.y - z.y;
        const d = Math.hypot(dx, dy) || 1;
        const base = Math.atan2(dy, dx);
        this.sounds.whoosh();
        for (let i = 0; i < 16; i++) {
            const a = base + (Math.random() - 0.5) * 0.55;      // ~30° cone
            const reach = 70 + Math.random() * 150;
            const p = this.add.image(z.x + Math.cos(a) * 16, z.y + Math.sin(a) * 16, 'fxSpark')
                .setTint(Phaser.Utils.Array.GetRandom([0xff3b00, 0xff6a00, 0xff9500, 0xffe500]))
                .setScale(2 + Math.random() * 2).setDepth(6)
                .setBlendMode(Phaser.BlendModes.ADD);
            if (this.miniMap) this.miniMap.ignore(p);
            this.tweens.add({
                targets: p,
                x: z.x + Math.cos(a) * reach,
                y: z.y + Math.sin(a) * reach,
                alpha: 0, scale: 0.3,
                duration: 340 + Math.random() * 180,
                ease: 'Cubic.easeOut',
                onComplete: () => p.destroy()
            });
        }
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(z.x + Math.cos(base) * 30, z.y + Math.sin(base) * 30,
                { colors: ['#ff3b00', '#ff6a00', '#ffe500'], count: 14 });
        }
        // Scorch: only if the player is actually within the flame's reach AND
        // there's no plank standing between the zombie and them — a planted
        // plank blocks the fire breath same as it blocks bullets.
        if (distToPlayer < 200 && this.time.now >= this._invincibleUntil
            && !this._lineBlockedByPlank(z.x, z.y, this.player.x, this.player.y)) {
            this.damage(0.5);
            this.cameras.main.shake(90, 0.006);
            this._pixelBurst(this.player.x, this.player.y, {
                colors: [0xff3b00, 0xff9500, 0xffe500],
                count: 8, minSpeed: 60, maxSpeed: 180, gravity: 260
            });
        }
    },

    // Chop a zombie: 2 damage (one-shots a regular, chips away at a big one).
    hitZombie(axe, z) {
        if (!this.canChop || !z.active) return;
        this.canChop = false;
        this.sounds.chop();
        this._damageZombie(z, 2);
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    },

    // Shared zombie damage: flash, hurt-burst, kill when the HP runs out.
    // Iron-helmet zombies take a detour first — every hit is absorbed by the
    // armor pool (a metallic clang, no green splat) until it's empty, and
    // only then does damage start coming off the zombie's own HP, same as a
    // Plants vs. Zombies cone/bucket losing its headgear.
    _damageZombie(z, dmg) {
        if (!z.active) return;
        if (z._helmet && z._armorHp > 0) {
            z._armorHp -= dmg;
            const helmetOff = z._armorHp <= 0;
            z.setTintFill(0xffffff);
            this.time.delayedCall(90, () => {
                if (!z.active) return;
                if (helmetOff) z.clearTint(); else z.setTint(0x9aa5ad);
            });
            z._stunUntil = Math.max(z._stunUntil || 0, this.time.now + 160);
            this._pixelBurst(z.x, z.y, {
                colors: [0xb0b8c0, 0xffffff, 0x707880],
                count: 8, minSpeed: 80, maxSpeed: 220, gravity: 380
            });
            if (this.doomView && this.doomView.active) {
                this.doomView.burstAtWorld(z.x, z.y, { colors: ['#b0b8c0', '#ffffff', '#707880'], count: 8 });
            }
            if (helmetOff) {
                this.sounds.smash();
                this.showCutText(z.x, z.y - 40, 'HELMET OFF!');
            } else {
                this.sounds.chop();
            }
            return;
        }
        z._hp = (z._hp === undefined ? 2 : z._hp) - dmg;
        if (z._hp <= 0) {
            this._killZombie(z);
            return;
        }
        // Still standing: white flash + a small splat so the hit reads.
        const baseTint = z._big ? 0x9adf6a : (z._fire ? 0xff6a3d : (z._fast ? 0xfff200 : null));
        z.setTintFill(0xffffff);
        this.time.delayedCall(90, () => {
            if (!z.active) return;
            if (baseTint !== null) z.setTint(baseTint); else z.clearTint();
        });
        z._stunUntil = Math.max(z._stunUntil || 0, this.time.now + 160);
        this._pixelBurst(z.x, z.y, {
            colors: [0x4a9c2d, 0x7be04a, 0xff3b3b],
            count: 8, minSpeed: 70, maxSpeed: 200, gravity: 420
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(z.x, z.y, { colors: ['#4a9c2d', '#7be04a', '#ff3b3b'], count: 8 });
        }
    },

    // A zombie dies: splatter (or a full split-in-half if a bomb got it),
    // bump the kill counter, and maybe kick off the Zenith frenzy.
    _killZombie(z, { split = false } = {}) {
        if (!z.active) return;
        const zx = z.x, zy = z.y;
        const idx = this.zombies.indexOf(z);
        if (idx >= 0) this.zombies.splice(idx, 1);
        if (split) this._splitZombie(z);
        z.destroy();
        this.sounds.smash();
        this.zombieKills += 1;
        try { localStorage.setItem('zombieKills', this.zombieKills); } catch (e) {}
        if (this._zscoreVal) this._zscoreVal.textContent = this.zombieKills;
        const word = Phaser.Utils.Array.GetRandom(['BRAINS!', 'SPLAT!', 'REKT!', 'UNDEAD?', 'HEADSHOT!']);
        this._pixelBurst(zx, zy, {
            colors: [0x4a9c2d, 0x7be04a, 0x306b1c, 0xff3b3b, 0x8b0000],
            count: 26, minSpeed: 110, maxSpeed: 320, gravity: 540
        });
        this.showCutText(zx, zy - 40, word);
        this.doomView.burstAtWorld(zx, zy, { colors: ['#4a9c2d', '#7be04a', '#306b1c', '#ff3b3b'], count: 26, wz: 30 });
        this.doomView.textAtWorld(zx, zy, word);

        // Every 5 kills: ZENITH TIME.
        this._killsTowardZenith += 1;
        if (this._killsTowardZenith >= 5) {
            this._killsTowardZenith = 0;
            this._startZenith();
        }
    },

    // Gory split-in-half: the zombie's top and bottom halves fly apart,
    // spinning and fading (used when a hidden bomb gets them).
    _splitZombie(z) {
        const frameH = 15; // zombie frames are 13x15
        const mkHalf = (top) => {
            const img = this.add.image(z.x, z.y, 'zombie', z.frame.name)
                .setScale(z.scaleX)
                .setDepth(60)
                .setFlipX(z.flipX);
            if (top) img.setCrop(0, 0, 13, Math.ceil(frameH / 2));
            else img.setCrop(0, Math.ceil(frameH / 2), 13, Math.floor(frameH / 2));
            if (this.miniMap) this.miniMap.ignore(img);
            return img;
        };
        const topHalf = mkHalf(true);
        const botHalf = mkHalf(false);
        this.tweens.add({
            targets: topHalf,
            x: z.x - Phaser.Math.Between(40, 90),
            y: z.y - Phaser.Math.Between(60, 120),
            rotation: -2.5 - Math.random() * 2,
            alpha: 0,
            duration: 750,
            ease: 'Cubic.easeOut',
            onComplete: () => topHalf.destroy()
        });
        this.tweens.add({
            targets: botHalf,
            x: z.x + Phaser.Math.Between(40, 90),
            y: z.y - Phaser.Math.Between(20, 60),
            rotation: 2.5 + Math.random() * 2,
            alpha: 0,
            duration: 750,
            ease: 'Cubic.easeOut',
            onComplete: () => botHalf.destroy()
        });
    },

    // Zombies can't see hidden bombs — stepping on one detonates it and
    // blows them clean in half.
    _zombieTripsBomb(z, bomb) {
        if (!z.active || !bomb.active) return;
        bomb.disableBody(true, true);
        this.sounds.smash();
        const explosion = this.add.sprite(bomb.x, bomb.y, 'explosive').setScale(3).setDepth(16000);
        explosion.play('explode');
        explosion.on('animationcomplete', () => explosion.destroy());
        if (this.miniMap) this.miniMap.ignore(explosion);
        this._pixelBurst(bomb.x, bomb.y, {
            colors: [0xff2b2b, 0xff9500, 0xffe500, 0x4a9c2d, 0x8b0000],
            count: 30, minSpeed: 120, maxSpeed: 340, gravity: 500
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(bomb.x, bomb.y, { colors: ['#ff2b2b', '#ff9500', '#ffe500', '#4a9c2d'], count: 30 });
        }
        this._killZombie(z, { split: true });
        this._checkBombRegen();
    },

    // A zombie caught the player: hearts gone (1 regular, 1.5 for the BIG
    // one), shove the player away, brief invulnerability so a crowd can't
    // drain all three hearts in one touch.
    _zombieTouchPlayer(player, z) {
        const now = this.time.now;
        if (now < this._zombieDmgUntil || now < z._stunUntil) return;
        if (now < this._invincibleUntil) return; // Zenith: untouchable
        this._zombieDmgUntil = now + 1500;
        z._stunUntil = now + 900; // the biter pauses to savor the moment
        z.setVelocity(0, 0);
        this.sounds.smash();
        this.damage(z._big ? 1.5 : 1);
        this.cameras.main.shake(180, 0.012);
        this._pixelBurst(player.x, player.y, {
            colors: [0xff2b2b, 0xff5555, 0xff8080, 0xc40000],
            count: 18, minSpeed: 90, maxSpeed: 260, gravity: 420
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(player.x, player.y, { colors: ['#ff2b2b', '#ff5555', '#ff8080'], count: 18 });
        }
        const ang = Math.atan2(player.y - z.y, player.x - z.x);
        player.setVelocity(Math.cos(ang) * 900, Math.sin(ang) * 900);
        this._knockbackUntil = now + 500;
    },

    // ---- Nav grid + A* (Minecraft-mob-style pathing around obstacles) ----

    // Coarse occupancy grid over the 2000x2000 world (NAV_CELL px per cell),
    // rebuilt lazily whenever the obstacle set changes (tree chopped, world
    // swapped). Blockers are the CURRENT world's static bodies.
    _buildNavGrid() {
        const CELL = this.NAV_CELL;
        const cols = Math.ceil(2000 / CELL);
        const grid = new Uint8Array(cols * cols);
        const block = (spr, inflate = 8) => {
            if (!spr || !spr.active) return;
            const b = spr.getBounds();
            const x0 = Math.max(0, Math.floor((b.left - inflate) / CELL));
            const x1 = Math.min(cols - 1, Math.floor((b.right + inflate) / CELL));
            const y0 = Math.max(0, Math.floor((b.top - inflate) / CELL));
            const y1 = Math.min(cols - 1, Math.floor((b.bottom + inflate) / CELL));
            for (let gy = y0; gy <= y1; gy++) {
                for (let gx = x0; gx <= x1; gx++) grid[gy * cols + gx] = 1;
            }
        };
        if (this.inOhs) {
            this.ohsProjectSprites.forEach(s => block(s));
            block(this.ohsExitSign);
            if (this.subWorldId === 'ohs') block(this.orb);
        } else {
            this.trees.getChildren().forEach(t => block(t));
            block(this.computer);
            block(this.contributeSign);
            block(this.ohsSchool);
            block(this.brownSchool);
        }
        // Player-placed planks wall off paths in every world.
        this.plankGroup.getChildren().forEach(p => block(p));
        this._navGrid = grid;
        this._navCols = cols;
        this._navDirty = false;
    },

    _navBlockedAt(x, y) {
        if (!this._navGrid) return false;
        const CELL = this.NAV_CELL, cols = this._navCols;
        const gx = Phaser.Math.Clamp(Math.floor(x / CELL), 0, cols - 1);
        const gy = Phaser.Math.Clamp(Math.floor(y / CELL), 0, cols - 1);
        return !!this._navGrid[gy * cols + gx];
    },

    // A* over the nav grid: 8-directional with no corner-cutting, octile
    // heuristic, binary-heap open set. Returns world-space waypoints (cell
    // centers) or null when unreachable / already in the same cell.
    _findPath(sx, sy, txw, tyw) {
        const grid = this._navGrid;
        if (!grid) return null;
        const cols = this._navCols, CELL = this.NAV_CELL;
        const clamp = (v) => Phaser.Math.Clamp(v, 0, cols - 1);
        const sgx = clamp(Math.floor(sx / CELL)), sgy = clamp(Math.floor(sy / CELL));
        const tgx = clamp(Math.floor(txw / CELL)), tgy = clamp(Math.floor(tyw / CELL));
        const start = sgy * cols + sgx, goal = tgy * cols + tgx;
        if (start === goal) return null;

        const free = (idx) => idx === start || idx === goal || !grid[idx];
        const gScore = new Float32Array(cols * cols).fill(Infinity);
        const cameFrom = new Int32Array(cols * cols).fill(-1);
        const closed = new Uint8Array(cols * cols);
        gScore[start] = 0;

        // Tiny binary min-heap of [f, idx].
        const heap = [];
        const push = (f, idx) => {
            heap.push([f, idx]);
            let i = heap.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heap[p][0] <= heap[i][0]) break;
                [heap[p], heap[i]] = [heap[i], heap[p]];
                i = p;
            }
        };
        const pop = () => {
            const top = heap[0], last = heap.pop();
            if (heap.length) {
                heap[0] = last;
                let i = 0;
                for (;;) {
                    const l = 2 * i + 1, r = l + 1;
                    let m = i;
                    if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                    if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                    if (m === i) break;
                    [heap[m], heap[i]] = [heap[i], heap[m]];
                    i = m;
                }
            }
            return top;
        };
        const hCost = (idx) => {
            const dx = Math.abs((idx % cols) - tgx);
            const dy = Math.abs(Math.floor(idx / cols) - tgy);
            return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); // octile
        };

        push(hCost(start), start);
        let iterations = 0;
        while (heap.length && iterations++ < 3000) {
            const [, cur] = pop();
            if (cur === goal) break;
            if (closed[cur]) continue;
            closed[cur] = 1;
            const cx = cur % cols, cy = Math.floor(cur / cols);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= cols) continue;
                    const nIdx = ny * cols + nx;
                    if (!free(nIdx) || closed[nIdx]) continue;
                    // Diagonals may not cut a blocked corner.
                    if (dx && dy && (!free(cy * cols + nx) || !free(ny * cols + cx))) continue;
                    const cost = dx && dy ? 1.41 : 1;
                    const g = gScore[cur] + cost;
                    if (g < gScore[nIdx]) {
                        gScore[nIdx] = g;
                        cameFrom[nIdx] = cur;
                        push(g + hCost(nIdx), nIdx);
                    }
                }
            }
        }
        if (cameFrom[goal] === -1) return null;

        const path = [];
        for (let idx = goal; idx !== start; idx = cameFrom[idx]) {
            path.push({ x: (idx % cols) * CELL + CELL / 2, y: Math.floor(idx / cols) * CELL + CELL / 2 });
        }
        path.reverse();
        return path;
    },
};
