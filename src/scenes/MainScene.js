import { isLikelyMobileDevice, createAnimations, subdomains, detectDevicePerformance, monitorFPS, getPerformanceRecommendations } from '../utils/helpers.js';
import GhostEntity from '../entities/GhostEntity.js';
import SoundManager from '../utils/SoundManager.js';
import DoomView from '../utils/DoomView.js';

let downF;
let playerNearTree = false;

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.axeRotations = 0;
        // Total trees ever chopped — persisted across visits (see cutTree).
        this.logs = 0;
        try {
            const saved = parseInt(localStorage.getItem('treesCut'), 10);
            if (!isNaN(saved)) this.logs = saved;
        } catch (e) {}
        this.canChop = true; // Cooldown flag for axe
        this.lastDirection = 'none'; // Track player's last direction
        this.miniMap = null;
        this.acceleration = 15;
        this.maxSpeed = 200;
        this.friction = 0.9;
        this.orbActivated = false;
        this.touchTarget = { x: 0, y: 0 };
        this.movementTimer = null;
        this.mobilePlayerMove = false;
        this.ghosts = [];
        this.playerMoved = false;
        this.is3D = false;
        this.doomAngle = 0; // player facing direction in first-person (DOOM) mode
        this.axeWasActive = false;
        this.lastSwingAt = 0;
        this.activeSubPage = null;

        // Stable DOM HUD state (replaces the buggy floating F/ESC sprites).
        this.actionHeld = false;               // on-screen ⚔ button / F held
        this.doomInput = { left: false, right: false, fwd: false, back: false };

        // Hearts / hidden-bomb knockback.
        this.maxHealth = 3;
        this.health = 3;
        this._hearts = [];               // DOM heart elements (top-right HUD)
        this._knockbackUntil = 0;        // time.now until which bomb-launch owns movement

        // OHS sub-world (in-place swap): the 6 projects live here as a 2-column
        // image grid, reachable by chopping the OHS school in the main world.
        this.inOhs = false;
        this.ohsChops = 0;
        this.ohsProjectSprites = [];     // the 6 project preview images
        this.ohsLabels = [];             // project name texts
        this.ohsExitSign = null;         // bottom-right exit sign
        this.ohsGhosts = [];             // roaming decorative ghosts inside OHS
        this.ohsColliders = [];          // physics overlaps/colliders to tear down on exit
        this.ohsProjects = [
            { key: 'ohs-key-club', label: 'key club' },
            { key: 'ohs-chess-club', label: 'chess club' },
            { key: 'nts-study-buddy', label: 'nts study buddy' },
            { key: 'checkers-game', label: 'checkers game' },
            { key: 'old-portfolio', label: 'old portfolio' },
            { key: 'cyber-insurance-model', label: 'cyber insurance model' },
        ];
        this.tutorialShown = false;
        this._doomIntroShown = false;
        this._toastTimer = null;

        // Performance monitoring
        this.performanceData = detectDevicePerformance();
        this.fpsMonitor = null;
        this.currentFPS = 60;
        this.performanceWarnings = [];
    }

    preload() {
        this.load.spritesheet('me', 'assets/me-sprite.png', { frameWidth: 13, frameHeight: 15 });
        this.load.image('tree', 'assets/tree.png');
        this.load.spritesheet('axe', 'assets/axe.png', { frameWidth: 12, frameHeight: 15 });
        this.load.spritesheet('computer', 'assets/computer.png', { frameWidth: 30, frameHeight: 26 });
        this.load.image('plank', 'assets/plank.png');
        this.load.spritesheet('orb', 'assets/orb.png', { frameWidth: 26, frameHeight: 30 });
        this.load.spritesheet('ghost', 'assets/ghost.png', { frameWidth: 18, frameHeight: 30 });
        this.load.spritesheet('hidden-bomb', 'assets/hidden-bomb.png', { frameWidth: 27, frameHeight: 15 });
        this.load.spritesheet('explosive', 'assets/explosive.png', { frameWidth: 34, frameHeight: 40 });
        this.load.image('instructions', 'assets/instructions.png');

        // Image previews (replace the old live iframes) + OHS-world art.
        this.load.image('personal-website', 'assets/subdomains/personal-website.png');
        this.load.image('ohs-school', 'assets/OHS.png');
        this.load.image('exit-sign', 'assets/exit.png');
        this.ohsProjects.forEach(p => this.load.image(p.key, `assets/subdomains/${p.key}.png`));
    }

    create() {
        const worldWidth = 2000;
        const worldHeight = 2000;

        this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

        this.sounds = new SoundManager();

        // Runtime-generated textures for the hit/break particles + the rainbow
        // "RADICAL!" text backdrop (no art assets needed).
        this.createFxTextures();

        // First-person raycasting renderer (overlay canvas). The Phaser world
        // keeps simulating underneath; DoomView paints the DOOM view on top.
        this.doomView = new DoomView(this, worldWidth, worldHeight);

        // Add objects in the center of the world
        this.computer = this.physics.add.staticSprite(worldWidth / 2, worldHeight / 2, 'computer', 0).setScale(15).refreshBody();
        this.orb = this.physics.add.staticSprite(worldWidth / 1.2, worldHeight / 3.5, 'orb', 0).setScale(4).refreshBody();
        this.player = this.physics.add.sprite(worldWidth / 2 - 290, worldHeight / 2, 'me', 0).setScale(3).refreshBody();
        this.player.setCollideWorldBounds(true);
        this.axe = this.physics.add.sprite(0, 0, 'axe', 0).setVisible(false).setScale(5).refreshBody();
        this.axe.body.enable = false; // only active mid-swing, so hidden axe can't chop things
        // Scatter 20 hidden bombs across the field. Touch one and it blows a
        // heart + launches the player (see triggerExplosion). Kept clear of the
        // player's spawn / the central computer so you don't blow up instantly.
        this.bombs = this.physics.add.group();
        const BOMB_COUNT = 10;
        for (let i = 0; i < BOMB_COUNT; i++) {
            const bx = Phaser.Math.Between(150, worldWidth - 150);
            const by = Phaser.Math.Between(150, worldHeight - 150);
            if (Phaser.Math.Distance.Between(bx, by, worldWidth / 2, worldHeight / 2) < 350) { i--; continue; }
            this.bombs.create(bx, by, 'hidden-bomb').setImmovable(true).setScale(3).refreshBody();
        }

        this.cameras.main.startFollow(this.player);

        // Mini map camera (created early so extrusion layers can be ignored by it)
        const miniMapWidth = 150;
        this.miniMap = this.cameras.add(
            this.scale.width - miniMapWidth - 20,
            20,
            miniMapWidth,
            miniMapWidth
        ).setZoom(0.1).startFollow(this.player, true, 0.1, 0.1).setBackgroundColor(0x002244).setBounds(0, 0, worldWidth, worldHeight);

        // Touch input (registered once — was previously re-registered every frame)
        this.touchTarget = { x: this.player.x, y: this.player.y };
        this.input.on('pointerdown', this.handleTouchInput, this);
        this.input.on('pointerdown', () => {
            if (!isLikelyMobileDevice()) return;
            this.mobilePlayerMove = true;
            clearTimeout(this.movementTimer);
            this.movementTimer = setTimeout(() => {
                this.mobilePlayerMove = false;
                if (this.player && this.player.body) {
                    this.player.setVelocity(0, 0);
                    this.player.play('idle-me', true);
                    this.lastDirection = 'none';
                }
            }, 4000);
        });

        // Mouse click swings the axe in BOTH 2D and DOOM (mirrors the on-screen
        // CHOP button's `actionHeld`). Restricted to the mouse so a tap on a
        // touch device still means "walk there" / uses the CHOP button instead.
        const mouseHold = (pointer, held) => {
            // wasTouch is false for a mouse, true for a finger — so this swings
            // on mouse click but leaves touch taps for move / the CHOP button.
            if (!pointer || !pointer.wasTouch) this.actionHeld = held;
        };
        this.input.on('pointerdown', (p) => mouseHold(p, true));
        this.input.on('pointerup', (p) => mouseHold(p, false));
        this.input.on('pointerupoutside', (p) => mouseHold(p, false));
        this.input.on('gameout', () => { this.actionHeld = false; });

        // create animations
        createAnimations(this, 'me');
        this.anims.create({
            key: 'blink',
            frames: this.anims.generateFrameNumbers('computer', { start: 0, end: 1 }),
            frameRate: 2,
            repeat: -1
        });
        this.anims.create({
            key: 'aura',
            frames: this.anims.generateFrameNumbers('orb', { start: 0, end: 4 }),
            frameRate: 4,
            repeat: -1
        });
        this.anims.create({
            key: 'bomb-idle',
            frames: this.anims.generateFrameNumbers('hidden-bomb', { start: 0, end: 3 }),
            frameRate: 6,
            repeat: -1
        });
        this.anims.create({
            key: 'explode',
            frames: this.anims.generateFrameNumbers('explosive', { start: 0, end: 3 }),
            frameRate: 8,
            repeat: 0
        });
        this.anims.create({
            key: 'ghost_float',
            frames: this.anims.generateFrameNumbers('ghost', { start: 0, end: 2 }),
            frameRate: 5,
            repeat: -1,
        });

        // play animations
        this.orb.anims.play('aura');
        this.computer.anims.play('blink');
        this.bombs.getChildren().forEach(b => b.anims.play('bomb-idle'));

        // Ambient decorative ghosts
        this.time.addEvent({
            delay: 10000,
            callback: () => this.spawnGhost(),
            callbackScope: this,
            loop: true
        });

        // Init object variables
        this.computerChops = 0;
        this.orbChops = 0;

        // The projects no longer wander the main world as subdomain ghosts —
        // they live in the OHS sub-world now. `this.ghosts` stays (empty here)
        // for the ambient decorative ghosts + shared code paths.
        this.ghosts = [];

        // Personal-site preview: a static image on the computer screen (replaces
        // the old live iframe; billboards in 3D too). Chop the computer 3x to open.
        // Sit the preview higher and larger so it covers the computer's screen face
        // (the computer is setScale(15) → ~450×390 on screen).
        this.computerPreview = this.add.image(this.computer.x, this.computer.y - 95, 'personal-website')
            .setScale(0.1).setDepth(6);
        this.miniMap.ignore(this.computerPreview);

        // The OHS high school in the bottom-left. Chop it 3x to enter the OHS world.
        this.ohsSchool = this.physics.add.staticSprite(340, worldHeight - 320, 'ohs-school').setScale(6).refreshBody();

        // Spawn trees without overlap
        this.trees = this.physics.add.staticGroup();
        for (let i = 0; i < 100; i++) {
            let x, y;
            let overlap;
            do {
                x = Phaser.Math.Between(0, worldWidth);
                y = Phaser.Math.Between(0, worldHeight);
                overlap = false;
                this.trees.getChildren().forEach(tree => {
                    if (Phaser.Math.Distance.Between(x, y, tree.x, tree.y) < 80) {
                        overlap = true;
                    }
                });
            } while (overlap);

            const tree = this.trees.create(x, y, 'tree').setScale(3).refreshBody();
            tree.chopProgress = 0;
        }

        // Clear trees that spawned too close to the computer, orb, or OHS school
        this.trees.getChildren().slice().forEach(tree => {
            if (Phaser.Math.Distance.Between(tree.x, tree.y, this.computer.x, this.computer.y) < 350) {
                tree.destroy();
                return;
            }
            if (Phaser.Math.Distance.Between(tree.x, tree.y, this.orb.x, this.orb.y) < 150) {
                tree.destroy();
                return;
            }
            if (Phaser.Math.Distance.Between(tree.x, tree.y, this.ohsSchool.x, this.ohsSchool.y) < 340) {
                tree.destroy();
                return;
            }
        });

        // Collisions
        this.physics.add.collider(this.player, this.trees);
        this.physics.add.collider(this.player, this.computer);
        this.physics.add.collider(this.player, this.orb);
        this.physics.add.collider(this.player, this.ohsSchool);
        this._bombOverlap = this.physics.add.overlap(this.player, this.bombs, this.triggerExplosion, null, this);

        // Overlap detection instead of collider for axe
        this.physics.add.overlap(this.axe, this.trees, this.cutTree, null, this);
        this.physics.add.overlap(this.axe, this.computer, this.hitComputer, null, this);
        this.physics.add.overlap(this.axe, this.orb, this.hitOrb, null, this);
        this.physics.add.overlap(this.axe, this.ohsSchool, this.hitOhs, null, this);

        // Keyboard input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = {
            W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };
        downF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

        // Show instructions at the center of the screen, scaled to fit small screens
        const instrSource = this.textures.get('instructions').getSourceImage();
        const instrScale = Math.min(3, (this.scale.width * 0.9) / instrSource.width, (this.scale.height * 0.9) / instrSource.height);
        this.instructionsImage = this.add.image(
            this.scale.width / 2,
            this.scale.height / 2,
            'instructions'
        ).setScrollFactor(0).setDepth(10000).setScale(instrScale);
        this.playerMoved = false;

        // Performance monitoring setup
        console.log('Device Performance Analysis:', this.performanceData);
        this.performanceWarnings = getPerformanceRecommendations(this.performanceData);
        if (this.performanceWarnings.length > 0) {
            console.warn('Performance Recommendations:', this.performanceWarnings);
        }
        this.fpsMonitor = monitorFPS(this, (fps) => {
            this.currentFPS = fps;
            if (fps < 30 && !this.performanceWarnings.includes('Low FPS detected')) {
                this.performanceWarnings.push('Low FPS detected');
                console.warn(`Low FPS detected: ${fps}. Consider performance optimizations.`);
            }
        });

        this.logText = this.add.text(
            this.scale.width / 2,
            this.scale.height - 30,
            '',
            {
                font: '16px monospace',
                fill: '#ffffff'
            }
        ).setOrigin(0.5)
         .setScrollFactor(0)
         .setDepth(1000);

        // Performance display (toggle with P key)
        this.perfText = this.add.text(
            10,
            10,
            '',
            {
                font: '12px monospace',
                fill: '#ffff00'
            }
        ).setScrollFactor(0).setDepth(1000).setVisible(false);
        this.showPerf = false;
        this.perfKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);

        // (The computer's personal-site preview is now a Phaser image sprite —
        // see this.computerPreview above — not a DOM iframe.)

        // Make minimap ignore UI elements
        this.miniMap.ignore([this.logText, this.perfText, this.instructionsImage]);

        this.createModeToggle();
        this.createHUD();

        // Single global close handlers for sub-pages (was previously re-added
        // per open, leaking listeners and closing the wrong/stale iframe)
        this._messageHandler = (e) => {
            if (e.data === 'ESCAPE_PRESSED') this.closeSubPage();
        };
        window.addEventListener('message', this._messageHandler);
        this._escKeyHandler = (e) => {
            if (e.code === 'Escape') this.closeSubPage();
        };
        document.addEventListener('keydown', this._escKeyHandler);

        // Reposition screen-anchored UI when the window is resized
        this.scale.on('resize', this.handleResize, this);

        this.events.once('shutdown', () => {
            window.removeEventListener('message', this._messageHandler);
            document.removeEventListener('keydown', this._escKeyHandler);
            this.scale.off('resize', this.handleResize, this);
            this.destroyHUD();
        });
    }

    handleResize(gameSize) {
        const width = gameSize.width;
        const height = gameSize.height;

        if (this.miniMap) {
            this.miniMap.setPosition(width - 170, 20);
        }
        if (this.logText) {
            this.logText.setPosition(width / 2, height - 30);
        }
        if (this.instructionsImage && this.instructionsImage.visible) {
            const instrSource = this.textures.get('instructions').getSourceImage();
            const instrScale = Math.min(3, (width * 0.9) / instrSource.width, (height * 0.9) / instrSource.height);
            this.instructionsImage.setPosition(width / 2, height / 2).setScale(instrScale);
        }
        // The DOOM overlay tracks the window on its own (see DoomView.resize).
        // Entity previews + computer iframe recalc from live sizes every frame,
        // so they realign automatically on the next update.
    }

    createModeToggle() {
        let btn = document.getElementById('mode-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'mode-toggle';
            document.body.appendChild(btn);
        }
        btn.textContent = '2D';
        btn.setAttribute('aria-label', 'Toggle DOOM 3D first-person view');
        btn.addEventListener('click', () => {
            this.is3D = !this.is3D;
            this.sounds.toggle(this.is3D);
            if (this.is3D) {
                // Start facing the computer so there's something to look at.
                this.doomAngle = Math.atan2(this.computer.y - this.player.y, this.computer.x - this.player.x);
            } else {
                this.player.setVelocity(0, 0);
                this.axe.setVisible(false);
                this.axe.body.enable = false;
            }
            this.doomView.setActive(this.is3D);

            if (this.is3D) {
                this.setActionHint(false);
                // First time in first-person: explain the different controls.
                if (!this._doomIntroShown) {
                    this._doomIntroShown = true;
                    const touch = this.isTouch();
                    this.showToast(
                        touch ? 'FIRST-PERSON MODE\n◄ ► turn   ▲ ▼ walk\nHold CHOP to swing'
                              : 'FIRST-PERSON MODE\n← → turn   ↑ ↓ walk\nHold F to chop',
                        4200
                    );
                }
            }

            // Clean card-flip; swap the label at the edge-on midpoint so it
            // reads as the button "turning" between 2D and 3D.
            const label = this.is3D ? '3D' : '2D';
            btn.classList.remove('flipping');
            void btn.offsetWidth; // restart the flip animation
            btn.classList.add('flipping');
            setTimeout(() => { btn.textContent = label; }, 150);
        });
        this.modeToggleBtn = btn;
    }

    // Touch-capable device? (mobile UA, or a touchscreen laptop/tablet.)
    isTouch() {
        return isLikelyMobileDevice() || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    }

    // Build the stable DOM HUD: the universal ⚔ action button, the DOOM
    // first-person touch D-pad, a "?" help button, the tutorial popup and a
    // transient toast. All fixed-position, so nothing jitters like the old
    // per-frame-repositioned F/ESC sprites did.
    createHUD() {
        if (this.isTouch()) document.body.classList.add('touch');
        this._hudEls = [];

        // --- Universal action / chop button (2D + DOOM, mouse + touch) ---
        const action = document.createElement('button');
        action.id = 'action-btn';
        action.className = 'pixel-hud-btn';
        action.setAttribute('aria-label', 'Chop / interact');
        action.innerHTML = '<span class="axe-icon"></span><span class="action-label">CHOP</span>';
        const press = (e) => { e.preventDefault(); this.actionHeld = true; action.classList.add('pressed'); };
        const release = (e) => { if (e) e.preventDefault(); this.actionHeld = false; action.classList.remove('pressed'); };
        action.addEventListener('pointerdown', press);
        action.addEventListener('pointerup', release);
        action.addEventListener('pointercancel', release);
        action.addEventListener('pointerleave', release);
        document.body.appendChild(action);
        this._actionBtn = action;
        this._hudEls.push(action);

        // --- DOOM first-person movement pad (shown via CSS on touch + 3D) ---
        const pad = document.createElement('div');
        pad.id = 'doom-touch';
        const dirs = [
            ['fwd', '▲', 'Walk forward'],
            ['left', '◄', 'Turn left'],
            ['right', '►', 'Turn right'],
            ['back', '▼', 'Walk back']
        ];
        for (const [dir, glyph, label] of dirs) {
            const b = document.createElement('button');
            b.className = 'pixel-hud-btn';
            b.dataset.doom = dir;
            b.textContent = glyph;
            b.setAttribute('aria-label', label);
            const on = (e) => { e.preventDefault(); this.doomInput[dir] = true; b.classList.add('pressed'); };
            const off = (e) => { if (e) e.preventDefault(); this.doomInput[dir] = false; b.classList.remove('pressed'); };
            b.addEventListener('pointerdown', on);
            b.addEventListener('pointerup', off);
            b.addEventListener('pointercancel', off);
            b.addEventListener('pointerleave', off);
            pad.appendChild(b);
        }
        document.body.appendChild(pad);
        this._doomPad = pad;
        this._hudEls.push(pad);

        // --- "?" help button: reopens the tutorial ---
        const help = document.createElement('button');
        help.id = 'help-btn';
        help.className = 'pixel-hud-btn';
        help.textContent = '?';
        help.setAttribute('aria-label', 'How to play');
        help.addEventListener('click', () => this.showTutorial());
        document.body.appendChild(help);
        this._helpBtn = help;
        this._hudEls.push(help);

        // --- Music on/off toggle (bottom-left, right next to the "?") ---
        const music = document.createElement('button');
        music.id = 'music-btn';
        music.className = 'pixel-hud-btn';
        music.innerHTML = '<span class="music-icon"></span>';
        music.setAttribute('aria-label', 'Toggle music');
        // Reflect the current desired state (music starts on first user gesture).
        music.classList.toggle('off', !this.sounds.musicWanted);
        music.addEventListener('click', () => {
            const on = this.sounds.toggleMusic();
            music.classList.toggle('off', !on);
        });
        document.body.appendChild(music);
        this._musicBtn = music;
        this._hudEls.push(music);

        // --- Exit button: clears the saved "who are you?" choice + reloads, so
        // the visitor gate shows again. Sits right after the music button. ---
        const exit = document.createElement('button');
        exit.id = 'exit-btn';
        exit.className = 'pixel-hud-btn';
        exit.textContent = 'exit';
        exit.setAttribute('aria-label', 'Exit and reset visitor choice');
        exit.addEventListener('click', () => {
            try { localStorage.removeItem('visitorType'); } catch (e) {}
            window.location.reload();
        });
        document.body.appendChild(exit);
        this._exitBtn = exit;
        this._hudEls.push(exit);

        // --- Player hearts (top-right, just left of the minimap camera) ---
        const hearts = document.createElement('div');
        hearts.id = 'hearts-hud';
        this._hearts = [];
        this.health = this.maxHealth;
        for (let i = 0; i < this.maxHealth; i++) {
            const h = document.createElement('div');
            h.className = 'heart';
            hearts.appendChild(h);
            this._hearts.push(h);
        }
        document.body.appendChild(hearts);
        this._heartsHud = hearts;
        this._hudEls.push(hearts);

        // --- Tree-cut score (persisted in localStorage), left of the hearts ---
        const score = document.createElement('div');
        score.id = 'score-hud';
        const scoreIcon = document.createElement('div');
        scoreIcon.className = 'score-icon';
        const scoreVal = document.createElement('span');
        scoreVal.className = 'score-val';
        scoreVal.textContent = this.logs;
        score.appendChild(scoreIcon);
        score.appendChild(scoreVal);
        document.body.appendChild(score);
        this._scoreHud = score;
        this._scoreVal = scoreVal;
        this._hudEls.push(score);

        // --- Tutorial popup + toast ---
        this._buildTutorial();
        const toast = document.createElement('div');
        toast.id = 'hud-toast';
        document.body.appendChild(toast);
        this._toast = toast;
        this._hudEls.push(toast);

        document.body.classList.add('hud-ready');

        // Show the controls tutorial once on entry.
        if (!this.tutorialShown) this.showTutorial();
    }

    _buildTutorial() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        const touch = this.isTouch();

        const axe = '<span class="axe-icon"></span>';
        const moveKey = touch ? 'TAP' : 'WASD';
        const moveText = touch ? 'Tap anywhere on the ground to walk there' : 'Move with WASD or the arrow keys';
        const chopText = touch
            ? `Stand next to a tree, ghost, computer or orb and hold the ${axe} <b>CHOP</b> button. It glows when you’re close enough.`
            : `Stand next to something and hold <b>F</b> (or the ${axe} button) to chop. It glows when you’re in range.`;
        const doomText = touch
            ? 'Tap <b>3D</b> for first-person. Use the <b>&#9650;&#9660;&#9668;&#9658;</b> pad to turn &amp; walk, then hold CHOP.'
            : 'Tap <b>3D</b> for first-person DOOM view. Turn/walk with the arrow keys, chop with <b>F</b>.';
        const escText = touch
            ? 'Chopping a target opens its page. Tap the <b>ESC</b> button (bottom-right) to come back.'
            : 'Chopping a target opens its page. Press <b>ESC</b> (or the bottom-right button) to come back.';

        overlay.innerHTML = `
            <div class="tutorial-card">
                <h2>${axe} HOW TO PLAY</h2>
                <div class="tutorial-row"><span class="tutorial-key">${moveKey}</span><span>${moveText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">${axe}</span><span>${chopText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">3D</span><span>${doomText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">ESC</span><span>${escText}</span></div>
                <button class="tutorial-start">LET'S GO</button>
                <div class="tutorial-note">Chop the trees, ghosts, computer &amp; orb to explore Bruno’s projects. Reopen this anytime with the <b>?</b> button.</div>
            </div>`;
        overlay.querySelector('.tutorial-start').addEventListener('click', () => this.hideTutorial());
        document.body.appendChild(overlay);
        this._tutorial = overlay;
        this._hudEls.push(overlay);
    }

    showTutorial() {
        if (this._tutorial) this._tutorial.classList.add('open');
        this._startTutorialParticles();
    }

    hideTutorial() {
        this.tutorialShown = true;
        if (this._tutorial) this._tutorial.classList.remove('open');
        this._stopTutorialParticles();
        // Dismissing the tutorial counts as "ready to play": drop the little
        // move-to-begin image and unblock gameplay immediately.
        if (this.instructionsImage) this.instructionsImage.setVisible(false);
        this.playerMoved = true;
    }

    // Toggle the "in range" state of the action button. While active it streams
    // small green particles out of the button instead of a CSS glow.
    setActionHint(on) {
        if (!this._actionBtn) return;
        this._actionBtn.classList.toggle('hint', !!on);
        if (on) this._spawnAxeParticle();
    }

    // Stream little pixel particles out of the action button while it glows.
    // Throttled, but spawns a small cluster each tick so the button really
    // erupts with pixels when you're in range. Each particle self-removes.
    _spawnAxeParticle() {
        const now = performance.now();
        if (now - (this._lastAxeParticle || 0) < 45) return;
        this._lastAxeParticle = now;

        const r = this._actionBtn.getBoundingClientRect();
        // Mostly the signature green, with the occasional bright pixel for pop.
        const colors = ['#c6ff33', '#c6ff33', '#c6ff33', '#eaffb0', '#ffe500', '#7ea82a'];
        const cluster = 2 + Math.floor(Math.random() * 2); // 2-3 per tick
        for (let i = 0; i < cluster; i++) {
            const p = document.createElement('div');
            p.className = 'axe-particle';
            const size = 3 + Math.floor(Math.random() * 5);
            p.style.width = p.style.height = `${size}px`;
            const col = colors[Math.floor(Math.random() * colors.length)];
            p.style.background = col;
            p.style.boxShadow = `0 0 4px ${col}`;
            p.style.left = `${r.left + r.width * 0.5 + (Math.random() - 0.5) * r.width * 0.9}px`;
            p.style.top = `${r.top + r.height * 0.5 + (Math.random() - 0.5) * r.height * 0.6}px`;
            p.style.setProperty('--dx', `${((Math.random() - 0.5) * 110).toFixed(0)}px`);
            p.style.setProperty('--dy', `${(-50 - Math.random() * 90).toFixed(0)}px`);
            p.addEventListener('animationend', () => p.remove());
            document.body.appendChild(p);
        }
    }

    // Continuously spray bright pixel sparks around the border of the tutorial
    // card while it's open, so the popup looks like it's shining.
    _startTutorialParticles() {
        this._stopTutorialParticles();
        const spawn = () => {
            if (!this._tutorial || !this._tutorial.classList.contains('open')) return;
            const card = this._tutorial.querySelector('.tutorial-card');
            if (!card) return;
            const r = card.getBoundingClientRect();
            for (let i = 0; i < 3; i++) this._spawnTutorialSpark(r);
        };
        this._tutorialFxTimer = setInterval(spawn, 85);
        spawn(); // immediate first burst
    }

    _stopTutorialParticles() {
        clearInterval(this._tutorialFxTimer);
        this._tutorialFxTimer = null;
    }

    // One pixel spark at a random point on the card's perimeter, drifting
    // outward (along the edge normal) while it twinkles. Self-removes.
    _spawnTutorialSpark(r) {
        const colors = ['#c6ff33', '#ffe500', '#ff9500', '#00c7ff', '#ff2dd4', '#ffffff'];
        const per = 2 * (r.width + r.height);
        let d = Math.random() * per;
        let x, y, nx, ny;
        if (d < r.width) { x = r.left + d; y = r.top; nx = 0; ny = -1; }
        else if (d < r.width + r.height) { x = r.right; y = r.top + (d - r.width); nx = 1; ny = 0; }
        else if (d < 2 * r.width + r.height) { x = r.right - (d - r.width - r.height); y = r.bottom; nx = 0; ny = 1; }
        else { x = r.left; y = r.bottom - (d - 2 * r.width - r.height); nx = -1; ny = 0; }

        const p = document.createElement('div');
        p.className = 'tutorial-spark';
        const size = 3 + Math.floor(Math.random() * 5);
        p.style.width = p.style.height = `${size}px`;
        const col = colors[Math.floor(Math.random() * colors.length)];
        p.style.background = col;
        p.style.boxShadow = `0 0 6px ${col}`;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        // Outward drift along the border normal, plus a little tangential spread.
        const dist = 14 + Math.random() * 34;
        const spread = (Math.random() - 0.5) * 30;
        p.style.setProperty('--dx', `${(nx * dist + (ny !== 0 ? spread : 0)).toFixed(0)}px`);
        p.style.setProperty('--dy', `${(ny * dist + (nx !== 0 ? spread : 0)).toFixed(0)}px`);
        p.addEventListener('animationend', () => p.remove());
        document.body.appendChild(p);
    }

    // Blow up one heart (the right-most one still alive) when a hidden bomb is
    // touched: pop-and-shrink animation on the heart + a burst of red pixels.
    loseHeart() {
        if (!this._hearts || !this._hearts.length) return;
        let idx = -1;
        for (let i = this._hearts.length - 1; i >= 0; i--) {
            if (!this._hearts[i].classList.contains('lost')) { idx = i; break; }
        }
        if (idx === -1) return;                 // already at zero
        const heart = this._hearts[idx];
        this.health = Math.max(0, this.health - 1);

        // Red pixel particles bursting from the heart's on-screen position.
        const r = heart.getBoundingClientRect();
        this._spawnHeartParticles(r.left + r.width / 2, r.top + r.height / 2);

        // Explode the heart, then leave it as a dim "empty" slot.
        heart.classList.add('exploding');
        setTimeout(() => {
            heart.classList.remove('exploding');
            heart.classList.add('lost');
        }, 420);

        // Out of hearts → the player is dead. Let the final heart pop + the
        // launch play out, then reload the whole site for a fresh start.
        if (this.health === 0) {
            setTimeout(() => window.location.reload(), 1100);
        }
    }

    refillHearts() {
        this.health = this.maxHealth;
        this._hearts.forEach(h => h.classList.remove('lost', 'exploding'));
    }

    // Red DOM pixel burst radiating from a screen point (used by loseHeart).
    _spawnHeartParticles(x, y) {
        const colors = ['#ff2b2b', '#ff5555', '#ff8080', '#c40000', '#ffd0d0'];
        for (let i = 0; i < 18; i++) {
            const p = document.createElement('div');
            p.className = 'heart-particle';
            const size = 3 + Math.floor(Math.random() * 5);
            p.style.width = p.style.height = `${size}px`;
            const col = colors[Math.floor(Math.random() * colors.length)];
            p.style.background = col;
            p.style.boxShadow = `0 0 5px ${col}`;
            p.style.left = `${x}px`;
            p.style.top = `${y}px`;
            const ang = Math.random() * Math.PI * 2;
            const dist = 24 + Math.random() * 60;
            p.style.setProperty('--dx', `${(Math.cos(ang) * dist).toFixed(0)}px`);
            p.style.setProperty('--dy', `${(Math.sin(ang) * dist + 20).toFixed(0)}px`);
            p.addEventListener('animationend', () => p.remove());
            document.body.appendChild(p);
        }
    }

    // Clear all held HUD input (used when the HUD is hidden mid-hold, so its
    // buttons can never deliver the matching pointerup).
    resetHeldInput() {
        this.actionHeld = false;
        this.doomInput.left = this.doomInput.right = this.doomInput.fwd = this.doomInput.back = false;
        if (this._actionBtn) this._actionBtn.classList.remove('pressed', 'hint');
        if (this._doomPad) this._doomPad.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
    }

    // Brief self-dismissing pixel message near the top of the screen.
    showToast(message, ms = 3000) {
        if (!this._toast) return;
        this._toast.textContent = message;      // \n in the message wraps via white-space
        this._toast.style.whiteSpace = 'pre-line';
        this._toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => this._toast.classList.remove('show'), ms);
    }

    destroyHUD() {
        clearTimeout(this._toastTimer);
        this._stopTutorialParticles();
        if (this._hudEls) this._hudEls.forEach(el => el.remove());
        this._hudEls = [];
        document.body.classList.remove('hud-ready', 'touch');
    }

    // First-person controls: left/right turn, forward/back walk along the facing
    // direction. Runs instead of the top-down movement while in DOOM mode.
    updateDoomMovement() {
        const s = this.doomView.settings;
        const dt = this.game.loop.delta / 1000;

        // Bomb knockback owns movement while it's sliding out (see triggerExplosion).
        if (this.time.now < this._knockbackUntil) {
            this.player.setVelocity(this.player.body.velocity.x * 0.92, this.player.body.velocity.y * 0.92);
            return;
        }
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
        if (mag > 0) this.player.setVelocity((vx / mag) * s.moveSpeed, (vy / mag) * s.moveSpeed);
        else this.player.setVelocity(0, 0);
    }

    // One full DOOM frame: move ghosts, drive first-person controls + attack,
    // then paint the raycast view. Replaces the whole top-down update() path.
    updateDoomFrame() {
        if (this.inOhs) this.ohsGhosts.forEach(g => this._wanderGhost(g, this.game.loop.delta));
        this.updateDoomMovement();

        const speedMag = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y);
        if (speedMag > 40) this.sounds.footstep();

        // Attack: put the (invisible) axe body just ahead of the player so the
        // existing chop/overlap handlers fire on whatever we're facing.
        // Driven by the F key (desktop) or the on-screen ⚔ button (touch).
        const attacking = downF.isDown || this.actionHeld;
        if (attacking) {
            const reach = 46;
            this.axe.setPosition(this.player.x + Math.cos(this.doomAngle) * reach, this.player.y + Math.sin(this.doomAngle) * reach);
            this.axe.setVisible(false);
            this.axe.body.enable = true;
            if (!this.axeWasActive) this.sounds.swing();
        } else {
            this.axe.body.enable = false;
            this.axe.setPosition(0, 0);
        }
        this.axeWasActive = attacking;

        this.doomView.render(this.player.x, this.player.y, this.doomAngle, this._doomEntities(), attacking, speedMag > 40);

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
    }

    // Billboard list for the current world (3D). Main: trees + computer (+ its
    // preview) + orb + live bombs. OHS: the project images + exit sign + ghosts.
    _doomEntities() {
        if (this.inOhs) {
            return [...this.ohsProjectSprites, this.ohsExitSign, ...this.ohsGhosts].filter(e => e && e.active);
        }
        const list = this.trees.getChildren().slice();
        list.push(this.computer, this.computerPreview, this.orb);
        this.bombs.getChildren().forEach(b => { if (b.active) list.push(b); });
        return list;
    }

    // Things that light up the CHOP button when you're near/facing them.
    _hintTargets() {
        if (this.inOhs) {
            return [...this.ohsProjectSprites, this.ohsExitSign, ...this.ohsGhosts];
        }
        return [this.computer, this.orb, this.ohsSchool, ...this.trees.getChildren()];
    }

    update() {
        // DOOM (first-person) mode takes a completely separate render/control
        // path and skips all the top-down logic below.
        if (this.is3D) {
            this.updateDoomFrame();
            return;
        }

        // Glow the on-screen ⚔ button whenever the player is next to something
        // choppable in the CURRENT world (main entities or OHS-world entities).
        let nearInteractable = false;
        for (const e of this._hintTargets()) {
            if (!e || !e.active) continue;
            if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 220) {
                nearInteractable = true;
                break;
            }
        }
        this.setActionHint(nearInteractable && this.playerMoved);

        const player = this.player;
        const cursors = this.cursors;
        let velX = this.player.body.velocity.x;
        let velY = this.player.body.velocity.y;

        // Roaming OHS ghosts wander while we're in the OHS sub-world.
        if (this.inOhs) this.ohsGhosts.forEach(g => this._wanderGhost(g, this.game.loop.delta));

        // Hide instructions when player moves
        if (!this.playerMoved && this.instructionsImage && this.instructionsImage.visible) {
            const anyMovement = cursors.left.isDown || cursors.right.isDown ||
                              cursors.up.isDown || cursors.down.isDown ||
                              this.wasd.A.isDown || this.wasd.D.isDown ||
                              this.wasd.W.isDown || this.wasd.S.isDown ||
                              this.mobilePlayerMove;
            if (anyMovement) {
                this.playerMoved = true;
                this.instructionsImage.setVisible(false);
            }
        }

        // Prevent gameplay until player moves
        if (!this.playerMoved) {
            return;
        }

        // Bomb knockback: slide with the launch velocity, bleeding it off each
        // frame, and ignore movement input until it dies down.
        if (this.time.now < this._knockbackUntil) {
            this.player.setVelocity(this.player.body.velocity.x * 0.92, this.player.body.velocity.y * 0.92);
            return;
        }

        // Player Movement — tap-to-move on touch, keys otherwise. Chopping is
        // now the dedicated on-screen ⚔ button, so movement no longer has to
        // guess whether a tap meant "walk" vs "swing".
        if (isLikelyMobileDevice() && this.mobilePlayerMove) {
            const dx = Math.round(this.touchTarget.x - this.player.x);
            const dy = Math.round(this.touchTarget.y - this.player.y);
            const distance = Math.hypot(dx, dy);
            const speed = this.maxSpeed;

            if (distance <= 20) {
                // Cancel movement early if we reach the destination
                this.player.setVelocity(0, 0);
                this.player.play('idle-me', true);
                this.lastDirection = 'none';
            } else {
                const angle = Math.atan2(dy, dx);
                this.player.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

                // Play correct animation
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                if (absDx > absDy) {
                    if (dx > 0) {
                        this.player.play('right-me', true);
                        this.lastDirection = 'right';
                    } else {
                        this.player.play('left-me', true);
                        this.lastDirection = 'left';
                    }
                } else {
                    if (dy > 0) {
                        this.player.play('down-me', true);
                        this.lastDirection = 'down';
                    } else {
                        this.player.play('up-me', true);
                        this.lastDirection = 'up';
                    }
                }
            }
        } else {
            // Keyboard Input (Arrow keys or WASD)
            if (this.cursors.left.isDown || this.wasd.A.isDown) {
                velX -= this.acceleration;
            } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
                velX += this.acceleration;
            }
            if (this.cursors.up.isDown || this.wasd.W.isDown) {
                velY -= this.acceleration;
            } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
                velY += this.acceleration;
            }

            // Apply friction if no key is pressed
            if (!this.cursors.left.isDown && !this.cursors.right.isDown && !this.wasd.A.isDown && !this.wasd.D.isDown) {
                velX *= this.friction;
            }
            if (!this.cursors.up.isDown && !this.cursors.down.isDown && !this.wasd.W.isDown && !this.wasd.S.isDown) {
                velY *= this.friction;
            }

            // Cap velocity
            velX = Phaser.Math.Clamp(velX, -this.maxSpeed, this.maxSpeed);
            velY = Phaser.Math.Clamp(velY, -this.maxSpeed, this.maxSpeed);

            // Apply new velocity
            this.player.setVelocity(velX, velY);

            if (cursors.left.isDown || this.wasd.A.isDown) {
                player.play('left-me', true);
                this.lastDirection = 'left';
            } else if (cursors.right.isDown || this.wasd.D.isDown) {
                player.play('right-me', true);
                this.lastDirection = 'right';
            } else if (cursors.up.isDown || this.wasd.W.isDown) {
                player.play('up-me', true);
                this.lastDirection = 'up';
            } else if (cursors.down.isDown || this.wasd.S.isDown) {
                player.play('down-me', true);
                this.lastDirection = 'down';
            } else {
                player.play('idle-me', true);
            }
        }

        // Footsteps while actually moving
        const speedMag = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y);
        if (speedMag > 40) {
            this.sounds.footstep();
        }

        // Whoosh whenever the player switches facing direction (throttled so a
        // quick left<->right jiggle doesn't machine-gun the sound).
        if (this.lastDirection !== 'none' && this.lastDirection !== this._prevDir) {
            const now = this.time.now;
            if (now - (this._lastWhooshAt || 0) > 130) {
                this.sounds.whoosh();
                this._lastWhooshAt = now;
            }
        }
        this._prevDir = this.lastDirection;

        // Axe positioning — swings in all four directions. Activated by the F
        // key (desktop) or the held on-screen ⚔ button (works on any device).
        const axeActive = downF.isDown || this.actionHeld;
        if (axeActive) {
            // Whoosh at swing start, then repeat while held. A pixelated slash
            // arc flashes in the air on each swing (Hollow-Knight style).
            const now = this.time.now;
            if (!this.axeWasActive || now - this.lastSwingAt > 450) {
                this.sounds.swing();
                this.lastSwingAt = now;
                this.spawnSlash(this.lastDirection);
            }

            this.axeRotations += this.axeRotations < 0.5 ? this.axeRotations * 1.01 + 0.01 : 0.5;
            const sw = this.axeRotations;
            const off = 10;
            // flipX is inverted from the raw sprite so the axe HEAD faces left
            // (the sprite's head points right by default).
            switch (this.lastDirection) {
                case 'left':
                    this.axe.setFlipX(true);
                    this.axe.setFlipY(false);
                    this.axe.setOrigin(1, 1);
                    this.axe.setPosition(player.x + Math.cos(sw) * off, player.y - Math.sin(sw) * off);
                    this.axe.rotation = -sw;
                    break;
                case 'up':
                    this.axe.setFlipX(true);
                    this.axe.setFlipY(false);
                    this.axe.setOrigin(0.5, 1);
                    this.axe.setPosition(player.x + Math.sin(sw) * off, player.y - Math.cos(sw) * off - 6);
                    this.axe.rotation = sw;
                    break;
                case 'down':
                    this.axe.setFlipX(true);
                    this.axe.setFlipY(true);
                    this.axe.setOrigin(0.5, 0);
                    this.axe.setPosition(player.x - Math.sin(sw) * off, player.y + Math.cos(sw) * off + 6);
                    this.axe.rotation = -sw;
                    break;
                default: // right (and idle)
                    this.axe.setFlipX(true);
                    this.axe.setFlipY(false);
                    this.axe.setOrigin(0.5, 1);
                    this.axe.setPosition(player.x + Math.cos(sw) * off, player.y + Math.sin(sw) * off);
                    this.axe.rotation = sw;
                    break;
            }
            this.axe.setVisible(true);
            this.axe.body.enable = true;
        } else {
            this.axeRotations = 0;
            this.axe.setVisible(false);
            this.axe.body.enable = false;
            this.axe.setPosition(0, 0);
        }
        this.axeWasActive = axeActive;

        // Performance display toggle
        if (Phaser.Input.Keyboard.JustDown(this.perfKey)) {
            this.showPerf = !this.showPerf;
            this.perfText.setVisible(this.showPerf);
        }
        if (this.showPerf) {
            const perfInfo = [
                `FPS: ${this.currentFPS}`,
                `CPU Cores: ${this.performanceData.hardwareConcurrency}`,
                `Memory: ${this.performanceData.deviceMemory}GB`,
                `Benchmark: ${this.performanceData.benchmarkScore}`,
                `Slow: ${this.performanceData.isSlow}`,
                `Very Slow: ${this.performanceData.isVerySlow}`,
                `Ghosts: ${this.ghosts.length}`,
                `3D Mode: ${this.is3D}`
            ];
            this.perfText.setText(perfInfo.join('\n'));
        }
    }

    cutTree(axe, tree) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();

        // Remember where the tree stood before the shake tween moves it.
        const tx = tree.x, ty = tree.y;

        // === Shake the tree ===
        this.tweens.add({
            targets: tree,
            x: { value: tree.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: tree.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.sounds.smash();
                tree.destroy();
                this.logs += 1;
                // Persist the running tree-cut total + update the HUD counter.
                try { localStorage.setItem('treesCut', this.logs); } catch (e) {}
                if (this._scoreVal) this._scoreVal.textContent = this.logs;
                // It breaks -> woody particle burst + a hype word popup.
                const word = this.pickCutWord();
                this.emitBreakParticles(tx, ty);
                this.showCutText(tx, ty - 40, word);
                // Same effect on the DOOM overlay canvas (Phaser FX above is
                // invisible in first-person). These self-guard on 3D being active.
                this.doomView.burstAtWorld(tx, ty, { colors: ['#8b5a2b', '#5a3a1a', '#a9772f', '#3f8a2f', '#2f6d22', '#c9a24a'], count: 26, wz: 30 });
                this.doomView.textAtWorld(tx, ty, word);
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    }

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
    }

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
    }

    // Pixelated slash arc that flashes in the air along the swing direction.
    spawnSlash(dir) {
        if (!this.textures.exists('fxSlash')) return;
        const off = 42;
        const map = {
            right: { rot: 0, dx: off, dy: 0 },
            left: { rot: Math.PI, dx: -off, dy: 0 },
            up: { rot: -Math.PI / 2, dx: 0, dy: -off },
            down: { rot: Math.PI / 2, dx: 0, dy: off },
            none: { rot: 0, dx: off, dy: 0 }
        };
        const m = map[dir] || map.right;
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
    }

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
    }

    // Small rainbow sparkle for things that DON'T break (computer, orb, ghosts).
    emitHitParticles(x, y) {
        this._pixelBurst(x, y, {
            colors: [0xff2d55, 0xff9500, 0xffe500, 0x34d158, 0x00c7ff, 0x5e5ce6, 0xff2dd4, 0xffffff],
            count: 20, minSpeed: 80, maxSpeed: 250, gravity: 220,
            minScale: 1.8, maxScale: 3.4, life: 640, depth: 15000
        });
    }

    // Random retro hype word for a successful chop.
    pickCutWord() {
        const words = ['RADICAL!', 'AWESOME!', 'GNARLY!', 'TUBULAR!', 'WICKED!', 'EPIC!', 'TIMBER!', 'BOOM!', 'SLICK!', 'NICE!'];
        return Phaser.Utils.Array.GetRandom(words);
    }

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
    }

    hitComputer(axe, computer) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y); // doesn't break -> rainbow sparkle
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'], count: 16, wz: 40 });

        // Shake the computer randomly
        this.tweens.add({
            targets: computer,
            x: { value: computer.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: computer.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.computerChops++;
                if (this.computerChops >= 3) {
                    this.sounds.smash();
                    this.openSubPage('personalWebsite/index.html');
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    }

    // ===== OHS sub-world =====
    // Rainbow palette reused by several hit handlers (DOOM canvas needs CSS strings).
    get _rainbowFx() { return ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4']; }

    // Chop the OHS school 3x -> enter the OHS world.
    hitOhs(axe, school) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: this._rainbowFx, count: 16, wz: 40 });
        this.tweens.add({
            targets: school,
            x: { value: school.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: school.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.ohsChops++;
                if (this.ohsChops >= 3) { this.sounds.smash(); this.enterOhsWorld(); }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    }

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
                    this.openSubPage(`https://${spr.subdomain}.bruno-rodriguez-mendez.com`);
                }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    }

    // One chop of the exit sign -> back to the main world.
    hitExitSign(axe, sign) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.sounds.smash();
        this.exitOhsWorld();
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    }

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
    }

    enterOhsWorld() {
        if (this.inOhs) return;
        this.inOhs = true;
        this.ohsChops = 0;
        this.resetHeldInput();

        this._setMainWorldActive(false);
        this.cameras.main.setBackgroundColor('#33343a'); // dark cement
        if (this.doomView) this.doomView.setFloorColor && this.doomView.setFloorColor('#33343a');

        const worldW = 2000, worldH = 2000;
        this.player.setPosition(300, worldH / 2);
        this.player.setVelocity(0, 0);

        // 6 projects laid out in 2 columns x 3 rows.
        const colX = [760, 1240];
        const rowY = [560, 1000, 1440];
        this.ohsProjects.forEach((p, i) => {
            const cx = colX[i % 2];
            const cy = rowY[Math.floor(i / 2)];
            const spr = this.physics.add.staticImage(cx, cy, p.key).setScale(0.12).refreshBody();
            spr.subdomain = p.key;
            spr.chops = 0;
            this.ohsProjectSprites.push(spr);

            const label = this.add.text(cx, cy - 108, p.label, {
                fontFamily: 'monospace', fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(20);
            this.miniMap.ignore(label);
            this.ohsLabels.push(label);

            this.ohsColliders.push(this.physics.add.collider(this.player, spr));
            this.ohsColliders.push(this.physics.add.overlap(this.axe, spr, this.hitProject, null, this));
        });

        // Exit sign, bottom-right.
        this.ohsExitSign = this.physics.add.staticImage(worldW - 260, worldH - 260, 'exit-sign').setScale(4).refreshBody();
        this.ohsColliders.push(this.physics.add.overlap(this.axe, this.ohsExitSign, this.hitExitSign, null, this));

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

        this.showToast('Welcome to OHS!\nChop a project to open it — hit the EXIT sign to leave.', 4000);
    }

    exitOhsWorld() {
        if (!this.inOhs) return;
        this.inOhs = false;
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

        this.cameras.main.setBackgroundColor('#000000');
        if (this.doomView) this.doomView.setFloorColor && this.doomView.setFloorColor(null);
        this._setMainWorldActive(true);
        this.ohsChops = 0;

        // Drop the player just to the right of the OHS school.
        this.player.setPosition(this.ohsSchool.x + 240, this.ohsSchool.y);
        this.player.setVelocity(0, 0);
    }

    // Show/hide + enable/disable every main-world entity when swapping worlds.
    _setMainWorldActive(on) {
        const set = (o) => { if (!o) return; o.setVisible(on); if (o.body) o.body.enable = on; };
        this.trees.getChildren().forEach(set);
        set(this.computer);
        if (this.computerPreview) this.computerPreview.setVisible(on);
        set(this.orb);
        set(this.ohsSchool);
        if (this._bombOverlap) this._bombOverlap.active = on;
        this.bombs.getChildren().forEach(b => {
            // Only re-show bombs that were never triggered (triggered ones stay gone).
            b.setVisible(on && b.active);
            if (b.body) b.body.enable = on && b.active;
        });
    }

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
    }

    _ghostPickDir(g) {
        if (Math.random() < 0.3) {
            g._idle = true; g._idleTimer = Phaser.Math.Between(1000, 3000); g.setVelocity(0, 0);
        } else {
            g._idle = false;
            g._dir = Phaser.Math.RND.pick(['left', 'right', 'up', 'down']);
            g._moveTimer = Phaser.Math.Between(2000, 4000);
        }
    }

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
                if (ghost.chops >= 3) {
                    this.sounds.smash();
                    this.openSubPage(`https://${ghost.subdomain}.bruno-rodriguez-mendez.com`, ghost);
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    }

    hitOrb(axe, orb) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y); // doesn't break -> rainbow sparkle
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'], count: 16, wz: 40 });

        this.tweens.add({
            targets: orb,
            x: { value: orb.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: orb.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.orbChops++;
                if (this.orbChops >= 3) {
                    this.sounds.smash();
                    this.orbActivated = true;
                    let title = "I'm Salutatorian ^_^";
                    let description = 'My silly speech';
                    let videoUrl = 'https://www.youtube.com/embed/8MPoMOXszWM';
                    this.enterModal(title, description, videoUrl);
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    }

    // Opens a full-screen sub-page (personal website or a subdomain) as a
    // natural extension of the world. One code path + one set of global close
    // handlers, so closing always tears down the right iframe and restores
    // the player exactly where they were.
    openSubPage(url, ghost = null) {
        if (this.activeSubPage) return;

        // The HUD is about to be hidden, so its buttons can't fire pointerup —
        // clear held state or it would auto-chop/auto-walk on return.
        this.resetHeldInput();

        this.preSubPageState = {
            x: this.player.x,
            y: this.player.y
        };

        this.scene.pause();
        this.game.canvas.style.display = 'none';
        document.body.classList.add('subpage-open'); // hides world previews + mode toggle via CSS
        document.body.style.overflow = 'hidden';

        const iframe = document.createElement('iframe');
        iframe.id = 'subPageFrame';
        iframe.className = 'subpage-frame';
        iframe.src = url;
        // Always scrollable — the personal site is a tall page. (It used to be
        // locked via a 'DISABLE INTERACTION' message, which is why it wouldn't
        // scroll; we no longer send that.)
        iframe.setAttribute('scrolling', 'yes');
        document.body.appendChild(iframe);

        // Single, clean pixel "BACK" button (replaces the old esc-key image and
        // the personal site's own duplicate esc button — we no longer trigger
        // that one, so only this one shows).
        const escButton = document.createElement('button');
        escButton.id = 'subPageEscButton';
        escButton.className = 'subpage-back pixel-hud-btn';
        escButton.innerHTML = '&#10005; BACK';
        escButton.setAttribute('aria-label', 'Back to world');
        escButton.addEventListener('click', () => this.closeSubPage());
        document.body.appendChild(escButton);

        this.activeSubPage = { iframe, escButton, ghost };
    }

    closeSubPage() {
        if (!this.activeSubPage) return;
        const { iframe, escButton, ghost } = this.activeSubPage;
        this.activeSubPage = null;

        iframe.remove();
        escButton.remove();
        document.body.classList.remove('subpage-open');
        document.body.style.overflow = 'hidden';
        this.game.canvas.style.display = 'block';

        // Reset chop counters so the page doesn't immediately reopen
        if (ghost) ghost.chops = 0;
        this.computerChops = 0;

        // Restore the player exactly where they were and re-attach the camera
        if (this.preSubPageState) {
            this.player.setPosition(this.preSubPageState.x, this.preSubPageState.y);
            this.player.setVelocity(0, 0);
        }
        this.cameras.main.startFollow(this.player);
        this.scene.resume();
    }

    spawnGhost() {
        if (this.inOhs) return; // OHS has its own roaming ghosts
        // Decorative ghost inside the current camera view (world coordinates)
        const cam = this.cameras.main;
        const x = Phaser.Math.Between(cam.worldView.x, cam.worldView.x + cam.worldView.width);
        const y = Phaser.Math.Between(cam.worldView.y, cam.worldView.y + cam.worldView.height);

        const ghost = this.add.sprite(x, y, 'ghost').setAlpha(0.5).setScale(3);
        ghost.play('ghost_float');

        this.time.delayedCall(5000, () => {
            // Fade out over 2 seconds
            this.tweens.add({
                targets: ghost,
                alpha: 0,
                duration: 2000,
                onComplete: () => ghost.destroy()
            });
        });
    }

    triggerExplosion(player, bomb) {
        bomb.disableBody(true, true); // hide & disable this bomb
        this.sounds.smash();

        const explosion = this.add.sprite(bomb.x, bomb.y, 'explosive').setScale(3).setDepth(16000);
        explosion.play('explode');
        explosion.on('animationcomplete', () => explosion.destroy());
        if (this.miniMap) this.miniMap.ignore(explosion);

        // Red pixel burst at the blast — 2D uses numeric tints (Phaser sprites),
        // DOOM uses CSS-string colours (canvas fillStyle).
        this._pixelBurst(bomb.x, bomb.y, {
            colors: [0xff2b2b, 0xff5555, 0xff8080, 0xc40000, 0xffffff],
            count: 26, minSpeed: 120, maxSpeed: 340, gravity: 500
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(bomb.x, bomb.y, {
                colors: ['#ff2b2b', '#ff5555', '#ff8080', '#c40000', '#ffffff'], count: 26
            });
        }

        // Blow one of the hearts in the top-right HUD.
        this.loseHeart();

        // Launch the player away from the blast with great velocity that decays
        // to rest. The knockback window (below) ignores movement input and bleeds
        // the velocity off each frame — see update()/updateDoomMovement().
        const angle = Math.atan2(player.y - bomb.y, player.x - bomb.x);
        const force = 1500; // moderate launch — a shove that quickly decays to rest
        player.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
        this._knockbackUntil = this.time.now + 800;
    }

    enterModal(title, description, videoUrl) {
        // Set modal content
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-description').textContent = description;
        document.getElementById('modal-video').src = videoUrl;
        document.getElementById('project-modal').style.display = 'flex';
        document.body.classList.add('modal-open');
        this.resetHeldInput(); // HUD hidden — avoid stuck held buttons

        this.scene.pause(); // Pause game logic

        // Keyboard close handler
        const keyHandler = (e) => {
            if (e.code == 'Escape') {
                this.hideProjectModal();
            }
        };

        // Mobile click-to-close handler (tap backdrop)
        const clickHandler = (e) => {
            // Check if click is outside modal content (on backdrop)
            if (!e.target.closest('.modal-content')) {
                this.hideProjectModal();
            }
        };

        // Explicit close button (reliable on touch — replaces the ESC sprite)
        const closeHandler = () => this.hideProjectModal();
        const closeBtn = document.getElementById('modal-close');

        // Store handlers for later removal
        this.currentModalHandlers = { keyHandler, clickHandler, closeHandler, closeBtn };

        window.addEventListener('keydown', keyHandler);
        document.getElementById('project-modal').addEventListener('click', clickHandler);
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    }

    hideProjectModal() {
        // Clear video source and hide modal
        document.getElementById('modal-video').src = '';
        document.getElementById('project-modal').style.display = 'none';
        document.body.classList.remove('modal-open');

        // Remove event listeners
        if (this.currentModalHandlers) {
            window.removeEventListener('keydown', this.currentModalHandlers.keyHandler);
            document.getElementById('project-modal').removeEventListener('click', this.currentModalHandlers.clickHandler);
            if (this.currentModalHandlers.closeBtn) {
                this.currentModalHandlers.closeBtn.removeEventListener('click', this.currentModalHandlers.closeHandler);
            }
            this.currentModalHandlers = null;
        }

        this.orbActivated = false;
        this.orbChops = 0;
        this.scene.resume(); // Resume game logic
    }

    handleTouchInput(pointer) {
        // Save the destination coordinates
        this.touchTarget = {
            x: pointer.worldX,
            y: pointer.worldY
        };
    }
}
