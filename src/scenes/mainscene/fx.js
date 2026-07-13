// Core gameplay visual effects: runtime-generated particle/slash textures,
// the tinted-image pixel-burst system (Phaser's real particle emitter
// renders nothing in this scene — see the note below), the nail-slash arc,
// and the floating hype-word popup. Merged onto MainScene.prototype.
export default {
    // ---- Hit / break effects -------------------------------------------------

    // One-time runtime textures: a tiny square for particles (tinted per use)
    // and a horizontal rainbow gradient used behind the "RADICAL!" popup.
    createFxTextures() {
        if (!this.textures.exists('fxSpark')) {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 8, 8);
            g.generateTexture('fxSpark', 8, 8);
            g.destroy();
        }
        if (!this.textures.exists('rainbowGrad')) {
            const rw = 220, rh = 48;
            const tex = this.textures.createCanvas('rainbowGrad', rw, rh);
            const c = tex.getContext();
            const grad = c.createLinearGradient(0, 0, rw, 0);
            const cols = ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'];
            cols.forEach((col, i) => grad.addColorStop(i / (cols.length - 1), col));
            c.fillStyle = grad;
            c.fillRect(0, 0, rw, rh);
            tex.refresh();
        }
        // Crescent "slash" (Hollow-Knight style). Drawn chunky with smoothing
        // off so it reads as pixel art. Points/bulges to the RIGHT by default;
        // rotated per swing direction when spawned.
        if (!this.textures.exists('fxSlash')) {
            const sw = 96, sh = 96;
            const tex = this.textures.createCanvas('fxSlash', sw, sh);
            const c = tex.getContext();
            c.imageSmoothingEnabled = false;
            const cx = sw / 2, cy = sh / 2;
            c.fillStyle = '#ffffff';
            c.beginPath();
            c.arc(cx - 6, cy, 40, -1.15, 1.15, false); // outer edge (right bulge)
            c.arc(cx + 20, cy, 44, 1.0, -1.0, true);   // inner concave -> pointed tips
            c.closePath();
            c.fill();
            tex.refresh();
        }
        // Left HALF of a chunky pixel heart (the rare +0.5 health pickup).
        if (!this.textures.exists('halfHeartPix')) {
            const px = 4; // 4 screen px per "pixel"
            const tex = this.textures.createCanvas('halfHeartPix', 7 * px, 7 * px);
            const c = tex.getContext();
            const rows = [
                [1, 2],                // y0
                [0, 1, 2, 3],          // y1
                [0, 1, 2, 3],          // y2
                [0, 1, 2, 3],          // y3
                [1, 2, 3],             // y4
                [2, 3],                // y5
                [3]                    // y6
            ];
            c.fillStyle = '#ff3b3b';
            rows.forEach((cols, y) => cols.forEach(x => c.fillRect(x * px, y * px, px, px)));
            c.fillStyle = '#ffd0d0';   // little shine
            c.fillRect(1 * px, 1 * px, px, px);
            tex.refresh();
        }
        // The cowboy's bullet: a short orange bolt.
        if (!this.textures.exists('fxBullet')) {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0xff9500, 1);
            g.fillRect(0, 1, 12, 4);
            g.fillStyle(0xffe500, 1);
            g.fillRect(8, 1, 4, 4);
            g.generateTexture('fxBullet', 12, 6);
            g.destroy();
        }
        // Dash shield: a chunky glowing dome, bulging to the RIGHT by default
        // (rotated to the dash direction when spawned — same convention as
        // fxSlash above).
        if (!this.textures.exists('fxShield')) {
            const sw = 100, sh = 76;
            const tex = this.textures.createCanvas('fxShield', sw, sh);
            const c = tex.getContext();
            c.imageSmoothingEnabled = false;
            const cx = sw * 0.22, cy = sh / 2, r = sh / 2 - 4;
            c.fillStyle = 'rgba(198, 255, 51, 0.28)';
            c.beginPath();
            c.arc(cx, cy, r, -1.3, 1.3, false);
            c.closePath();
            c.fill();
            c.strokeStyle = '#c6ff33';
            c.lineWidth = 5;
            c.beginPath();
            c.arc(cx, cy, r, -1.3, 1.3, false);
            c.stroke();
            c.strokeStyle = '#eaffb0';
            c.lineWidth = 2;
            c.beginPath();
            c.arc(cx, cy, r - 6, -1.15, 1.15, false);
            c.stroke();
            tex.refresh();
        }
    },

    // Reliable pixel burst built from image sprites (Phaser 3.70's particle
    // emitter renders nothing in this scene, but plain tinted images always do).
    // Each shard follows a ballistic arc, shrinking + fading, then self-destroys.
    _pixelBurst(x, y, { colors, count = 20, minSpeed = 90, maxSpeed = 280, gravity = 620, minScale = 2, maxScale = 4.2, life = 750, depth = 15000 }) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = minSpeed + Math.random() * (maxSpeed - minSpeed);
            const vx = Math.cos(ang) * spd;
            const vy = Math.sin(ang) * spd;
            const sc = minScale + Math.random() * (maxScale - minScale);
            const col = colors[Math.floor(Math.random() * colors.length)];
            const spr = this.add.image(x, y, 'fxSpark').setTint(col).setScale(sc).setDepth(depth);
            if (this.miniMap) this.miniMap.ignore(spr);
            const dur = life * (0.7 + Math.random() * 0.6);
            const durSec = dur / 1000;
            const s = { p: 0 };
            this.tweens.add({
                targets: s, p: 1, duration: dur, ease: 'Linear',
                onUpdate: () => {
                    const t = s.p * durSec;
                    spr.setPosition(x + vx * t, y + vy * t + 0.5 * gravity * t * t);
                    spr.setScale(sc * (1 - s.p));
                    spr.setAlpha(1 - s.p * s.p);
                },
                onComplete: () => spr.destroy()
            });
        }
    },

    // Pixelated slash arc that flashes in the air along the swing direction.
    // Accepts either an aim angle (radians, from _aimAngle) or a legacy
    // direction string ('left'/'right'/'up'/'down'). The slash arc + ranged
    // projectile both fire along that angle so they track the cursor.
    spawnSlash(aim) {
        if (!this.textures.exists('fxSlash')) return;
        const off = 42;
        let ang;
        if (typeof aim === 'number') {
            ang = aim;
        } else {
            const dirs = { right: 0, left: Math.PI, up: -Math.PI / 2, down: Math.PI / 2, none: 0 };
            ang = dirs[aim] ?? 0;
        }
        const m = { rot: ang, dx: Math.cos(ang) * off, dy: Math.sin(ang) * off };
        // The slash is also the RANGED attack: launch a flying arc that
        // damages zombies/the cowboy (2 slash hits kill a regular zombie).
        // Locked unless the player is at FULL health — melee still works hurt.
        this._tryFireSlash(Math.cos(ang), Math.sin(ang));
        // A soft cyan under-glow + a bright white core, both sweeping through
        // the arc — reads as a crisp nail-slash flash.
        const glow = this.add.image(this.player.x + m.dx, this.player.y + m.dy, 'fxSlash')
            .setTint(0x8ff0ff).setDepth(15999).setRotation(m.rot - 0.55).setScale(0.5).setAlpha(0.9);
        const core = this.add.image(this.player.x + m.dx, this.player.y + m.dy, 'fxSlash')
            .setTint(0xffffff).setDepth(16000).setRotation(m.rot - 0.55).setScale(0.35).setAlpha(1);
        if (this.miniMap) this.miniMap.ignore([glow, core]);
        this.tweens.add({
            targets: glow, scaleX: 2.0, scaleY: 1.8, rotation: m.rot + 0.55, alpha: 0,
            duration: 230, ease: 'Cubic.easeOut', onComplete: () => glow.destroy()
        });
        this.tweens.add({
            targets: core, scaleX: 1.7, scaleY: 1.5, rotation: m.rot + 0.55, alpha: 0,
            duration: 200, ease: 'Cubic.easeOut', onComplete: () => core.destroy()
        });
    },

    // Wood/leaf burst for things that actually get destroyed (trees). Big and
    // chunky so it reads clearly against the world — woody shards plus a quick
    // pop of bright green leaf bits.
    emitBreakParticles(x, y) {
        this._pixelBurst(x, y, {
            colors: [0x8b5a2b, 0xa9772f, 0xc9a24a, 0x6b431d],
            count: 26, minSpeed: 110, maxSpeed: 320, gravity: 620,
            minScale: 2.4, maxScale: 4.4, life: 850, depth: 15000
        });
        this._pixelBurst(x, y, {
            colors: [0x5bbf3a, 0x8fe04a, 0x3f8a2f, 0xd6ff8a],
            count: 16, minSpeed: 60, maxSpeed: 210, gravity: 300,
            minScale: 1.8, maxScale: 3.2, life: 750, depth: 15001
        });
    },

    // Small rainbow sparkle for things that DON'T break (computer, orb, ghosts).
    emitHitParticles(x, y) {
        this._pixelBurst(x, y, {
            colors: [0xff2d55, 0xff9500, 0xffe500, 0x34d158, 0x00c7ff, 0x5e5ce6, 0xff2dd4, 0xffffff],
            count: 20, minSpeed: 80, maxSpeed: 250, gravity: 220,
            minScale: 1.8, maxScale: 3.4, life: 640, depth: 15000
        });
    },

    // Random retro hype word for a successful chop.
    pickCutWord() {
        const words = ['RADICAL!', 'AWESOME!', 'GNARLY!', 'TUBULAR!', 'WICKED!', 'EPIC!', 'TIMBER!', 'BOOM!', 'SLICK!', 'NICE!'];
        return Phaser.Utils.Array.GetRandom(words);
    },

    // White hype word on a rainbow strip that pops in, floats up and fades (~2s).
    showCutText(x, y, word = this.pickCutWord()) {
        const label = this.add.text(0, 0, word, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0.5);

        const bg = this.add.image(0, 0, 'rainbowGrad')
            .setOrigin(0.5)
            .setDisplaySize(label.width + 24, label.height + 14);

        const container = this.add.container(x, y, [bg, label]).setDepth(20000).setScale(0.3);

        // Pop in.
        this.tweens.add({ targets: container, scale: 1, duration: 220, ease: 'Back.out' });
        // Float up.
        this.tweens.add({ targets: container, y: y - 46, duration: 2000, ease: 'Sine.easeOut' });
        // Fade out near the end, then clean up.
        this.tweens.add({
            targets: container,
            alpha: 0,
            delay: 1400,
            duration: 600,
            onComplete: () => container.destroy()
        });
    },
};
