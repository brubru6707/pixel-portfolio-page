import { isLikelyMobileDevice, createAnimations, detectDevicePerformance, monitorFPS, getPerformanceRecommendations } from '../utils/helpers.js';
import SoundManager from '../utils/SoundManager.js';
import DoomView from '../utils/DoomView.js';
import NetworkManager from '../utils/NetworkManager.js';
import { WS_URL } from '../config/network.js';
import { I18N } from './mainscene/i18n.js';

// This class is deliberately small — it's the Phaser lifecycle "spine"
// (constructor/preload/create/update + a couple of tiny cross-cutting
// helpers). Every game system (HUD/settings, zombies, cowboy, cowgirl,
// tools, dash, FX, sub-worlds, the leaderboard, ...) lives in its own file
// under ./mainscene/ and gets merged onto the prototype below via
// Object.assign — so `this.foo()` works identically no matter which file
// actually defines `foo`. This is a pure file-organization split (nothing
// here changes behavior): Phaser scenes are one instance with heavily
// shared state, so mixins avoid rewriting how systems reference each other
// the way a "real" composition/DI refactor would require.
import hudMixin from './mainscene/hud.js';
import statsLeaderboardMixin from './mainscene/stats-leaderboard.js';
import dashMixin from './mainscene/dash.js';
import networkDoomMixin from './mainscene/network-doom.js';
import fxMixin from './mainscene/fx.js';
import heartsMixin from './mainscene/hearts.js';
import subworldsMixin from './mainscene/subworlds.js';
import worldEntitiesMixin from './mainscene/world-entities.js';
import zombiesMixin from './mainscene/zombies.js';
import toolsMixin from './mainscene/tools.js';
import zenithMixin from './mainscene/zenith.js';
import cowboyMixin from './mainscene/cowboy.js';
import cowgirlMixin from './mainscene/cowgirl.js';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        // Settings (gear icon): theme + language, applied immediately (before
        // the HUD DOM exists) so there's no flash of the wrong theme.
        this.lang = 'en';
        this.theme = 'dark';
        try {
            const savedLang = localStorage.getItem('lang');
            if (savedLang && I18N[savedLang]) this.lang = savedLang;
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'light' || savedTheme === 'dark') this.theme = savedTheme;
        } catch (e) {}
        document.body.classList.toggle('theme-light', this.theme === 'light');

        this.axeRotations = 0;
        // Total trees ever chopped — persisted across visits (see cutTree).
        this.logs = 0;
        try {
            const saved = parseInt(localStorage.getItem('treesCut'), 10);
            if (!isNaN(saved)) this.logs = saved;
        } catch (e) {}
        this.canChop = true; // Cooldown flag for axe
        this.lastDirection = 'none'; // Track player's last direction
        // Which way the player is actually facing for aim purposes. Unlike
        // lastDirection (which resets to 'none' on arrival/idle so animation
        // logic knows to go idle), this only ever updates on a real direction
        // — so touch-aim (no cursor to point with) still points the axe the
        // way the player was last walking instead of falling back to a
        // hardcoded default.
        this.facingDirection = 'down';
        this._isGameOver = false;
        this.miniMap = null;
        this.acceleration = 15;
        this.maxSpeed = 200;
        this.friction = 0.9;

        // Dash — double-tap the direction key you're already holding to burst
        // a few blocks that way. 1s cooldown from the moment it triggers.
        this._dashKeyDownAt = { left: 0, right: 0, up: 0, down: 0 }; // last press time per direction
        this._dashDir = null;
        this._dashUntil = 0;          // time.now until which the dash owns velocity
        this._dashCooldownUntil = 0;
        this._dashTrailAt = 0;
        this.DASH_WINDOW = 280;       // ms between taps to count as a double-tap
        this.DASH_DURATION = 190;     // ms the dash burst lasts
        this.DASH_SPEED = 900;        // px/s during the burst
        this.DASH_COOLDOWN = 1000;    // ms before another dash can trigger
        // Dash shield: a barrier that rides in front of the player for the
        // dash's duration, damaging + knocking back (once each) any
        // zombie/cowboy/cowgirl caught in the cone ahead.
        this._dashShield = null;
        this._dashHitSet = new Set();
        this.DASH_SHIELD_RANGE = 100;      // px — how far ahead the cone reaches
        this.DASH_SHIELD_HALF_ANGLE = 1.0; // radians (~57°) half-angle of the cone
        this.DASH_KNOCKBACK_SPEED = 1700;  // px/s applied to whatever gets hit
        this.DASH_KNOCKBACK_STUN = 700;    // ms the launch + stun lasts
        this.DASH_DAMAGE = 2;              // matches the axe's melee chop
        this.orbActivated = false;
        this.touchTarget = { x: 0, y: 0 };
        this.movementTimer = null;
        this.mobilePlayerMove = false;
        this.ghosts = [];
        // Other connected players — non-interactive "Player N" ghosts driven
        // by NetworkManager (see _syncRemotePlayers/_updateRemotePlayers).
        this.remotePlayers = [];
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
        // Brown University sub-world — same swap as OHS, different projects.
        this.brownChops = 0;
        // shape-up and chipathon (GitHub) both refuse to be framed (X-Frame-Options),
        // so those two open in a new tab instead of openSubPage's iframe.
        this.brownProjects = [
            { key: 'shape-up', label: 'shape up', url: 'https://www.tryshapeup.cc/', newTab: true, path: 'assets/subdomains/shape-up.png' },
            { key: 'bloom', label: 'bloom', url: 'https://www.bloom-pots.com/', path: 'assets/subdomains/bloom.png' },
            { key: 'chipathon', label: 'chipathon 2026', url: 'https://github.com/brubru6707/hungry-chippos-chipathon-2026', newTab: true, path: 'assets/other-projects/chipathon.png' },
        ];
        // Which sub-world we're inside ('ohs' | 'brown' | null). `inOhs` stays
        // as the legacy "inside ANY sub-world" flag used all over the code.
        this.subWorldId = null;
        this.tutorialShown = false;
        this._doomIntroShown = false;
        this._toastTimer = null;

        // Tool + plank inventory: every 3 chopped trees bank 1 plank. Key 1 =
        // axe, key 2 = axe gun, key 3 = plank (or tap the matching HUD chip on
        // touch). Placed planks wall zombies off; zombies chew through them
        // over time.
        this.tool = 'axe';
        this.planks = 0;
        this._treesTowardPlank = 0;
        this._actionWasDown = false;   // edge detector for one-per-press placement

        // Axe gun — rapid-fire ranged tool, weak per hit but fires
        // continuously while held (a spray, not a swing).
        this.AXEGUN_FIRE_RATE = 110;   // ms between shots while held
        this.AXEGUN_DAMAGE = 0.3;      // per-pellet damage (was 0.5 — toned down)
        this._lastAxeGunShot = 0;

        // Zenith frenzy — every 5 zombie kills: 3s of Terraria-Zenith flying
        // axes, double speed, gold trail, rainbow flurries, invincibility.
        this._killsTowardZenith = 0;
        this._zenithUntil = 0;
        this._invincibleUntil = 0;
        this._zenithAxes = [];
        this._lastGoldTrail = 0;
        this._lastSlashFx = 0;

        // Cowboy duel — opt-in via the "cowboy?" HUD button. His sprite only
        // shoots to HIS right, so he stalks the player from the left side.
        this.cowboyEnabled = false;
        this.cowboy = null;
        this.COWBOY_HP = 30;
        this.cowboyKills = 0;
        try {
            const ck = parseInt(localStorage.getItem('cowboyKills'), 10);
            if (!isNaN(ck)) this.cowboyKills = ck;
        } catch (e) {}

        // Cowgirl-on-a-pig — opt-in via the "cowgirl?" HUD button, right next
        // to the cowboy toggle. She's an airborne contact attacker: constant
        // pursuit with a slow turn rate (wide swooping arcs instead of
        // snapping onto the player) and isn't bound by the world edges.
        this.cowgirlEnabled = false;
        this.cowgirl = null;
        this.COWGIRL_HP = 18;
        this.COWGIRL_SPEED = 240;
        this.COWGIRL_TURN_RATE = 0.9; // radians/sec — low, so she takes a while to come back around
        this.cowgirlKills = 0;
        this._cowgirlDmgUntil = 0;
        this._lassoedUntil = 0;       // player status: slowed, no dash, roped up
        try {
            const gk = parseInt(localStorage.getItem('cowgirlKills'), 10);
            if (!isNaN(gk)) this.cowgirlKills = gk;
        } catch (e) {}

        // Zombie horde — opt-in via the "zombies?" HUD button. Zombies chase
        // the player in every world/mode, path-find around obstacles (A* on a
        // coarse nav grid, Minecraft-mob style), and cost a heart on contact.
        this.zombiesEnabled = false;
        this.zombies = [];
        this.MAX_ZOMBIES = 10;
        this.NAV_CELL = 50;              // nav-grid cell size in world px
        this._navGrid = null;            // Uint8Array of blocked cells
        this._navDirty = true;           // rebuild the grid on next use
        this._zombieDmgUntil = 0;        // player invulnerability window
        this.zombieKills = 0;            // persisted across visits, like treesCut
        try {
            const zk = parseInt(localStorage.getItem('zombieKills'), 10);
            if (!isNaN(zk)) this.zombieKills = zk;
        } catch (e) {}

        // Performance monitoring
        this.performanceData = detectDevicePerformance();
        this.fpsMonitor = null;
        this.currentFPS = 60;
        this.performanceWarnings = [];
    }

    preload() {
        // Cover the black canvas gap with the pixel loading dial while all
        // the spritesheets/previews below come in — driven by Phaser's own
        // load-progress events, not a fake timer.
        if (typeof window.showGameLoading === 'function') window.showGameLoading();
        this.load.on('progress', (value) => {
            if (typeof window.updateGameLoading === 'function') window.updateGameLoading(value);
        });

        this.load.spritesheet('me', 'assets/me-sprite.png', { frameWidth: 13, frameHeight: 15 });
        // Same sheet layout as the player sprite (idle + 4-direction walk).
        this.load.spritesheet('zombie', 'assets/zombie.png', { frameWidth: 13, frameHeight: 15 });
        this.load.image('brown-university', 'assets/brown-university.png');
        this.load.image('tree', 'assets/tree.png');
        this.load.spritesheet('axe', 'assets/axe.png', { frameWidth: 12, frameHeight: 15 });
        this.load.image('axeGun', 'assets/axe-gun.png');
        this.load.spritesheet('computer', 'assets/computer.png', { frameWidth: 30, frameHeight: 26 });
        this.load.image('plank', 'assets/plank.png');
        this.load.spritesheet('orb', 'assets/orb.png', { frameWidth: 26, frameHeight: 30 });
        this.load.spritesheet('ghost', 'assets/ghost.png', { frameWidth: 18, frameHeight: 30 });
        this.load.spritesheet('hidden-bomb', 'assets/hidden-bomb.png', { frameWidth: 27, frameHeight: 15 });
        this.load.spritesheet('explosive', 'assets/explosive.png', { frameWidth: 34, frameHeight: 40 });
        this.load.image('instructions', 'assets/instructions.png');
        // 5 frames: 0-3 walk, 4 = drawing the gun (he only shoots to his right).
        this.load.spritesheet('cowboy', 'assets/cowboy.png', { frameWidth: 20, frameHeight: 30 });
        this.load.spritesheet('cowgirl', 'assets/cow-girl-on-pig.png', { frameWidth: 100, frameHeight: 100 });

        // Image previews (replace the old live iframes) + OHS-world art.
        this.load.image('personal-website', 'assets/subdomains/personal-website.png');
        this.load.image('ohs-school', 'assets/OHS.png');
        this.load.image('exit-sign', 'assets/exit.png');
        this.load.image('contribute-sign', 'assets/contribute.png');

        // OHS + Brown project preview screenshots (~16MB combined) are NOT
        // loaded here — most players never chop those schoolhouses open, so
        // eagerly loading them would triple time-to-first-move for everyone
        // else. They're fetched on demand in enterOhsWorld/enterBrownWorld
        // (see _loadSubWorldAssets) the first time a player actually enters.
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

        // Multiplayer presence: other connected players render as translucent,
        // non-interactive "Player N" ghosts (see _syncRemotePlayers below).
        this._network = new NetworkManager(WS_URL, {
            onState: (players) => this._syncRemotePlayers(players),
            onConnectionChange: (connected) => this._onNetConnectionChange(connected),
            onModes: (modes) => this._applyServerModes(modes),
            onHit: (msg) => this._onPvpHit(msg)
        });
        // Game-mode voting + PvP state (see the Game Modes menu + PvP toggle).
        this._myVotes = { zombies: 0, cowboy: 0, cowgirl: 0 };
        this._modeTally = {
            zombies: { yes: 0, no: 0, on: false },
            cowboy: { yes: 0, no: 0, on: false },
            cowgirl: { yes: 0, no: 0, on: false }
        };
        this.pvpEnabled = true;       // true = fighter (default), false = spectator ghost
        this._pvpHitCooldown = {};    // peerId -> next-allowed-hit timestamp
        this._modesSynced = false;    // true once a vote-aware server confirms a tally

        // Add objects in the center of the world
        this.computer = this.physics.add.staticSprite(worldWidth / 2, worldHeight / 2, 'computer', 0).setScale(11).refreshBody();
        // The orb now lives inside the OHS sub-world (bottom-left corner), not
        // the main world — created once here (texture/anim/colliders stay
        // wired up the same way) but hidden + disabled until _enterSubWorld('ohs')
        // shows it; see that function and exitOhsWorld() for the toggle.
        this.orb = this.physics.add.staticSprite(260, worldHeight - 260, 'orb', 0).setScale(4).setVisible(false).refreshBody();
        this.orb.body.enable = false;
        // A little below the computer's middle, offset to the right — chop it
        // once to jump to the contributing guide.
        this.contributeSign = this.physics.add.staticImage(worldWidth / 2 + 200, worldHeight / 2 + 550, 'contribute-sign').setScale(3).refreshBody();
        this.player = this.physics.add.sprite(worldWidth / 2 - 290, worldHeight / 2, 'me', 0).setScale(3).refreshBody();
        this.player.setCollideWorldBounds(true);
        this.axe = this.physics.add.sprite(0, 0, 'axe', 0).setVisible(false).setScale(5).refreshBody();
        this.axe.body.enable = false; // only active mid-swing, so hidden axe can't chop things
        // Held axe-gun icon (2D only — DOOM mode draws its own screen-space
        // copy in DoomView). Purely visual, no physics/hitbox of its own; the
        // actual damage comes from the axeGunGroup projectiles.
        this.axeGunIcon = this.add.image(0, 0, 'axeGun').setVisible(false).setDepth(20).setScale(2.4);
        // Scatter hidden bombs across the field. Touch one and it blows a
        // heart + launches the player (see triggerExplosion). Kept clear of the
        // player's spawn / the central computer so you don't blow up instantly.
        // They regenerate once the whole batch has been used up.
        this.bombs = this.physics.add.group();
        this.BOMB_COUNT = 10;
        this._bombRegenQueued = false;
        this._spawnBombs();

        this.cameras.main.startFollow(this.player);
        this.cameras.main.setBackgroundColor(this._mainBgColor());
        // Phones show a lot less world at zoom 1 (small physical screen, often
        // portrait) — zoom out a bit so there's enough room to see incoming
        // threats/targets before they're right on top of you.
        if (isLikelyMobileDevice()) this.cameras.main.setZoom(0.75);

        // Mini map camera (created early so extrusion layers can be ignored by it)
        const miniMapWidth = 150;
        this.miniMap = this.cameras.add(
            this.scale.width - miniMapWidth - 20,
            20,
            miniMapWidth,
            miniMapWidth
        ).setZoom(0.1).startFollow(this.player, true, 0.1, 0.1).setBackgroundColor(0x002244).setBounds(0, 0, worldWidth, worldHeight);
        this.miniMap.ignore(this.axeGunIcon);

        // Right-click must do NOTHING (it used to lock the axe + walk target):
        // kill the browser context menu and gate every pointer handler below
        // to the left button / touch only.
        this.input.mouse.disableContextMenu();
        const isPrimary = (pointer) => !pointer || pointer.wasTouch || pointer.button === 0;

        // Touch input (registered once — was previously re-registered every frame)
        this.touchTarget = { x: this.player.x, y: this.player.y };
        this.input.on('pointerdown', (p) => { if (isPrimary(p)) this.handleTouchInput(p); });
        this.input.on('pointerdown', (p) => {
            if (!isPrimary(p)) return;
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
            // Only the LEFT button counts; right/middle clicks are ignored.
            if (pointer && !pointer.wasTouch && pointer.button !== 0) return;
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
        this.anims.create({
            key: 'cowboy-walk',
            frames: this.anims.generateFrameNumbers('cowboy', { start: 0, end: 3 }),
            frameRate: 8,
            repeat: -1
        });
        this.anims.create({
            key: 'cowboy-idle',
            frames: [{ key: 'cowboy', frame: 0 }],
            frameRate: 1
        });
        this.anims.create({
            key: 'cowboy-shoot',
            frames: [{ key: 'cowboy', frame: 4 }],
            frameRate: 1
        });
        this.anims.create({
            key: 'cowgirl-fly',
            frames: this.anims.generateFrameNumbers('cowgirl', { start: 0, end: 5 }),
            frameRate: 12,
            repeat: -1
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
        this.contributeSignChops = 0;

        // The projects no longer wander the main world as subdomain ghosts —
        // they live in the OHS sub-world now. `this.ghosts` stays (empty here)
        // for the ambient decorative ghosts + shared code paths.
        this.ghosts = [];

        // Personal-site preview: a static image on the computer screen (replaces
        // the old live iframe; billboards in 3D too). Chop the computer 3x to open.
        // Sit the preview higher and larger so it covers the computer's screen face
        // (the computer is setScale(11) → ~330×286 on screen).
        this.computerPreview = this.add.image(this.computer.x, this.computer.y - 88, 'personal-website')
            .setScale(0.073).setDepth(6);
        this.miniMap.ignore(this.computerPreview);

        // The OHS high school in the bottom-left. Chop it 3x to enter the OHS world.
        this.ohsSchool = this.physics.add.staticSprite(340, worldHeight - 320, 'ohs-school').setScale(5).refreshBody();

        // Brown University in the top-left — hand-drawn, chopping it just gets
        // you a "still coding this" message for now.
        this.brownSchool = this.physics.add.staticSprite(360, 280, 'brown-university').setScale(4.2).refreshBody();

        // Spawn trees without overlap (extracted so the forest can regrow when
        // the player has chopped every last one).
        this.trees = this.physics.add.staticGroup();
        this._spawnTrees();

        // Collisions
        this.physics.add.collider(this.player, this.trees);
        this.physics.add.collider(this.player, this.computer);
        this.physics.add.collider(this.player, this.orb);
        this.physics.add.collider(this.player, this.contributeSign);
        this.physics.add.collider(this.player, this.ohsSchool);
        this.physics.add.collider(this.player, this.brownSchool);
        this._bombOverlap = this.physics.add.overlap(this.player, this.bombs, this.triggerExplosion, null, this);

        // Overlap detection instead of collider for axe
        this.physics.add.overlap(this.axe, this.trees, this.cutTree, null, this);
        this.physics.add.overlap(this.axe, this.computer, this.hitComputer, null, this);
        this.physics.add.overlap(this.axe, this.orb, this.hitOrb, null, this);
        this.physics.add.overlap(this.axe, this.contributeSign, this.hitContributeSign, null, this);
        this.physics.add.overlap(this.axe, this.ohsSchool, this.hitOhs, null, this);
        this.physics.add.overlap(this.axe, this.brownSchool, this.hitBrown, null, this);

        // --- Zombies (opt-in horde) ---
        createAnimations(this, 'zombie');
        this.zombieGroup = this.physics.add.group();
        this.physics.add.collider(this.zombieGroup, this.trees);
        this.physics.add.collider(this.zombieGroup, this.computer);
        this.physics.add.collider(this.zombieGroup, this.orb);
        this.physics.add.collider(this.zombieGroup, this.contributeSign);
        this.physics.add.collider(this.zombieGroup, this.ohsSchool);
        this.physics.add.collider(this.zombieGroup, this.brownSchool);
        this.physics.add.collider(this.zombieGroup, this.zombieGroup);
        this.physics.add.overlap(this.axe, this.zombieGroup, this.hitZombie, null, this);
        this.physics.add.overlap(this.player, this.zombieGroup, this._zombieTouchPlayer, null, this);
        // Zombies can't see the hidden bombs — stepping on one blows them
        // clean in half (and uses the bomb up).
        this.physics.add.overlap(this.zombieGroup, this.bombs, this._zombieTripsBomb, null, this);
        // Keep the horde topped up (max MAX_ZOMBIES on the page at once).
        this.time.addEvent({
            delay: 2500,
            loop: true,
            callback: () => { if (this.zombiesEnabled) this._spawnZombie(); }
        });

        // --- Planks (placeable walls) ---
        this.plankGroup = this.physics.add.staticGroup();
        this.physics.add.collider(this.player, this.plankGroup);
        // Zombies pressed against a plank gnaw through it over time.
        this.physics.add.collider(this.zombieGroup, this.plankGroup, this._zombieBitesPlank, null, this);
        // The player can also chop their own planks back down with the axe.
        this.physics.add.overlap(this.axe, this.plankGroup, this._axeHitsPlank, null, this);

        // --- Ranged slash (Hollow-Knight nail-slash projectile) ---
        // Fired with every swing; 2 hits kill a regular zombie.
        this.slashGroup = this.physics.add.group();
        this.physics.add.overlap(this.slashGroup, this.zombieGroup, this._slashHitsZombie, null, this);
        // Slashes splash against trees, but fly clean through planks — planks
        // are the player's cover, not a wall against their own shots.
        this.physics.add.overlap(this.slashGroup, this.trees, (s) => this._popSlash(s), null, this);

        // --- Axe gun (rapid-fire tumbling-hatchet projectiles) ---
        // Tool 2. 1/4 the axe's melee damage per hit, but fired continuously.
        // Same plank rule as the slash: player shots fly clean through cover.
        this.axeGunGroup = this.physics.add.group();
        this.physics.add.overlap(this.axeGunGroup, this.zombieGroup, this._axeGunHitsZombie, null, this);
        this.physics.add.overlap(this.axeGunGroup, this.trees, (a) => this._popAxeGun(a), null, this);

        // --- Half-heart pickups (rare) ---
        this.heartPickups = this.physics.add.group();
        this.physics.add.overlap(this.player, this.heartPickups, this._collectHeart, null, this);
        this.time.addEvent({
            delay: 16000,
            loop: true,
            callback: () => this._maybeSpawnHeartPickup()
        });

        // --- Cowboy bullets (he shoots them; ONLY the player eats them) ---
        // They phase straight through trees, zombies, everything else — but a
        // planted plank is cover, so bullets stop dead against those.
        this.bulletGroup = this.physics.add.group();
        this.physics.add.overlap(this.player, this.bulletGroup, this._bulletHitsPlayer, null, this);
        this.physics.add.overlap(this.bulletGroup, this.plankGroup, (b) => this._popBullet(b), null, this);

        // Keyboard input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = {
            W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };
        this.downF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        // 1 = axe, 2 = axe gun, 3 = plank (tool switch).
        this.keyOne = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        this.keyTwo = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        this.keyThree = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

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
            this._network.destroy();
            this.remotePlayers.forEach(rp => { rp.sprite.destroy(); rp.label.destroy(); });
            this.remotePlayers = [];
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

    // Touch-capable device? (mobile UA, or a touchscreen laptop/tablet.)
    isTouch() {
        return isLikelyMobileDevice() || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    }

    update() {
        // GAME OVER freezes the world in place — no movement, no input.
        if (this._isGameOver) {
            if (this.player && this.player.body) this.player.setVelocity(0, 0);
            return;
        }

        // Live FPS readout, top-left next to the server status. Throttled to
        // 4x/sec — the raw per-frame number jitters too much to read.
        const nowMs = this.time.now;
        if (this._fpsEl && nowMs - this._fpsUpdateAt > 250) {
            this._fpsUpdateAt = nowMs;
            const fps = Math.round(this.game.loop.actualFps);
            this._fpsEl.textContent = `fps: ${fps}`;
            this._fpsEl.classList.toggle('good', fps >= 50);
            this._fpsEl.classList.toggle('warn', fps < 50 && fps >= 30);
            this._fpsEl.classList.toggle('bad', fps < 30);
        }

        // Tool hotkeys work in every mode: 1 = axe, 2 = axe gun, 3 = plank.
        if (this.keyOne && Phaser.Input.Keyboard.JustDown(this.keyOne)) this.setTool('axe');
        if (this.keyTwo && Phaser.Input.Keyboard.JustDown(this.keyTwo)) this.setTool('axegun');
        if (this.keyThree && Phaser.Input.Keyboard.JustDown(this.keyThree)) this.setTool('plank');
        this._updateZenith();
        this._updateCowboy();
        this._updateCowgirl();
        this._updateLasso();

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
        this._updateRemotePlayers();

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

        // Zombies keep hunting even while the player is knocked back, so run
        // them before the knockback early-return below.
        this._updateZombies();

        // Poll dash input BEFORE the knockback early-return below — otherwise a
        // bomb/zombie-bite knockback landing at the exact moment of a double-tap
        // would silently eat the keypress (JustDown only fires once and is gone
        // next frame). Polling here just records the double-tap; actual dash
        // movement still can't override an in-progress knockback.
        this._pollDashInput();

        // Bomb knockback: slide with the launch velocity, bleeding it off each
        // frame, and ignore movement input until it dies down.
        if (this.time.now < this._knockbackUntil) {
            this.player.setVelocity(this.player.body.velocity.x * 0.92, this.player.body.velocity.y * 0.92);
            return;
        }

        // Dash: double-tap the direction you're already holding to burst a
        // few blocks that way (1s cooldown). Owns velocity + animation for
        // its short duration, same pattern as the knockback slide above.
        const dashVel = this._dashVelocity();
        if (dashVel) {
            this.player.setVelocity(dashVel.vx, dashVel.vy);
            this._updateDashShield(dashVel.angle);
            const dashAnim = { left: 'left-me', right: 'right-me', up: 'up-me', down: 'down-me' }[this.lastDirection];
            player.play(dashAnim || 'idle-me', true);
            if (this.time.now - this._dashTrailAt > 40) {
                this._dashTrailAt = this.time.now;
                this._spawnDashAfterimage();
            }
            return;
        }
        this._endDashShield();

        // Player Movement — tap-to-move on touch, keys otherwise. Chopping is
        // now the dedicated on-screen ⚔ button, so movement no longer has to
        // guess whether a tap meant "walk" vs "swing".
        // Zenith frenzy: the player rockets around while it lasts. The
        // cowgirl's lasso does the opposite — roped up and sluggish.
        const zenithOn = this.time.now < this._zenithUntil;
        const lassoOn = this.time.now < this._lassoedUntil;
        const slowMul = lassoOn ? 0.4 : 1;
        const maxSp = (zenithOn ? this.maxSpeed * 2.2 : this.maxSpeed) * slowMul;
        const accel = (zenithOn ? this.acceleration * 2.4 : this.acceleration) * slowMul;

        if (isLikelyMobileDevice() && this.mobilePlayerMove) {
            const dx = Math.round(this.touchTarget.x - this.player.x);
            const dy = Math.round(this.touchTarget.y - this.player.y);
            const distance = Math.hypot(dx, dy);
            const speed = maxSp;

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
                this.facingDirection = this.lastDirection;
            }
        } else {
            // Keyboard Input (Arrow keys or WASD)
            if (this.cursors.left.isDown || this.wasd.A.isDown) {
                velX -= accel;
            } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
                velX += accel;
            }
            if (this.cursors.up.isDown || this.wasd.W.isDown) {
                velY -= accel;
            } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
                velY += accel;
            }

            // Apply friction if no key is pressed
            if (!this.cursors.left.isDown && !this.cursors.right.isDown && !this.wasd.A.isDown && !this.wasd.D.isDown) {
                velX *= this.friction;
            }
            if (!this.cursors.up.isDown && !this.cursors.down.isDown && !this.wasd.W.isDown && !this.wasd.S.isDown) {
                velY *= this.friction;
            }

            // Cap velocity
            velX = Phaser.Math.Clamp(velX, -maxSp, maxSp);
            velY = Phaser.Math.Clamp(velY, -maxSp, maxSp);

            // Apply new velocity
            this.player.setVelocity(velX, velY);

            if (cursors.left.isDown || this.wasd.A.isDown) {
                player.play('left-me', true);
                this.lastDirection = 'left';
                this.facingDirection = 'left';
            } else if (cursors.right.isDown || this.wasd.D.isDown) {
                player.play('right-me', true);
                this.lastDirection = 'right';
                this.facingDirection = 'right';
            } else if (cursors.up.isDown || this.wasd.W.isDown) {
                player.play('up-me', true);
                this.lastDirection = 'up';
                this.facingDirection = 'up';
            } else if (cursors.down.isDown || this.wasd.S.isDown) {
                player.play('down-me', true);
                this.lastDirection = 'down';
                this.facingDirection = 'down';
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
        // With the plank tool selected the same button PLACES a plank instead
        // (one per press, not per held frame).
        const actionDown = this.downF.isDown || this.actionHeld;
        if (this.tool === 'plank' && actionDown && !this._actionWasDown) this._placePlank();
        this._actionWasDown = actionDown;
        const axeActive = actionDown && this.tool === 'axe';
        if (axeActive) {
            // Whoosh at swing start, then repeat while held. A pixelated slash
            // arc flashes in the air on each swing (Hollow-Knight style).
            const now = this.time.now;
            const aim = this._aimAngle();      // point the swing at the cursor
            if (!this.axeWasActive || now - this.lastSwingAt > 450) {
                this.sounds.swing();
                this.lastSwingAt = now;
                this.spawnSlash(aim);
            }

            // Hold to keep it whirling: constant angular speed, so the axe just
            // spins round and round the player for as long as the button's down.
            this.axeRotations = (this.axeRotations || 0) + 0.4;
            const sw = this.axeRotations;
            // Reach the axe body OUT toward the cursor so it strikes whatever the
            // player is aiming at — not just whichever way they last walked.
            const reach = 34;
            const ax = player.x + Math.cos(aim) * reach;
            const ay = player.y + Math.sin(aim) * reach;
            // The axe HEAD mirrors the aim: raw sprite's head points right, so
            // aiming rightward = no flip, aiming leftward = flipX.
            this.axe.setFlipX(Math.cos(aim) < 0);
            this.axe.setFlipY(false);
            this.axe.setOrigin(0.5, 1);
            this.axe.setPosition(ax, ay);
            this.axe.rotation = aim + Math.PI / 2 + Math.sin(sw) * 0.6; // wobble as it swings
            this.axe.setVisible(true);
            this.axe.body.enable = true;
        } else {
            this.axeRotations = 0;
            this.axe.setVisible(false);
            this.axe.body.enable = false;
            this.axe.setPosition(0, 0);
        }
        this.axeWasActive = axeActive;

        // Axe-gun aiming — twin-stick style: the held icon tracks the mouse
        // (or, on touch, the player's last walking direction) continuously
        // while the tool is equipped, not just while firing. Rapid fire and
        // its recoil kick only kick in while the action button/F is held.
        if (this.tool === 'axegun') {
            const angle = this._axeGunAimAngle();
            const gdx = Math.cos(angle), gdy = Math.sin(angle);
            let firedNow = false;
            if (actionDown) {
                const now = this.time.now;
                if (now - this._lastAxeGunShot >= this.AXEGUN_FIRE_RATE) {
                    this._lastAxeGunShot = now;
                    firedNow = true;
                    this.sounds.whoosh();
                    this._fireAxeGun(gdx, gdy);
                }
            }
            const kick = firedNow ? Phaser.Math.Between(-3, 3) : 0;
            this.axeGunIcon.setPosition(player.x + gdx * 22 + kick, player.y + gdy * 22 + kick);
            this.axeGunIcon.setRotation(angle);
            this.axeGunIcon.setVisible(true);
        } else {
            this.axeGunIcon.setVisible(false);
        }

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

    handleTouchInput(pointer) {
        // Save the destination coordinates
        this.touchTarget = {
            x: pointer.worldX,
            y: pointer.worldY
        };
    }
}

Object.assign(MainScene.prototype,
    hudMixin,
    statsLeaderboardMixin,
    dashMixin,
    networkDoomMixin,
    fxMixin,
    heartsMixin,
    subworldsMixin,
    worldEntitiesMixin,
    zombiesMixin,
    toolsMixin,
    zenithMixin,
    cowboyMixin,
    cowgirlMixin,
);
