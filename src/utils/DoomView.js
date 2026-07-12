// First-person raycasting renderer (DOOM / Wolfenstein style).
//
// The Phaser game keeps running as a normal top-down simulation underneath —
// this class just reads the player + entity world positions each frame and
// paints a first-person view onto an overlay <canvas> that covers the screen.
//
// Two things sell the "3D": the world boundary is raycast into perspective
// walls (near = tall, far = short), and every entity is drawn as a billboard
// sprite whose on-screen size is (worldSize * focal / distance) — so a far
// tree is tiny and a close one fills the screen, exactly like DOOM monsters.
//
// A live slider panel exposes the tunable knobs (FOV, pitch, eye height, sprite
// scale, speeds, render distance, wall height, pixelation).
export default class DoomView {
    constructor(scene, worldWidth, worldHeight) {
        this.scene = scene;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.active = false;

        // Weapon animation state (walking bob + chop swing).
        this.bobPhase = 0;
        this.swingProgress = 0;
        this._swinging = false;

        // Hit/break FX drawn on the overlay canvas (the Phaser particle system
        // is invisible in first-person, so DOOM gets its own). Each burst/text
        // is anchored to a WORLD point and re-projected every frame, so it stays
        // "over the tree" even as the player turns.
        this.fxBursts = [];
        this.fxTexts = [];

        // Tunable knobs (edited live by the sliders). Defaults dialed in by hand.
        this.settings = {
            fov: 120,         // horizontal field of view, degrees
            pitch: 20,        // horizon offset in internal px (look up/down)
            eyeHeight: 42,    // camera height above the floor (floor projection)
            spriteScale: 1.1, // global billboard size multiplier
            moveSpeed: 265,   // world px / second
            turnSpeed: 2.1,   // radians / second
            renderDist: 900,  // cull anything farther than this
            wallHeight: 40,   // world height of the boundary walls
            pixelation: 6,    // internal-res divisor (bigger = chunkier pixels)
            showWalls: 0      // 0/1 draw boundary walls
        };

        // Full-screen overlay canvas (its own 2D context, separate from Phaser).
        const canvas = document.createElement('canvas');
        canvas.id = 'doom-canvas';
        Object.assign(canvas.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            zIndex: '10', display: 'none', imageRendering: 'pixelated', pointerEvents: 'none'
        });
        document.body.appendChild(canvas);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this._buildControls();
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
        this.resize();
    }

    // Match the internal (chunky) resolution to the window / pixelation setting.
    resize() {
        const rs = Math.max(1, this.settings.pixelation);
        this.cssW = window.innerWidth;
        this.cssH = window.innerHeight;
        this.canvas.width = Math.max(120, Math.round(this.cssW / rs));
        this.canvas.height = Math.max(80, Math.round(this.cssH / rs));
        this.ctx.imageSmoothingEnabled = false;
    }

    setActive(on) {
        this.active = on;
        this.canvas.style.display = on ? 'block' : 'none';
        document.body.classList.toggle('mode-doom', on);
        if (!on) { this.fxBursts = []; this.fxTexts = []; } // drop stale FX on exit
    }

    // Spawn a particle burst anchored at a world point (e.g. a chopped tree).
    // colors: array of CSS colors; count: particle count; wz: world height.
    burstAtWorld(wx, wy, { colors = ['#ffffff'], count = 18, wz = 34 } = {}) {
        if (!this.active) return;
        const parts = [];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 12 + Math.random() * 52;           // internal-canvas px/sec
            parts.push({
                ox: 0, oy: 0,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 22,                 // slight upward bias
                life: 0,
                maxLife: 0.45 + Math.random() * 0.55,
                size: 1 + Math.floor(Math.random() * 3),
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
        this.fxBursts.push({ wx, wy, wz, parts });
    }

    // Floating rainbow hype word anchored above a world point.
    textAtWorld(wx, wy, word, { wz = 62 } = {}) {
        if (!this.active) return;
        this.fxTexts.push({ wx, wy, wz, word, life: 0, maxLife: 1.7, rise: 0 });
    }

    // Update + draw all canvas FX in screen space (called at the end of render,
    // where px/py/angle/focal/horizon are known).
    _drawFx(ctx, px, py, angle, focal, horizon, W, H, dt) {
        const s = this.settings;
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        const project = (wx, wy, wz) => {
            const dx = wx - px, dy = wy - py;
            const forward = dx * cosA + dy * sinA;
            if (forward < 12) return null;
            const right = -dx * sinA + dy * cosA;
            return {
                x: W / 2 + (right / forward) * focal,
                y: horizon + ((s.eyeHeight - wz) * focal) / forward,
                scale: focal / forward
            };
        };

        // --- Particle bursts ---
        for (let i = this.fxBursts.length - 1; i >= 0; i--) {
            const b = this.fxBursts[i];
            const o = project(b.wx, b.wy, b.wz);
            let alive = false;
            for (const p of b.parts) {
                if (p.life >= p.maxLife) continue;
                p.life += dt;
                p.vy += 70 * dt;              // gravity (internal px)
                p.ox += p.vx * dt;
                p.oy += p.vy * dt;
                if (p.life >= p.maxLife || !o) { if (p.life < p.maxLife) alive = true; continue; }
                alive = true;
                ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
                ctx.fillStyle = p.color;
                const sz = Math.max(1, Math.round(p.size * (0.6 + o.scale)));
                ctx.fillRect(Math.round(o.x + p.ox), Math.round(o.y + p.oy), sz, sz);
            }
            if (!alive) this.fxBursts.splice(i, 1);
        }
        ctx.globalAlpha = 1;

        // --- Floating rainbow hype words ---
        for (let i = this.fxTexts.length - 1; i >= 0; i--) {
            const tx = this.fxTexts[i];
            tx.life += dt;
            tx.rise += dt * 16;              // float up (internal px)
            if (tx.life >= tx.maxLife) { this.fxTexts.splice(i, 1); continue; }
            const o = project(tx.wx, tx.wy, tx.wz);
            if (!o) continue;
            const t = tx.life / tx.maxLife;
            const alpha = t < 0.12 ? t / 0.12 : (t > 0.7 ? (1 - t) / 0.3 : 1);
            const fontSize = Math.max(6, Math.min(18, Math.round(22 * o.scale)));
            const y = Math.round(o.y - tx.rise);
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.font = `${fontSize}px "Press Start 2P", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const wpx = ctx.measureText(tx.word).width;
            const grad = ctx.createLinearGradient(o.x - wpx / 2, 0, o.x + wpx / 2, 0);
            ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4']
                .forEach((c, k, arr) => grad.addColorStop(k / (arr.length - 1), c));
            ctx.lineWidth = Math.max(2, fontSize / 5);
            ctx.strokeStyle = '#000';
            ctx.strokeText(tx.word, o.x, y);
            ctx.fillStyle = grad;
            ctx.fillText(tx.word, o.x, y);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // px,py = player world position; angle = facing (radians); entities = array
    // of Phaser sprites to billboard; held = action button/key is down (swings
    // the axe or fires the axe gun, depending on tool); moving = player is
    // walking (drives the weapon bob); tool = 'axe' | 'axegun' | 'plank'.
    render(px, py, angle, entities, held, moving, tool = 'axe') {
        if (!this.active) return;
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const s = this.settings;

        // Focal length from FOV: screenX = focal * tan(rayAngle - facing).
        const focal = (W / 2) / Math.tan((s.fov * Math.PI / 180) / 2);
        const horizon = Math.round(H / 2 + s.pitch);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // --- Sky + floor ---
        let g = ctx.createLinearGradient(0, 0, 0, horizon);
        g.addColorStop(0, '#0a1830');
        g.addColorStop(1, '#26456e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, Math.max(0, horizon));
        g = ctx.createLinearGradient(0, horizon, 0, H);
        g.addColorStop(0, '#241a12');
        g.addColorStop(1, '#5a4327');
        ctx.fillStyle = g;
        ctx.fillRect(0, horizon, W, H - horizon);

        // --- Boundary walls via raycasting (one vertical slice per column) ---
        if (s.showWalls) {
            for (let col = 0; col < W; col++) {
                const rayAngle = angle + Math.atan2(col - W / 2, focal);
                const dx = Math.cos(rayAngle);
                const dy = Math.sin(rayAngle);
                // Player is inside the box, so each ray hits exactly one wall.
                const tx = dx > 0 ? (this.worldWidth - px) / dx : (dx < 0 ? -px / dx : Infinity);
                const ty = dy > 0 ? (this.worldHeight - py) / dy : (dy < 0 ? -py / dy : Infinity);
                const hitX = tx < ty;
                const t = Math.min(tx, ty);
                const perp = Math.max(1, t * Math.cos(rayAngle - angle)); // de-fisheye
                const sliceH = (s.wallHeight * focal) / perp;
                const baseY = horizon + (s.eyeHeight * focal) / perp;
                const topY = baseY - sliceH;
                // Fade to the floor color with distance; alternate wall shading.
                const fog = Math.max(0, 1 - perp / s.renderDist);
                const base = hitX ? 88 : 66;
                const c = Math.round(base * fog);
                ctx.fillStyle = `rgb(${c + 24},${c + 14},${c})`;
                ctx.fillRect(col, Math.max(topY, -1), 1, Math.max(1, baseY - topY));
            }
        }

        // --- Billboard sprites (far -> near so nearer ones draw on top) ---
        const drawList = [];
        for (const e of entities) {
            if (!e || !e.active || !e.visible) continue;
            // The website preview is anchored to the COMPUTER's world position
            // (not its own, which sits "north" of it in top-down coords and made
            // it sort behind the computer from some angles). Same depth + a tiny
            // bias keeps it drawn just after — i.e. always in front of — the
            // computer, no matter where the player stands.
            const isPreview = e === this.scene.computerPreview;
            const anchor = isPreview && this.scene.computer ? this.scene.computer : e;
            const dx = anchor.x - px;
            const dy = anchor.y - py;
            let forward = dx * cosA + dy * sinA;     // perpendicular depth
            if (isPreview) forward -= 0.5;
            if (forward < 12 || forward > s.renderDist) continue;
            const right = -dx * sinA + dy * cosA;
            drawList.push({ e, forward, right });
        }
        drawList.sort((a, b) => b.forward - a.forward);

        for (const { e, forward, right } of drawList) {
            const frame = e.frame;
            const src = frame.texture.getSourceImage();
            const dispH = e.displayHeight || (frame.cutHeight * (e.scaleY || 1));
            const dispW = e.displayWidth || (frame.cutWidth * (e.scaleX || 1));
            const isPreview = e === this.scene.computerPreview;
            // The website preview should read as a screen mounted on the computer:
            // scale it up and float it high over the computer face (mirrors 2D).
            const previewScale = isPreview ? 1.5 : 1;
            let spriteH = (dispH * s.spriteScale * focal * previewScale) / forward;
            let spriteW = spriteH * (dispW / dispH);
            const screenX = W / 2 + (right / forward) * focal;
            const baseY = horizon + (s.eyeHeight * focal) / forward;
            const drawX = screenX - spriteW / 2;
            let drawY = baseY - spriteH;
            // The computer is a very tall billboard and towers too high in
            // first-person — drop it down so it reads as grounded.
            if (e === this.scene.computer) drawY += spriteH * 0.22;
            // Lift the preview up onto the upper part of the computer's face and
            // keep it drawn in front (it sorts after the computer at the same spot).
            if (isPreview) drawY -= spriteH * 0.35;
            if (drawX + spriteW < 0 || drawX > W) continue;
            ctx.globalAlpha = e.alpha !== undefined ? e.alpha : 1;
            ctx.drawImage(
                src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
                drawX, drawY, spriteW, spriteH
            );
        }
        ctx.globalAlpha = 1;

        // --- Held weapon (axe) at the bottom, DOOM HUD style ---
        const dt = this.scene.game.loop.delta / 1000;
        this._drawWeapon(ctx, W, H, held, moving, dt, tool);

        // --- Crosshair ---
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(W / 2 - 4, horizon, 8, 1);
        ctx.fillRect(W / 2, horizon - 4, 1, 8);

        // --- Hit/break particles + floating hype words (chopping in DOOM) ---
        this._drawFx(ctx, px, py, angle, focal, horizon, W, H, dt);

        // --- Let the minimap show through ---
        // The minimap is a real Phaser camera rendered on the main game
        // canvas underneath this overlay, not a DOM element, so CSS z-index
        // can't lift just that corner above the raycaster. Instead, punch a
        // transparent hole in this canvas over the minimap's screen rect each
        // frame — whatever the minimap camera drew there shows through as-is
        // (same live top-down feed as 2D mode, not a separate recreation).
        const mm = this.scene.miniMap;
        if (mm) {
            const rs = Math.max(1, s.pixelation);
            const hx = Math.round(mm.x / rs), hy = Math.round(mm.y / rs);
            const hw = Math.round(mm.width / rs), hh = Math.round(mm.height / rs);
            ctx.clearRect(hx, hy, hw, hh);
        }
    }

    // Draws the currently-held weapon. The axe swings through a chop arc
    // while held (a fake-3D/2.5D swing rotated about the "hand" pivot); the
    // axe gun instead jitters with rapid recoil while firing, since it's
    // sprayed, not swung. `held` also drives the plank tool's bob-only pose
    // (no attack animation of its own — the axe icon just idles there).
    _drawWeapon(ctx, W, H, held, moving, dt, tool) {
        if (tool === 'axegun') { this._drawAxeGun(ctx, W, H, held, moving, dt); return; }

        const attacking = held; // axe (and plank, which reuses the idle axe pose)
        if (!this.scene.textures.exists('axe')) return;
        const frame = this.scene.textures.getFrame('axe', 0);
        if (!frame) return;
        const src = frame.texture.getSourceImage();

        const scale = Math.max(4, W / 60);
        const wpnW = frame.cutWidth * scale;
        const wpnH = frame.cutHeight * scale;

        // Walking bob (figure-8 sway), fading out when standing still.
        this.bobPhase += dt * (moving ? 9 : 4);
        const bobAmp = moving ? 1 : 0;
        const bobX = Math.cos(this.bobPhase) * wpnW * 0.08 * bobAmp;
        const bobY = Math.abs(Math.sin(this.bobPhase)) * wpnH * 0.07 * bobAmp;

        // Swing progress (0->1). Loops while held; if released mid-swing it
        // still plays out to rest so the chop never freezes half-way.
        const SWING = 0.32; // seconds per chop
        if (attacking) {
            this.swingProgress += dt / SWING;
            if (this.swingProgress >= 1) this.swingProgress -= 1;
            this._swinging = true;
        } else if (this._swinging) {
            this.swingProgress += dt / SWING;
            if (this.swingProgress >= 1) { this.swingProgress = 0; this._swinging = false; }
        }
        const p = this.swingProgress;
        // Horizontal slash: the axe sweeps across the screen from the RIGHT
        // side to the LEFT side over the course of one swing (then snaps back
        // to the right to start the next one while held).
        const sweep = Math.PI * 0.85;              // total angle travelled per swing
        const rot = -0.15 + (0.5 - p) * sweep;     // p:0 -> tilted right, p:1 -> tilted left
        const swX = (0.5 - p) * wpnW * 0.85;       // hand travels right -> left
        const swY = -Math.sin(p * Math.PI) * wpnH * 0.10; // small lift through the middle

        // Pivot at the "hand": bottom, right of centre.
        const handX = W * 0.66 + bobX + swX;
        const handY = H + bobY + swY;

        ctx.save();
        ctx.translate(handX, handY);
        ctx.rotate(rot);
        // Angle the axe INTO the scene — foreshortened + skewed so it reads as
        // held out ahead pointing at the enemies, not stood up flat against the
        // screen. (Tunable: c = lean, d = foreshorten.)
        ctx.transform(1, 0, -0.34, 0.82, 0, 0);
        ctx.scale(-1, 1); // mirror the axe across its Y axis (3D held-weapon flip)
        ctx.drawImage(
            src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
            -wpnW * 0.5, -wpnH, wpnW, wpnH
        );
        ctx.restore();
    }

    // Axe gun: bobs while walking same as the axe, but instead of a wind-up
    // swing arc it does fast, small, chaotic recoil kicks while firing —
    // reads as a spray, not a single chop.
    _drawAxeGun(ctx, W, H, firing, moving, dt) {
        if (!this.scene.textures.exists('axeGun')) return;
        const frame = this.scene.textures.getFrame('axeGun');
        if (!frame) return;
        const src = frame.texture.getSourceImage();

        // Frame is 30x20 (wider/shorter than the axe's 12x15) — scale it so
        // it reads at roughly the same on-screen size as the held axe.
        const scale = Math.max(4, W / 80);
        const wpnW = frame.cutWidth * scale;
        const wpnH = frame.cutHeight * scale;

        this.bobPhase += dt * (moving ? 9 : 4);
        const bobAmp = moving ? 1 : 0;
        const bobX = Math.cos(this.bobPhase) * wpnW * 0.06 * bobAmp;
        const bobY = Math.abs(Math.sin(this.bobPhase)) * wpnH * 0.05 * bobAmp;

        let kickX = 0, kickY = 0;
        if (firing) {
            this.gunRecoilPhase = (this.gunRecoilPhase || 0) + dt * 40;
            kickX = Math.sin(this.gunRecoilPhase * 1.7) * wpnW * 0.06;
            kickY = -Math.abs(Math.sin(this.gunRecoilPhase)) * wpnH * 0.14;
        } else {
            this.gunRecoilPhase = 0;
        }

        // Bottom-anchored pivot, same as the axe.
        const handX = W * 0.7 + bobX + kickX;
        const handY = H + bobY + kickY;

        ctx.save();
        ctx.translate(handX, handY);
        // Barrel angled up toward the crosshair (pointing away at the enemies),
        // plus a foreshortening skew — reads as aimed downrange, not held flat.
        ctx.rotate(-0.5);
        ctx.transform(1, 0, -0.3, 0.8, 0, 0);
        ctx.scale(-1, 1); // mirror to match the axe's held-weapon flip
        ctx.drawImage(
            src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
            -wpnW * 0.5, -wpnH, wpnW, wpnH
        );
        ctx.restore();
    }

    // Builds the live-slider rows as a plain (unpositioned) DOM node — it's
    // not shown anywhere on its own. The gear/settings panel embeds it
    // directly (see MainScene._renderSettings), so there's no separate
    // floating overlay to collide with the rest of the HUD in 3D anymore.
    _buildControls() {
        const panel = document.createElement('div');
        panel.id = 'doom-controls';
        Object.assign(panel.style, {
            font: '11px monospace', color: '#c6ff33', touchAction: 'manipulation'
        });

        const rows = [
            ['fov', 'FOV', 40, 120, 1],
            ['pitch', 'Look (pitch)', -160, 160, 1],
            ['eyeHeight', 'Eye height', 4, 140, 1],
            ['spriteScale', 'Sprite size', 0.2, 3, 0.05],
            ['moveSpeed', 'Move speed', 40, 500, 5],
            ['turnSpeed', 'Turn speed', 0.5, 6, 0.1],
            ['renderDist', 'Render dist', 300, 2500, 50],
            ['wallHeight', 'Wall height', 40, 700, 10],
            ['pixelation', 'Pixelation', 1, 6, 1],
            ['showWalls', 'Walls on', 0, 1, 1]
        ];
        for (const [key, label, min, max, step] of rows) {
            const row = document.createElement('label');
            Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', margin: '3px 0' });
            const name = document.createElement('span');
            name.textContent = label;
            name.style.flex = '0 0 82px';
            const input = document.createElement('input');
            input.type = 'range';
            input.min = min; input.max = max; input.step = step;
            input.value = this.settings[key];
            input.style.flex = '1';
            const val = document.createElement('span');
            val.textContent = this.settings[key];
            val.style.flex = '0 0 34px';
            val.style.textAlign = 'right';
            input.addEventListener('input', () => {
                this.settings[key] = parseFloat(input.value);
                val.textContent = input.value;
                if (key === 'pixelation') this.resize();
            });
            row.append(name, input, val);
            panel.appendChild(row);
        }
        this.panel = panel;
    }

    destroy() {
        window.removeEventListener('resize', this._onResize);
        this.canvas.remove();
        this.panel.remove();
    }
}
