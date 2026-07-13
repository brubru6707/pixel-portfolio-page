import { isLikelyMobileDevice, createAnimations, subdomains, detectDevicePerformance, monitorFPS, getPerformanceRecommendations } from '../utils/helpers.js';
import GhostEntity from '../entities/GhostEntity.js';
import SoundManager from '../utils/SoundManager.js';
import DoomView from '../utils/DoomView.js';
import NetworkManager from '../utils/NetworkManager.js';
import { WS_URL, STATS_URL, LEADERBOARD_URL, SCORE_URL } from '../config/network.js';

// Tints applied to remote players' sprites (cycled by player number) so
// multiple ghosts on screen stay visually distinct from each other and from
// the un-tinted local player.
const REMOTE_PLAYER_TINTS = [0x66d9ff, 0xffb86c, 0xff79c6, 0x50fa7b, 0xbd93f9, 0xf1fa8c];

let downF;
let playerNearTree = false;

// ---- i18n: gear-icon settings panel drives this. Scope is the UI chrome —
// HUD button labels/aria-labels, the tutorial card, the settings panel
// itself, and the key mode-toggle/status toasts. Short flavor/hype text
// (Z E N I T H!!, GOT 'EM!, RADICAL) stays in English on purpose, same as
// many localized games keep stylized exclamations untranslated. `{axe}`
// is a placeholder swapped for the axe-icon <span> at render time.
const I18N = {
    en: {
        gearAria: 'Open settings', settingsTitle: 'SETTINGS',
        themeLabel: 'THEME', themeLight: 'LIGHT', themeDark: 'DARK',
        languageLabel: 'LANGUAGE', settingsClose: 'CLOSE',
        helpAria: 'How to play', musicAria: 'Toggle music', sfxAria: 'Mute sound effects',
        exitLabel: 'exit', exitAria: 'Exit and reset visitor choice',
        zombiesLabel: 'zombies', zombiesAria: 'Toggle zombies',
        cowboyLabel: 'cowboy', cowboyAria: 'Toggle the cowboy duel',
        cowgirlLabel: 'cowgirl', cowgirlAria: 'Toggle the cowgirl on her pig',
        gameModesLabel: 'game modes', gameModesAria: 'Open the game modes menu',
        modesTitle: 'GAME MODES', modesNote: 'Active players vote — majority {check} turns a mode on for everyone',
        voteYesAria: 'Vote to enable', voteNoAria: 'Vote to disable', modeOn: 'ON',
        pvpAria: 'Toggle PvP / spectator', pvpSpectate: 'spectate', pvpFight: '⚔ PvP',
        toastPvpOn: 'PvP ON\nYou can hit — and be hit by — other fighters',
        toastPvpOff: 'SPECTATING\nYou\'re a harmless ghost again',
        soundLabel: 'SOUND', sfxOn: 'SFX ON', sfxOff: 'SFX OFF', helpLabel: 'HOW TO PLAY',
        doomPanelLabel: '3D SETTINGS',
        gameOverLabel: 'GAME OVER', restartLabel: 'RESTART?', restartAria: 'Restart in the 2D world', exitGameAria: 'Exit to the visitor screen',
        lbTitle: 'LEADERBOARD', lbEmpty: 'no scores yet—be the first!',
        finalScoreLabel: 'FINAL SCORE',
        shareLabel: 'SHARE', shareAria: 'Share your score', shareCopiedLabel: 'COPIED!',
        shareText: 'I killed {total} enemies in Chompixel — {cowboy} cowboys, {cowgirl} cowgirls, {zombie} zombies. Beat my score:',
        newHighScoreLabel: 'NEW HIGH SCORE!', enterInitialsLabel: 'ENTER YOUR INITIALS',
        submitScoreLabel: 'SUBMIT', submitScoreAria: 'Submit your score to the leaderboard',
        axeToolAria: 'Switch to the axe (1)', axeGunToolAria: 'Switch to the axe gun (2)', plankToolAria: 'Switch to planks (3)',
        actionChop: 'CHOP', actionFire: 'FIRE', actionPlank: 'PLANK',
        actionAriaChop: 'Chop / interact', actionAriaFire: 'Fire the axe gun',
        toastAxeSelected: 'AXE selected (1)',
        toastGunSelected: 'AXE GUN selected (2)\nHold F / FIRE to spray',
        toastPlankSelected: 'PLANK selected (3)\nF / PLANK places a wall',
        tutTitle: '{axe} HOW TO PLAY',
        tutMoveTouch: 'Tap anywhere on the ground to walk there',
        tutMoveDesktop: 'Move with WASD or the arrow keys',
        tutChopTouch: 'Stand next to a tree, ghost, computer or orb and hold the {axe} <b>CHOP</b> button. It glows when you’re close enough.',
        tutChopDesktop: 'Stand next to something and hold <b>F</b> (or the {axe} button) to chop. It glows when you’re in range.',
        tutDoomTouch: 'Tap <b>3D</b> for the 3D view. Use the <b>&#9650;&#9660;&#9668;&#9658;</b> pad to turn &amp; walk, then hold CHOP.',
        tutDoomDesktop: 'Tap <b>3D</b> for the 3D DOOM view. Turn/walk with the arrow keys, chop with <b>F</b>.',
        tutEscTouch: 'Chopping a target opens its page. Tap the <b>ESC</b> button (top-right) to come back.',
        tutEscDesktop: 'Chopping a target opens its page. Press <b>ESC</b> (or the top-right button) to come back.',
        tutStart: "LET'S GO",
        tutNote: 'Chop the trees, ghosts, computer &amp; orb to explore my projects. Reopen this anytime from the <b>{gear}</b> settings.',
        toastCowboyRideIn: 'A COWBOY RIDES IN\nFROM THE EAST...',
        toastCowboyDown: "The cowboy is down...\nhe'll ride back in 30s",
        toastCowgirlRideIn: "SHE'S RIDING IN ON HER PIG...\nWATCH FOR THE LASSO",
        toastCowgirlDown: "She rode off...\nshe'll swoop back in 30s",
        toastLassoed: 'LASSOED!\nSlowed down and no dashing...',
        toastRangedLocked: 'RANGED LOCKED\nFULL HEALTH ONLY',
        toastNoPlanks: 'NO PLANKS!\nChop 3 trees to earn one',
        toastPlankEarned: '+1 PLANK!\nPress 3 (or tap the plank chip) to place it',
    },
    es: {
        gearAria: 'Abrir ajustes', settingsTitle: 'AJUSTES',
        themeLabel: 'TEMA', themeLight: 'CLARO', themeDark: 'OSCURO',
        languageLabel: 'IDIOMA', settingsClose: 'CERRAR',
        helpAria: 'Cómo jugar', musicAria: 'Activar/desactivar música', sfxAria: 'Silenciar efectos de sonido',
        exitLabel: 'salir', exitAria: 'Salir y reiniciar la elección de visitante',
        zombiesLabel: 'zombis', zombiesAria: 'Activar zombis',
        cowboyLabel: 'vaquero', cowboyAria: 'Activar el duelo con el vaquero',
        cowgirlLabel: 'vaquera', cowgirlAria: 'Activar a la vaquera en su cerdo',
        gameModesLabel: 'modos', gameModesAria: 'Abrir el menú de modos de juego',
        modesTitle: 'MODOS DE JUEGO', modesNote: 'Los jugadores activos votan — la mayoría {check} activa un modo para todos',
        voteYesAria: 'Votar para activar', voteNoAria: 'Votar para desactivar', modeOn: 'ON',
        pvpAria: 'Alternar JcJ / espectador', pvpSpectate: 'mirar', pvpFight: '⚔ JcJ',
        toastPvpOn: '¡JcJ ACTIVADO!\nPuedes golpear — y ser golpeado por — otros luchadores',
        toastPvpOff: 'MODO ESPECTADOR\nVuelves a ser un fantasma inofensivo',
        soundLabel: 'SONIDO', sfxOn: 'EFECTOS ON', sfxOff: 'EFECTOS OFF', helpLabel: 'CÓMO JUGAR',
        doomPanelLabel: 'AJUSTES 3D',
        gameOverLabel: 'FIN DEL JUEGO', restartLabel: '¿REINICIAR?', restartAria: 'Reiniciar en el mundo 2D', exitGameAria: 'Salir a la pantalla de visitante',
        lbTitle: 'TABLA DE POSICIONES', lbEmpty: 'aún no hay puntuaciones—¡sé el primero!',
        finalScoreLabel: 'PUNTUACIÓN FINAL',
        shareLabel: 'COMPARTIR', shareAria: 'Comparte tu puntuación', shareCopiedLabel: '¡COPIADO!',
        shareText: 'Maté a {total} enemigos en Chompixel — {cowboy} vaqueros, {cowgirl} vaqueras, {zombie} zombis. Supera mi puntuación:',
        newHighScoreLabel: '¡RÉCORD NUEVO!', enterInitialsLabel: 'INGRESA TUS INICIALES',
        submitScoreLabel: 'ENVIAR', submitScoreAria: 'Enviar tu puntuación a la tabla de posiciones',
        axeToolAria: 'Cambiar al hacha (1)', axeGunToolAria: 'Cambiar al hacha lanzadora (2)', plankToolAria: 'Cambiar a tablones (3)',
        actionChop: 'CORTAR', actionFire: 'DISPARAR', actionPlank: 'TABLÓN',
        actionAriaChop: 'Cortar / interactuar', actionAriaFire: 'Disparar el hacha lanzadora',
        toastAxeSelected: 'HACHA seleccionada (1)',
        toastGunSelected: 'HACHA LANZADORA seleccionada (2)\nMantén F / DISPARAR para rociar',
        toastPlankSelected: 'TABLÓN seleccionado (3)\nF / TABLÓN coloca un muro',
        tutTitle: '{axe} CÓMO JUGAR',
        tutMoveTouch: 'Toca cualquier punto del suelo para caminar hasta allí',
        tutMoveDesktop: 'Muévete con WASD o las flechas del teclado',
        tutChopTouch: 'Colócate junto a un árbol, fantasma, computadora u orbe y mantén pulsado el botón {axe} <b>CORTAR</b>. Brilla cuando estás lo bastante cerca.',
        tutChopDesktop: 'Colócate junto a algo y mantén pulsada <b>F</b> (o el botón {axe}) para cortar. Brilla cuando estás en rango.',
        tutDoomTouch: 'Toca <b>3D</b> para la vista en 3D. Usa el panel <b>&#9650;&#9660;&#9668;&#9658;</b> para girar y caminar, luego mantén CORTAR.',
        tutDoomDesktop: 'Pulsa <b>3D</b> para la vista DOOM en 3D. Gira/camina con las flechas, corta con <b>F</b>.',
        tutEscTouch: 'Cortar un objetivo abre su página. Toca el botón <b>ESC</b> (arriba a la derecha) para volver.',
        tutEscDesktop: 'Cortar un objetivo abre su página. Pulsa <b>ESC</b> (o el botón de arriba a la derecha) para volver.',
        tutStart: '¡VAMOS!',
        tutNote: 'Corta los árboles, fantasmas, la computadora y el orbe para explorar mis proyectos. Reabre esto cuando quieras desde <b>{gear}</b> ajustes.',
        toastCowboyRideIn: 'UN VAQUERO LLEGA\nDESDE EL ESTE...',
        toastCowboyDown: 'El vaquero ha caído...\nvolverá en 30s',
        toastCowgirlRideIn: '¡ELLA LLEGA EN SU CERDO...!\nCUIDADO CON EL LAZO',
        toastCowgirlDown: 'Ella se fue...\nvolverá en 30s',
        toastLassoed: '¡ATRAPADO CON EL LAZO!\nMás lento y sin dash...',
        toastRangedLocked: 'ATAQUE A DISTANCIA BLOQUEADO\nSOLO CON VIDA COMPLETA',
        toastNoPlanks: '¡SIN TABLONES!\nCorta 3 árboles para conseguir uno',
        toastPlankEarned: '¡+1 TABLÓN!\nPulsa 3 (o toca la ficha) para colocarlo',
    },
    zh: {
        gearAria: '打开设置', settingsTitle: '设置',
        themeLabel: '主题', themeLight: '浅色', themeDark: '深色',
        languageLabel: '语言', settingsClose: '关闭',
        helpAria: '游戏玩法', musicAria: '切换音乐', sfxAria: '静音音效',
        exitLabel: '退出', exitAria: '退出并重置访客选择',
        zombiesLabel: '僵尸', zombiesAria: '切换僵尸',
        cowboyLabel: '牛仔', cowboyAria: '切换牛仔对决',
        cowgirlLabel: '女牛仔', cowgirlAria: '切换骑猪女牛仔',
        gameModesLabel: '游戏模式', gameModesAria: '打开游戏模式菜单',
        modesTitle: '游戏模式', modesNote: '在线玩家投票——多数 {check} 会为所有人开启该模式',
        voteYesAria: '投票开启', voteNoAria: '投票关闭', modeOn: '开',
        pvpAria: '切换 PvP / 观战', pvpSpectate: '观战', pvpFight: '⚔ PvP',
        toastPvpOn: 'PvP 已开启\n你可以攻击其他战斗玩家，也会被攻击',
        toastPvpOff: '观战模式\n你又变回无害的幽灵',
        soundLabel: '声音', sfxOn: '音效开', sfxOff: '音效关', helpLabel: '玩法说明',
        doomPanelLabel: '3D 设置',
        gameOverLabel: '游戏结束', restartLabel: '重新开始？', restartAria: '在2D世界重新开始', exitGameAria: '退出到访客界面',
        lbTitle: '排行榜', lbEmpty: '暂无记录——快来抢第一！',
        finalScoreLabel: '最终得分',
        shareLabel: '分享', shareAria: '分享你的分数', shareCopiedLabel: '已复制！',
        shareText: '我在Chompixel中击杀了{total}个敌人——{cowboy}个牛仔、{cowgirl}个女牛仔、{zombie}个僵尸。来超越我的分数吧：',
        newHighScoreLabel: '创造新纪录！', enterInitialsLabel: '输入你的名字缩写',
        submitScoreLabel: '提交', submitScoreAria: '将你的分数提交到排行榜',
        axeToolAria: '切换到斧头 (1)', axeGunToolAria: '切换到斧头枪 (2)', plankToolAria: '切换到木板 (3)',
        actionChop: '砍伐', actionFire: '开火', actionPlank: '木板',
        actionAriaChop: '砍伐/互动', actionAriaFire: '发射斧头枪',
        toastAxeSelected: '已选择斧头 (1)',
        toastGunSelected: '已选择斧头枪 (2)\n按住 F / 开火 进行扫射',
        toastPlankSelected: '已选择木板 (3)\nF / 木板 放置一面墙',
        tutTitle: '{axe} 玩法说明',
        tutMoveTouch: '点击地面任意位置即可走过去',
        tutMoveDesktop: '使用 WASD 或方向键移动',
        tutChopTouch: '站在树木、幽灵、电脑或宝珠旁，按住 {axe} <b>砍</b> 按钮。靠近时按钮会发光。',
        tutChopDesktop: '站在物体旁，按住 <b>F</b>（或 {axe} 按钮）进行砍伐。在范围内时按钮会发光。',
        tutDoomTouch: '点击 <b>3D</b> 进入3D视角。使用 <b>&#9650;&#9660;&#9668;&#9658;</b> 方向键转向和行走，然后按住砍伐键。',
        tutDoomDesktop: '点击 <b>3D</b> 进入3D DOOM视角。用方向键转向/行走，按 <b>F</b> 砍伐。',
        tutEscTouch: '砍伐目标会打开它的页面。点击右上角的 <b>ESC</b> 按钮返回。',
        tutEscDesktop: '砍伐目标会打开它的页面。按 <b>ESC</b>（或右上角按钮）返回。',
        tutStart: '开始！',
        tutNote: '砍伐树木、幽灵、电脑和宝珠来探索我的项目。随时可通过 <b>{gear}</b> 设置重新打开本说明。',
        toastCowboyRideIn: '一个牛仔从东边\n骑马而来...',
        toastCowboyDown: '牛仔倒下了……\n30秒后会回来',
        toastCowgirlRideIn: '她骑着猪冲过来了……\n小心她的套索',
        toastCowgirlDown: '她骑走了……\n30秒后会回来',
        toastLassoed: '被套索缠住了！\n速度变慢，无法冲刺……',
        toastRangedLocked: '远程攻击已锁定\n仅生命值满时可用',
        toastNoPlanks: '没有木板了！\n砍3棵树可获得一块',
        toastPlankEarned: '+1 木板！\n按 3（或点击木板图标）放置',
    },
    fr: {
        gearAria: 'Ouvrir les paramètres', settingsTitle: 'PARAMÈTRES',
        themeLabel: 'THÈME', themeLight: 'CLAIR', themeDark: 'SOMBRE',
        languageLabel: 'LANGUE', settingsClose: 'FERMER',
        helpAria: 'Comment jouer', musicAria: 'Activer/désactiver la musique', sfxAria: 'Couper les effets sonores',
        exitLabel: 'quitter', exitAria: 'Quitter et réinitialiser le choix du visiteur',
        zombiesLabel: 'zombies', zombiesAria: 'Activer les zombies',
        cowboyLabel: 'cowboy', cowboyAria: 'Activer le duel avec le cowboy',
        cowgirlLabel: 'cowgirl', cowgirlAria: 'Activer la cowgirl sur son cochon',
        gameModesLabel: 'modes', gameModesAria: 'Ouvrir le menu des modes de jeu',
        modesTitle: 'MODES DE JEU', modesNote: 'Les joueurs actifs votent — la majorité {check} active un mode pour tous',
        voteYesAria: 'Voter pour activer', voteNoAria: 'Voter pour désactiver', modeOn: 'ON',
        pvpAria: 'Basculer JcJ / spectateur', pvpSpectate: 'observer', pvpFight: '⚔ JcJ',
        toastPvpOn: 'JcJ ACTIVÉ\nVous pouvez frapper — et être frappé par — d\'autres combattants',
        toastPvpOff: 'MODE SPECTATEUR\nVous redevenez un fantôme inoffensif',
        soundLabel: 'SON', sfxOn: 'EFFETS ON', sfxOff: 'EFFETS OFF', helpLabel: 'COMMENT JOUER',
        doomPanelLabel: 'RÉGLAGES 3D',
        gameOverLabel: 'PARTIE TERMINÉE', restartLabel: 'RECOMMENCER ?', restartAria: 'Recommencer dans le monde 2D', exitGameAria: 'Quitter vers l\'écran visiteur',
        lbTitle: 'CLASSEMENT', lbEmpty: 'aucun score pour l\'instant—soyez le premier !',
        finalScoreLabel: 'SCORE FINAL',
        shareLabel: 'PARTAGER', shareAria: 'Partagez votre score', shareCopiedLabel: 'COPIÉ !',
        shareText: 'J\'ai tué {total} ennemis dans Chompixel — {cowboy} cowboys, {cowgirl} cowgirls, {zombie} zombies. Battez mon score :',
        newHighScoreLabel: 'NOUVEAU RECORD !', enterInitialsLabel: 'ENTREZ VOS INITIALES',
        submitScoreLabel: 'ENVOYER', submitScoreAria: 'Envoyer votre score au classement',
        axeToolAria: 'Passer à la hache (1)', axeGunToolAria: 'Passer au lance-hache (2)', plankToolAria: 'Passer aux planches (3)',
        actionChop: 'COUPER', actionFire: 'TIRER', actionPlank: 'PLANCHE',
        actionAriaChop: 'Couper / interagir', actionAriaFire: 'Tirer avec le lance-hache',
        toastAxeSelected: 'HACHE sélectionnée (1)',
        toastGunSelected: 'LANCE-HACHE sélectionné (2)\nMaintenez F / TIRER pour arroser',
        toastPlankSelected: 'PLANCHE sélectionnée (3)\nF / PLANCHE pose un mur',
        tutTitle: '{axe} COMMENT JOUER',
        tutMoveTouch: "Touchez n'importe où au sol pour vous y déplacer",
        tutMoveDesktop: 'Déplacez-vous avec WASD ou les flèches',
        tutChopTouch: "Placez-vous près d'un arbre, fantôme, ordinateur ou orbe et maintenez le bouton {axe} <b>COUPER</b>. Il s'illumine quand vous êtes assez proche.",
        tutChopDesktop: "Placez-vous près d'un objet et maintenez <b>F</b> (ou le bouton {axe}) pour couper. Il s'illumine quand vous êtes à portée.",
        tutDoomTouch: 'Touchez <b>3D</b> pour la vue 3D. Utilisez le pavé <b>&#9650;&#9660;&#9668;&#9658;</b> pour tourner et marcher, puis maintenez COUPER.',
        tutDoomDesktop: 'Appuyez sur <b>3D</b> pour la vue DOOM en 3D. Tournez/marchez avec les flèches, coupez avec <b>F</b>.',
        tutEscTouch: 'Couper une cible ouvre sa page. Touchez le bouton <b>ESC</b> (en haut à droite) pour revenir.',
        tutEscDesktop: 'Couper une cible ouvre sa page. Appuyez sur <b>ESC</b> (ou le bouton en haut à droite) pour revenir.',
        tutStart: "C'EST PARTI",
        tutNote: "Coupez les arbres, fantômes, l'ordinateur et l'orbe pour explorer mes projets. Rouvrez ceci à tout moment depuis les réglages <b>{gear}</b>.",
        toastCowboyRideIn: "UN COWBOY ARRIVE\nDE L'EST...",
        toastCowboyDown: 'Le cowboy est à terre...\nil reviendra dans 30s',
        toastCowgirlRideIn: 'ELLE ARRIVE SUR SON COCHON...\nATTENTION AU LASSO',
        toastCowgirlDown: 'Elle est repartie...\nelle reviendra dans 30s',
        toastLassoed: 'ATTRAPÉ AU LASSO !\nPlus lent et impossible de foncer...',
        toastRangedLocked: 'ATTAQUE À DISTANCE BLOQUÉE\nSANTÉ COMPLÈTE REQUISE',
        toastNoPlanks: 'PLUS DE PLANCHES !\nCoupez 3 arbres pour en gagner une',
        toastPlankEarned: '+1 PLANCHE !\nAppuyez sur 3 (ou touchez la puce planche) pour la poser',
    },
};

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

    // Fetches any project preview images not already in the texture cache,
    // reusing the same loading overlay as the initial preload (real progress,
    // driven by this scene's persistent 'progress' listener from preload()
    // above — not a fake timer). Calls back once everything's ready; no-ops
    // straight to the callback if a repeat visit finds everything cached.
    _loadSubWorldAssets(projects, cb) {
        const missing = projects.filter(p => !this.textures.exists(p.key));
        if (!missing.length) { cb(); return; }
        if (typeof window.showGameLoading === 'function') window.showGameLoading();
        missing.forEach(p => this.load.image(p.key, p.path));
        this.load.once('complete', () => {
            if (typeof window.hideGameLoading === 'function') window.hideGameLoading();
            cb();
        });
        this.load.start();
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
        this.contributeSign = this.physics.add.staticImage(worldWidth / 2 + 200, worldHeight / 2 + 550, 'contribute-sign').setScale(4).refreshBody();
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
        downF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
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

    createModeToggle() {
        let btn = document.getElementById('mode-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'mode-toggle';
            document.body.appendChild(btn);
        }
        btn.textContent = '2D';
        btn.setAttribute('aria-label', 'Toggle DOOM 3D view');
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
                // First time in 3D: explain the different controls.
                if (!this._doomIntroShown) {
                    this._doomIntroShown = true;
                    const touch = this.isTouch();
                    this.showToast(
                        touch ? '3D MODE\n◄ ► turn   ▲ ▼ walk\nHold CHOP to swing'
                              : '3D MODE\n← → turn   ↑ ↓ walk\nHold F to chop',
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

        // The help ("?") button and the SFX mute toggle now live INSIDE the
        // gear/settings panel (see _renderSettings) rather than as their own
        // HUD chips. Music was removed entirely. Kept as null so the language
        // re-render + other guards stay happy.
        this._helpBtn = null;
        this._musicBtn = null;
        this._sfxBtn = null;

        // --- Bottom-left HUD row: gear, exit, then game modes — a single flex
        // container so the buttons lay themselves out left-to-right with no
        // hardcoded per-button pixel offsets (which used to overlap once text
        // width varied by language). Gear leads the row; exit sits right of it. ---
        const bottomleft = document.createElement('div');
        bottomleft.id = 'bottomleft-hud';
        document.body.appendChild(bottomleft);
        this._hudEls.push(bottomleft);

        // --- Gear icon: opens the settings panel (theme + language) ---
        const gear = document.createElement('button');
        gear.id = 'gear-btn';
        gear.className = 'pixel-hud-btn';
        gear.innerHTML = '<span class="gear-icon"></span>';
        gear.setAttribute('aria-label', this.t('gearAria'));
        gear.addEventListener('click', () => this.showSettings());
        bottomleft.appendChild(gear);
        this._gearBtn = gear;

        // --- Exit button: reloads back to the intro. ---
        const exit = document.createElement('button');
        exit.id = 'exit-btn';
        exit.className = 'pixel-hud-btn';
        exit.textContent = this.t('exitLabel');
        exit.setAttribute('aria-label', this.t('exitAria'));
        exit.addEventListener('click', () => {
            window.location.reload();
        });
        bottomleft.appendChild(exit);
        this._exitBtn = exit;

        // --- "GAME MODES" button: opens the modes menu (zombies / cowboy /
        // cowgirl), where active players vote each mode on or off. Replaces the
        // three separate always-visible toggle chips. ---
        const extra = document.createElement('div');
        extra.id = 'extra-btns';

        const modesBtn = document.createElement('button');
        modesBtn.id = 'modes-btn';
        modesBtn.className = 'pixel-hud-btn';
        modesBtn.textContent = this.t('gameModesLabel');
        modesBtn.setAttribute('aria-label', this.t('gameModesAria'));
        modesBtn.addEventListener('click', () => this.showGameModes());
        extra.appendChild(modesBtn);
        this._modesBtn = modesBtn;

        // First-time discovery hint: bouncing arrows over the button, gone for
        // good (this browser) the first time the menu is actually opened.
        let modesHintSeen = false;
        try { modesHintSeen = !!localStorage.getItem('modesHintSeen'); } catch (e) {}
        if (!modesHintSeen) {
            const modesHint = document.createElement('div');
            modesHint.id = 'modes-hint';
            modesHint.innerHTML = '<span>&#9660;</span><span>&#9660;</span><span>&#9660;</span>';
            extra.appendChild(modesHint);
            this._modesHintEl = modesHint;
        }
        // Row-toggle refs the old code updated now point at the menu rows; the
        // Game Modes menu builds + wires them (see _buildGameModes).
        this._zombieBtn = null;
        this._cowboyBtn = null;
        this._cowgirlBtn = null;

        bottomleft.appendChild(extra);
        this._buildGameModes();

        // --- Top-left HUD: presence-server status + live FPS readout,
        // side by side so one's text length never nudges the other. ---
        const topleft = document.createElement('div');
        topleft.id = 'topleft-hud';

        const srv = document.createElement('div');
        srv.id = 'server-status';
        srv.textContent = isLikelyMobileDevice() ? 'srv: off' : 'server: inactive';
        topleft.appendChild(srv);
        this._serverStatusEl = srv;

        const fps = document.createElement('div');
        fps.id = 'fps-counter';
        fps.textContent = 'fps: --';
        topleft.appendChild(fps);
        this._fpsEl = fps;
        this._fpsUpdateAt = 0;

        // --- PvP / spectator toggle, right next to the FPS readout. Default is
        // FIGHT: you + anyone else who's also fighting can hit each other.
        // Toggle to SPECTATE to become a harmless ghost to other players. ---
        const pvp = document.createElement('button');
        pvp.id = 'pvp-btn';
        pvp.setAttribute('aria-label', this.t('pvpAria'));
        pvp.addEventListener('click', () => this.setPvpEnabled(!this.pvpEnabled));
        topleft.appendChild(pvp);
        this._pvpBtn = pvp;
        this._updatePvpBtn();

        document.body.appendChild(topleft);
        this._hudEls.push(topleft);

        // --- Rolling 24h unique-visitor chart, top-right under the hearts,
        // left of the minimap. Polls server/index.js's GET /stats. ---
        this._buildStatsHud();

        // --- Top-10 kill-count leaderboard, right under the minimap. ---
        this._buildLeaderboardHud();

        // --- Player hearts (top-right, just left of the minimap camera) ---
        // Health now runs in HALF-heart steps (cowboy bullets cost 0.5, the
        // big zombie 1.5, half-heart pickups restore 0.5).
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

        // --- Tool row: three chips (axe / axe gun / plank), one tap each to
        // switch straight to that tool. Keyboard: 1 / 2 / 3 do the same. ---
        const toolRow = document.createElement('div');
        toolRow.id = 'tool-hud';

        const axeTool = document.createElement('button');
        axeTool.id = 'axe-tool-btn';
        axeTool.className = 'pixel-hud-btn';
        axeTool.setAttribute('aria-label', this.t('axeToolAria'));
        axeTool.innerHTML = '<span class="axe-icon"></span>';
        axeTool.addEventListener('click', () => this.setTool('axe'));
        toolRow.appendChild(axeTool);
        this._axeToolBtn = axeTool;

        const gunTool = document.createElement('button');
        gunTool.id = 'axegun-tool-btn';
        gunTool.className = 'pixel-hud-btn';
        gunTool.setAttribute('aria-label', this.t('axeGunToolAria'));
        gunTool.innerHTML = '<span class="axegun-icon"></span>';
        gunTool.addEventListener('click', () => this.setTool('axegun'));
        toolRow.appendChild(gunTool);
        this._axeGunToolBtn = gunTool;

        const plank = document.createElement('button');
        plank.id = 'plank-tool-btn';
        plank.className = 'pixel-hud-btn';
        plank.setAttribute('aria-label', this.t('plankToolAria'));
        const plankIcon = document.createElement('div');
        plankIcon.className = 'plank-icon';
        const plankVal = document.createElement('span');
        plankVal.className = 'plank-val';
        plankVal.textContent = this.planks;
        plank.appendChild(plankIcon);
        plank.appendChild(plankVal);
        plank.addEventListener('click', () => this.setTool('plank'));
        toolRow.appendChild(plank);
        this._plankHud = plank;
        this._plankVal = plankVal;

        document.body.appendChild(toolRow);
        this._toolHud = toolRow;
        this._hudEls.push(toolRow);
        this._updateToolHud();

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

        // --- Zombie-kill counter (left of the tree score; shown while zombies are on) ---
        const zscore = document.createElement('div');
        zscore.id = 'zscore-hud';
        const zscoreIcon = document.createElement('div');
        zscoreIcon.className = 'zscore-icon';
        const zscoreVal = document.createElement('span');
        zscoreVal.className = 'zscore-val';
        zscoreVal.textContent = this.zombieKills;
        zscore.appendChild(zscoreIcon);
        zscore.appendChild(zscoreVal);
        document.body.appendChild(zscore);
        this._zscoreVal = zscoreVal;
        this._hudEls.push(zscore);

        // --- Cowboy-kill counter (shown while the cowboy duel is on) ---
        const cscore = document.createElement('div');
        cscore.id = 'cscore-hud';
        const cscoreIcon = document.createElement('div');
        cscoreIcon.className = 'cscore-icon';
        const cscoreVal = document.createElement('span');
        cscoreVal.className = 'cscore-val';
        cscoreVal.textContent = this.cowboyKills;
        cscore.appendChild(cscoreIcon);
        cscore.appendChild(cscoreVal);
        document.body.appendChild(cscore);
        this._cscoreVal = cscoreVal;
        this._hudEls.push(cscore);

        // --- Cowgirl-kill counter (shown while the cowgirl mode is on) ---
        const gscore = document.createElement('div');
        gscore.id = 'gscore-hud';
        const gscoreIcon = document.createElement('div');
        gscoreIcon.className = 'gscore-icon';
        const gscoreVal = document.createElement('span');
        gscoreVal.className = 'gscore-val';
        gscoreVal.textContent = this.cowgirlKills;
        gscore.appendChild(gscoreIcon);
        gscore.appendChild(gscoreVal);
        document.body.appendChild(gscore);
        this._gscoreVal = gscoreVal;
        this._hudEls.push(gscore);

        // --- Tutorial popup + settings popup + toast ---
        this._buildTutorial();
        this._buildSettings();
        const toast = document.createElement('div');
        toast.id = 'hud-toast';
        document.body.appendChild(toast);
        this._toast = toast;
        this._hudEls.push(toast);

        document.body.classList.add('hud-ready');
        if (typeof window.hideGameLoading === 'function') window.hideGameLoading();

        // Fire once per session: the player actually reached a playable world.
        // (posthog.capture only exists once posthog.init runs — i.e. a real key is set.)
        if (window.posthog && typeof window.posthog.capture === 'function' && !window.__gameStartedTracked) {
            window.__gameStartedTracked = true;
            window.posthog.capture('game_started');
        }

        // Show the controls tutorial once on entry.
        if (!this.tutorialShown) this.showTutorial();
    }

    _buildTutorial() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        document.body.appendChild(overlay);
        this._tutorial = overlay;
        this._hudEls.push(overlay);
        this._renderTutorial();
    }

    // Rebuilt (not just re-translated) on language change, since innerHTML
    // replacement drops the button's listener — re-bind it every time.
    _renderTutorial() {
        const overlay = this._tutorial;
        if (!overlay) return;
        const wasOpen = overlay.classList.contains('open');
        const touch = this.isTouch();
        const axe = '<span class="axe-icon"></span>';
        const gear = '<span class="gear-icon tutorial-note-icon"></span>';
        const moveKey = touch ? 'TAP' : 'WASD';
        const moveText = touch ? this.t('tutMoveTouch') : this.t('tutMoveDesktop');
        const chopText = (touch ? this.t('tutChopTouch') : this.t('tutChopDesktop')).replace('{axe}', axe);
        const doomText = touch ? this.t('tutDoomTouch') : this.t('tutDoomDesktop');
        const escText = touch ? this.t('tutEscTouch') : this.t('tutEscDesktop');

        overlay.innerHTML = `
            <div class="tutorial-card">
                <h2>${this.t('tutTitle').replace('{axe}', axe)}</h2>
                <div class="tutorial-row"><span class="tutorial-key">${moveKey}</span><span>${moveText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">${axe}</span><span>${chopText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">3D</span><span>${doomText}</span></div>
                <div class="tutorial-row"><span class="tutorial-key">ESC</span><span>${escText}</span></div>
                <button class="tutorial-start">${this.t('tutStart')}</button>
                <div class="tutorial-note">${this.t('tutNote').replace('{gear}', gear)}</div>
            </div>`;
        overlay.querySelector('.tutorial-start').addEventListener('click', () => this.hideTutorial());
        overlay.classList.toggle('open', wasOpen);
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

    // ---- Settings modal (gear icon): light/dark theme + language ----

    _buildSettings() {
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        document.body.appendChild(overlay);
        this._settings = overlay;
        this._hudEls.push(overlay);
        this._renderSettings();
    }

    // Rebuilt on open and on every theme/language change so the active
    // state + button labels always reflect the current choice.
    _renderSettings() {
        const overlay = this._settings;
        if (!overlay) return;
        const wasOpen = overlay.classList.contains('open');
        const LANGS = [['en', 'EN'], ['es', 'ES'], ['zh', '中文'], ['fr', 'FR']];
        overlay.innerHTML = `
            <div class="settings-card">
                <h2>${this.t('settingsTitle')}</h2>
                <div class="settings-section">
                    <div class="settings-label">${this.t('themeLabel')}</div>
                    <div class="settings-choices">
                        <button class="settings-choice-btn${this.theme === 'dark' ? ' active' : ''}" data-theme="dark">${this.t('themeDark')}</button>
                        <button class="settings-choice-btn${this.theme === 'light' ? ' active' : ''}" data-theme="light">${this.t('themeLight')}</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-label">${this.t('languageLabel')}</div>
                    <div class="settings-choices">
                        ${LANGS.map(([code, label]) => `<button class="settings-choice-btn${this.lang === code ? ' active' : ''}" data-lang="${code}">${label}</button>`).join('')}
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-label">${this.t('soundLabel')}</div>
                    <div class="settings-choices">
                        <button class="settings-choice-btn${!this.sounds.sfxMuted ? ' active' : ''}" data-sfx="1">${this.t('sfxOn')}</button>
                        <button class="settings-choice-btn${this.sounds.sfxMuted ? ' active' : ''}" data-sfx="0">${this.t('sfxOff')}</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-label">${this.t('doomPanelLabel')}</div>
                    <div id="doom-controls-slot"></div>
                </div>
                <button class="settings-help">${this.t('helpLabel')}</button>
                <button class="settings-close">${this.t('settingsClose')}</button>
            </div>`;
        overlay.querySelectorAll('[data-theme]').forEach(btn => {
            btn.addEventListener('click', () => this._applyTheme(btn.dataset.theme));
        });
        overlay.querySelectorAll('[data-lang]').forEach(btn => {
            btn.addEventListener('click', () => this._applyLanguage(btn.dataset.lang));
        });
        overlay.querySelectorAll('[data-sfx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const wantMuted = btn.dataset.sfx === '0';
                if (this.sounds.sfxMuted !== wantMuted) this.sounds.toggleSfx();
                this._renderSettings();
            });
        });
        // The live DOOM sliders (src/utils/DoomView.js) are a single DOM node
        // built once — rebuilding overlay.innerHTML above just detached it
        // from the DOM, so re-parent the same node rather than recreate it
        // (recreating would drop its slider listeners).
        if (this.doomView) overlay.querySelector('#doom-controls-slot').appendChild(this.doomView.panel);
        overlay.querySelector('.settings-help').addEventListener('click', () => {
            this.hideSettings();
            this.showTutorial();
        });
        overlay.querySelector('.settings-close').addEventListener('click', () => this.hideSettings());
        overlay.classList.toggle('open', wasOpen);
    }

    showSettings() {
        if (this._settings) this._settings.classList.add('open');
    }

    hideSettings() {
        if (this._settings) this._settings.classList.remove('open');
    }

    // ===== Game Modes menu (voting) =====
    // The three opt-in modes now live behind one "GAME MODES" button. Each row
    // has a ✓ vote (left) and ✗ vote (right) with live counts; active players
    // vote and the majority decides whether the mode is on for EVERYONE.
    _buildGameModes() {
        const overlay = document.createElement('div');
        overlay.id = 'modes-overlay';
        document.body.appendChild(overlay);
        this._modesOverlay = overlay;
        this._hudEls.push(overlay);

        const modes = ['zombies', 'cowboy', 'cowgirl'];
        const labelKey = { zombies: 'zombiesLabel', cowboy: 'cowboyLabel', cowgirl: 'cowgirlLabel' };

        const card = document.createElement('div');
        card.className = 'modes-card';
        const h2 = document.createElement('h2');
        h2.className = 'modes-title';
        h2.textContent = this.t('modesTitle');
        card.appendChild(h2);
        const note = document.createElement('p');
        note.className = 'modes-note';
        note.innerHTML = this.t('modesNote').replace('{check}', '<span class="modes-note-check">✓</span>');
        card.appendChild(note);

        const list = document.createElement('div');
        list.className = 'modes-list';
        this._modeRows = {};
        for (const mode of modes) {
            const row = document.createElement('div');
            row.className = 'mode-row';

            const yesBtn = document.createElement('button');
            yesBtn.className = 'vote-btn yes';
            yesBtn.setAttribute('aria-label', this.t('voteYesAria'));
            yesBtn.innerHTML = '<span class="vote-mark">✓</span><span class="vote-count yes-count">0</span>';
            yesBtn.addEventListener('click', () => this._castVote(mode, 1));

            const name = document.createElement('div');
            name.className = 'mode-name';
            name.innerHTML = `<span class="mode-name-text">${this.t(labelKey[mode])}</span><span class="mode-on-badge">${this.t('modeOn')}</span>`;

            const noBtn = document.createElement('button');
            noBtn.className = 'vote-btn no';
            noBtn.setAttribute('aria-label', this.t('voteNoAria'));
            noBtn.innerHTML = '<span class="vote-mark">✗</span><span class="vote-count no-count">0</span>';
            noBtn.addEventListener('click', () => this._castVote(mode, -1));

            row.appendChild(yesBtn);
            row.appendChild(name);
            row.appendChild(noBtn);
            list.appendChild(row);
            this._modeRows[mode] = {
                el: row, yesBtn, noBtn,
                yesCount: yesBtn.querySelector('.yes-count'),
                noCount: noBtn.querySelector('.no-count'),
                nameText: name.querySelector('.mode-name-text')
            };
        }
        card.appendChild(list);

        const close = document.createElement('button');
        close.className = 'modes-close';
        close.textContent = this.t('settingsClose');
        close.addEventListener('click', () => this.hideGameModes());
        card.appendChild(close);

        overlay.appendChild(card);
        // Click the dark backdrop (not the card itself) to dismiss, same as
        // tapping outside any other modal-style popup.
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideGameModes();
        });
        this._updateModesUI();
    }

    // On (re)connect, push our current votes + PvP state so the server's tally
    // reflects choices we made while it was unreachable (or before a reload).
    _onNetConnectionChange(connected) {
        this._setServerStatus(connected);
        if (!connected) { this._modesSynced = false; return; }
        for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
            if (this._myVotes[mode]) this._network.sendVote(mode, this._myVotes[mode]);
        }
        if (this.pvpEnabled) this._network.sendPvp(true, false);
    }

    showGameModes() {
        if (this._modesOverlay) this._modesOverlay.classList.add('open');
        // They found the button — the discovery hint has done its job.
        if (this._modesHintEl) {
            this._modesHintEl.remove();
            this._modesHintEl = null;
            try { localStorage.setItem('modesHintSeen', '1'); } catch (e) {}
        }
    }
    hideGameModes() { if (this._modesOverlay) this._modesOverlay.classList.remove('open'); }

    // Cast (or, if repeated, clear) our ✓/✗ vote on one mode. We always tell the
    // server (it re-tallies across every active player and echoes the
    // authoritative on/off via _applyServerModes). Until a vote-aware server has
    // actually confirmed a tally, we also decide locally so solo play — and the
    // window before the updated server is deployed — still works instantly.
    _castVote(mode, val) {
        this._myVotes[mode] = (this._myVotes[mode] === val) ? 0 : val;
        if (this._network) this._network.sendVote(mode, this._myVotes[mode]);
        if (!this._modesSynced) {
            this._modeTally[mode] = {
                yes: this._myVotes[mode] === 1 ? 1 : 0,
                no: this._myVotes[mode] === -1 ? 1 : 0,
                on: this._myVotes[mode] === 1
            };
            this._setModeEnabled(mode, this._myVotes[mode] === 1);
        }
        this._updateModesUI();
    }

    // Server told us the live vote tally + resulting on/off for every mode. Once
    // this fires, the server is authoritative (it counts every player, including
    // us) and overrides any optimistic local state.
    _applyServerModes(modes) {
        this._modesSynced = true;
        for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
            if (!modes[mode]) continue;
            this._modeTally[mode] = modes[mode];
            this._setModeEnabled(mode, !!modes[mode].on);
        }
        this._updateModesUI();
    }

    // Enable/disable a mode by name, only when it actually changed (the setters
    // spawn/despawn entities, so calling them redundantly every tick is wasteful).
    _setModeEnabled(mode, on) {
        if (mode === 'zombies' && on !== this.zombiesEnabled) this.setZombiesEnabled(on);
        else if (mode === 'cowboy' && on !== this.cowboyEnabled) this.setCowboyEnabled(on);
        else if (mode === 'cowgirl' && on !== this.cowgirlEnabled) this.setCowgirlEnabled(on);
    }

    // Repaint vote counts, my-vote highlights and the ON badges.
    _updateModesUI() {
        if (this._modeRows) {
            const state = { zombies: this.zombiesEnabled, cowboy: this.cowboyEnabled, cowgirl: this.cowgirlEnabled };
            for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
                const row = this._modeRows[mode];
                if (!row) continue;
                const t = this._modeTally[mode] || { yes: 0, no: 0, on: false };
                row.yesCount.textContent = t.yes;
                row.noCount.textContent = t.no;
                const my = this._myVotes[mode];
                row.yesBtn.classList.toggle('mine', my === 1);
                row.noBtn.classList.toggle('mine', my === -1);
                row.el.classList.toggle('on', !!state[mode]);
            }
        }
        if (this._modesBtn) this._modesBtn.classList.toggle('active', this._anyGameModeOn());
    }

    // ===== PvP / spectator =====
    // Default is spectator (harmless ghost). Toggle on to become a fighter:
    // you can strike — and be struck by — any other player who's also fighting.
    setPvpEnabled(on) {
        this.pvpEnabled = on;
        this._updatePvpBtn();
        if (this._network) this._network.sendPvp(on, !on); // spectator = not fighting
        // Refresh peer look (solid vs translucent) right away.
        for (const rp of (this.remotePlayers || [])) {
            const fightable = rp.pvp && !rp.spectator && this.pvpEnabled;
            rp.sprite.setAlpha(fightable ? 0.95 : 0.6);
        }
        this.showToast(on ? this.t('toastPvpOn') : this.t('toastPvpOff'), 2200);
    }

    _updatePvpBtn() {
        if (!this._pvpBtn) return;
        this._pvpBtn.textContent = this.pvpEnabled ? this.t('pvpFight') : this.t('pvpSpectate');
        this._pvpBtn.classList.toggle('on', this.pvpEnabled);
        this._pvpBtn.setAttribute('aria-label', this.t('pvpAria'));
    }

    // Another fighter's hit was forwarded to us — take the damage (and any
    // knockback) locally. `kb` is the angle THEY were dashing at when they
    // hit us (radians); we launch ourselves along it, same push as an NPC
    // gets from the same move (see _dashKnockback) and same decay-to-rest
    // mechanic as a bomb launch (the shared `_knockbackUntil` window in
    // update()/updateDoomMovement()).
    _onPvpHit(msg) {
        if (!this.pvpEnabled) return; // safety: server shouldn't forward, but guard
        const dmg = Math.max(0, Math.min(3, Number(msg && msg.dmg) || 0));
        if (dmg <= 0) return;
        this.cameras.main.shake(120, 0.008);
        this.damage(dmg);
        const kb = msg && msg.kb;
        if (typeof kb === 'number' && Number.isFinite(kb)) {
            this.player.setVelocity(Math.cos(kb) * this.DASH_KNOCKBACK_SPEED, Math.sin(kb) * this.DASH_KNOCKBACK_SPEED);
            this._knockbackUntil = this.time.now + this.DASH_KNOCKBACK_STUN;
        }
    }

    // Main-world camera background: black in dark mode, dark grey in light mode
    // (light mode used to leave the world pitch black, which looked unfinished).
    _mainBgColor() {
        return this.theme === 'light' ? '#3a3a3a' : '#000000';
    }

    _applyTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        this.theme = theme;
        try { localStorage.setItem('theme', theme); } catch (e) {}
        document.body.classList.toggle('theme-light', theme === 'light');
        // Recolour the live world unless we're inside a sub-world (which owns
        // its own tinted background).
        if (!this.inOhs && this.cameras && this.cameras.main) {
            this.cameras.main.setBackgroundColor(this._mainBgColor());
        }
        this._renderSettings();
    }

    // Re-renders every piece of currently-built UI chrome that carries
    // translated text: HUD button labels/aria-labels, the tutorial card,
    // and the settings panel itself. In-flight toasts aren't retranslated
    // (they're transient); new ones already pick up the new language via t().
    _applyLanguage(lang) {
        if (!I18N[lang]) return;
        this.lang = lang;
        try { localStorage.setItem('lang', lang); } catch (e) {}

        if (this._helpBtn) this._helpBtn.setAttribute('aria-label', this.t('helpAria'));
        if (this._musicBtn) this._musicBtn.setAttribute('aria-label', this.t('musicAria'));
        if (this._sfxBtn) this._sfxBtn.setAttribute('aria-label', this.t('sfxAria'));
        if (this._exitBtn) {
            this._exitBtn.textContent = this.t('exitLabel');
            this._exitBtn.setAttribute('aria-label', this.t('exitAria'));
        }
        if (this._gearBtn) this._gearBtn.setAttribute('aria-label', this.t('gearAria'));
        if (this._modesBtn) {
            this._modesBtn.textContent = this.t('gameModesLabel');
            this._modesBtn.setAttribute('aria-label', this.t('gameModesAria'));
        }
        this._updatePvpBtn();
        // Re-label the game-modes menu (title, note, mode names, ON badges).
        if (this._modesOverlay) {
            const titleEl = this._modesOverlay.querySelector('.modes-title');
            if (titleEl) titleEl.textContent = this.t('modesTitle');
            const noteEl = this._modesOverlay.querySelector('.modes-note');
            if (noteEl) noteEl.innerHTML = this.t('modesNote').replace('{check}', '<span class="modes-note-check">✓</span>');
            const closeEl = this._modesOverlay.querySelector('.modes-close');
            if (closeEl) closeEl.textContent = this.t('settingsClose');
            const labelKey = { zombies: 'zombiesLabel', cowboy: 'cowboyLabel', cowgirl: 'cowgirlLabel' };
            for (const mode of ['zombies', 'cowboy', 'cowgirl']) {
                const row = this._modeRows && this._modeRows[mode];
                if (row && row.nameText) row.nameText.textContent = this.t(labelKey[mode]);
            }
        }
        if (this._axeToolBtn) this._axeToolBtn.setAttribute('aria-label', this.t('axeToolAria'));
        if (this._axeGunToolBtn) this._axeGunToolBtn.setAttribute('aria-label', this.t('axeGunToolAria'));
        if (this._plankHud) this._plankHud.setAttribute('aria-label', this.t('plankToolAria'));
        if (this.tool) this._updateToolHud();

        this._renderTutorial();
        this._renderSettings();
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

    // Take damage in HEARTS (0.5 steps). Zenith mode makes the player
    // invincible, so damage silently no-ops while it's running.
    damage(amount = 1) {
        if (!this._hearts || !this._hearts.length) return;
        if (this.time.now < this._invincibleUntil) return;
        if (this.health <= 0) return;
        const prev = this.health;
        this.health = Math.max(0, Math.round((this.health - amount) * 2) / 2);

        // Explode every heart that just went from alive to fully empty.
        for (let i = 0; i < this._hearts.length; i++) {
            const wasAlive = prev > i;
            const nowDead = this.health <= i;
            if (wasAlive && nowDead) {
                const heart = this._hearts[i];
                const r = heart.getBoundingClientRect();
                this._spawnHeartParticles(r.left + r.width / 2, r.top + r.height / 2);
                heart.classList.add('exploding');
                setTimeout(() => {
                    heart.classList.remove('exploding');
                    this._renderHearts();
                }, 420);
            }
        }
        this._renderHearts();

        // Out of hearts → the player is dead. Let the final heart pop play out,
        // then raise the GAME OVER screen (restart / exit).
        if (this.health === 0) {
            setTimeout(() => this._showGameOver(), 700);
        }
    }

    // Full-screen GAME OVER overlay. Under the title sit two buttons: EXIT
    // (left, resets the visitor gate) and RESTART? (right, rainbow-glowing,
    // with a 5s countdown that auto-sends the player back to the 2D world).
    _showGameOver() {
        if (this._gameOverEl) return;
        this._isGameOver = true; // freezes update() — see the check at its top
        this.player.setVelocity(0, 0);
        // Dying with the settings/modes/tutorial popup open (e.g. a PvP hit
        // lands while you're mid-menu) would otherwise leave it open behind
        // the game-over overlay — close everything so it's a clean screen.
        this.hideSettings();
        this.hideGameModes();
        if (this._tutorial) this._tutorial.classList.remove('open');
        document.body.classList.add('game-over-open'); // hides the gameplay HUD
        const overlay = document.createElement('div');
        overlay.id = 'game-over';

        const title = document.createElement('div');
        title.id = 'game-over-title';
        title.textContent = this.t('gameOverLabel');
        overlay.appendChild(title);

        // Final score + share — the "beat this" hook, shown every death
        // regardless of whether this run cracked the top 10.
        const cowboy = this.cowboyKills || 0;
        const cowgirl = this.cowgirlKills || 0;
        const zombie = this.zombieKills || 0;
        const total = cowboy + cowgirl + zombie;

        const summary = document.createElement('div');
        summary.id = 'go-summary';

        const scorePanel = document.createElement('div');
        scorePanel.id = 'go-score-panel';
        scorePanel.innerHTML = `
            <div id="go-score-label">${this.t('finalScoreLabel')}: ${total}</div>
            <div id="go-score-breakdown">
                <span class="lb-icon lb-icon-cowboy"></span><span class="lb-num lb-num-cowboy">${cowboy}</span>
                <span class="lb-icon lb-icon-cowgirl"></span><span class="lb-num lb-num-cowgirl">${cowgirl}</span>
                <span class="lb-icon lb-icon-zombie"></span><span class="lb-num lb-num-zombie">${zombie}</span>
            </div>`;
        summary.appendChild(scorePanel);

        const share = document.createElement('button');
        share.id = 'go-share-btn';
        share.textContent = this.t('shareLabel');
        share.setAttribute('aria-label', this.t('shareAria'));
        share.addEventListener('click', () => {
            const text = this._buildShareText(total, cowboy, cowgirl, zombie);
            const url = window.location.origin + window.location.pathname;
            if (navigator.share) {
                navigator.share({ title: 'Chompixel', text, url }).catch(() => {});
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(`${text} ${url}`).then(() => {
                    share.textContent = this.t('shareCopiedLabel');
                    setTimeout(() => { share.textContent = this.t('shareLabel'); }, 2000);
                }).catch(() => {});
            }
        });
        summary.appendChild(share);
        overlay.appendChild(summary);

        // New-high-score initials entry — only when this run's total would
        // actually crack the cached top 10 (fewer than 10 entries yet, or it
        // beats the current 10th place).
        const cache = this._leaderboardCache || [];
        const qualifies = total > 0 && (cache.length < 10 || total > cache[cache.length - 1].total);
        if (qualifies) {
            const hsRow = document.createElement('div');
            hsRow.id = 'go-highscore-row';

            const label = document.createElement('div');
            label.id = 'go-highscore-label';
            label.textContent = this.t('newHighScoreLabel');
            hsRow.appendChild(label);

            const sub = document.createElement('div');
            sub.id = 'go-highscore-sub';
            sub.textContent = this.t('enterInitialsLabel');
            hsRow.appendChild(sub);

            const form = document.createElement('div');
            form.id = 'go-highscore-form';

            const input = document.createElement('input');
            input.id = 'go-initials-input';
            input.maxLength = 3;
            input.autocomplete = 'off';
            input.spellcheck = false;
            try { input.value = (localStorage.getItem('lbName') || '').slice(0, 3); } catch (e) {}
            input.addEventListener('input', () => {
                input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
            });

            const submit = document.createElement('button');
            submit.id = 'go-submit-btn';
            submit.textContent = this.t('submitScoreLabel');
            submit.setAttribute('aria-label', this.t('submitScoreAria'));
            submit.addEventListener('click', () => {
                const name = input.value.trim();
                if (!name) return;
                try { localStorage.setItem('lbName', name); } catch (e) {}
                submit.disabled = true;
                this._submitScore(name, cowboy, cowgirl, zombie).then(() => { hsRow.remove(); });
            });

            form.appendChild(input);
            form.appendChild(submit);
            hsRow.appendChild(form);
            overlay.appendChild(hsRow);
        }

        const row = document.createElement('div');
        row.id = 'game-over-btns';

        // RESTART? — normally a rainbow-glow 5s auto-countdown reload straight
        // back into the 2D world. Skipped when a new high score is on the
        // table so the auto-reload can't yank the initials form away mid-entry
        // — the player restarts manually once they're done with it.
        const restart = document.createElement('button');
        restart.id = 'restart-btn';
        restart.setAttribute('aria-label', this.t('restartAria'));
        const goRestart = () => { clearInterval(this._gameOverTimer); window.location.reload(); };
        restart.addEventListener('click', goRestart);
        if (qualifies) {
            restart.textContent = this.t('restartLabel');
        } else {
            let secs = 5;
            const paint = () => { restart.innerHTML = `${this.t('restartLabel')} <span class="restart-secs">${secs}</span>`; };
            paint();
            this._gameOverTimer = setInterval(() => {
                secs -= 1;
                paint();
                if (secs <= 0) goRestart();
            }, 1000);
        }

        // EXIT — reload back to the intro.
        const exit = document.createElement('button');
        exit.id = 'game-over-exit';
        exit.textContent = this.t('exitLabel');
        exit.setAttribute('aria-label', this.t('exitGameAria'));
        exit.addEventListener('click', () => {
            clearInterval(this._gameOverTimer);
            window.location.reload();
        });

        // DOM order: EXIT first (left), then RESTART? (right).
        row.appendChild(exit);
        row.appendChild(restart);

        overlay.appendChild(row);
        document.body.appendChild(overlay);
        this._gameOverEl = overlay;
    }

    // Legacy single-heart hit (bombs, regular zombies).
    loseHeart() { this.damage(1); }

    heal(amount = 0.5) {
        this.health = Math.min(this.maxHealth, Math.round((this.health + amount) * 2) / 2);
        this._renderHearts();
    }

    // Paint the heart row from this.health: full / half / lost per slot.
    _renderHearts() {
        if (!this._hearts) return;
        this._hearts.forEach((h, i) => {
            if (h.classList.contains('exploding')) return; // let the pop finish
            h.classList.toggle('lost', this.health <= i);
            h.classList.toggle('half', this.health > i && this.health < i + 1);
        });
    }

    refillHearts() {
        this.health = this.maxHealth;
        this._hearts.forEach(h => h.classList.remove('lost', 'half', 'exploding'));
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
    // i18n lookup — falls back to English, then the raw key, so a missing
    // translation never renders blank.
    t(key) {
        const table = I18N[this.lang] || I18N.en;
        return table[key] ?? I18N.en[key] ?? key;
    }

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
        clearInterval(this._statsPollTimer);
        clearInterval(this._leaderboardPollTimer);
        this._stopTutorialParticles();
        if (this._hudEls) this._hudEls.forEach(el => el.remove());
        this._hudEls = [];
        document.body.classList.remove('hud-ready', 'touch', 'zombies-on', 'cowboy-on', 'cowgirl-on');
    }

    // Reflects NetworkManager's live WebSocket state — "active" means the
    // presence server (the EC2 Spot box) is actually up and reachable right now.
    // Phones get the short form: "server: active" is wide enough at any
    // legible font size to still run into the hearts/minimap cluster on the
    // right, even stacked in its own row.
    _setServerStatus(connected) {
        if (!this._serverStatusEl) return;
        const text = isLikelyMobileDevice()
            ? (connected ? 'srv: on' : 'srv: off')
            : (connected ? 'server: active' : 'server: inactive');
        this._serverStatusEl.textContent = text;
        this._serverStatusEl.classList.toggle('active', connected);
        this._serverStatusEl.classList.toggle('inactive', !connected);
    }

    // Rolling 24h unique-visitor chart: white-bordered box, rainbow polyline,
    // white axes, one point per hour, plus a peak readout and a total-unique
    // line below. Pulls from server/index.js's GET /stats (hashed IPs,
    // bucketed by hour — see that file for the privacy/persistence notes).
    _buildStatsHud() {
        const wrap = document.createElement('div');
        wrap.id = 'stats-hud';

        const box = document.createElement('div');
        box.id = 'stats-chart-box';

        const peak = document.createElement('div');
        peak.id = 'stats-peak';
        peak.textContent = 'peak: —';
        box.appendChild(peak);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.id = 'stats-svg';
        svg.setAttribute('viewBox', '0 0 200 80');
        svg.setAttribute('preserveAspectRatio', 'none');

        const defs = document.createElementNS(svgNS, 'defs');
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.id = 'stats-rainbow';
        grad.setAttribute('x1', '0');
        grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '200');
        grad.setAttribute('y2', '0');
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        [['0%', '#ff2d55'], ['16%', '#ff9500'], ['33%', '#ffe500'], ['50%', '#34d158'],
         ['66%', '#00c7ff'], ['83%', '#5e5ce6'], ['100%', '#ff2dd4']].forEach(([offset, color]) => {
            const stop = document.createElementNS(svgNS, 'stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', color);
            grad.appendChild(stop);
        });
        defs.appendChild(grad);
        svg.appendChild(defs);

        const yAxis = document.createElementNS(svgNS, 'line');
        yAxis.setAttribute('class', 'stats-axis');
        yAxis.setAttribute('x1', '10'); yAxis.setAttribute('y1', '4');
        yAxis.setAttribute('x2', '10'); yAxis.setAttribute('y2', '70');
        svg.appendChild(yAxis);

        const xAxis = document.createElementNS(svgNS, 'line');
        xAxis.setAttribute('class', 'stats-axis');
        xAxis.setAttribute('x1', '10'); xAxis.setAttribute('y1', '70');
        xAxis.setAttribute('x2', '196'); xAxis.setAttribute('y2', '70');
        svg.appendChild(xAxis);

        const line = document.createElementNS(svgNS, 'polyline');
        line.id = 'stats-line';
        svg.appendChild(line);

        box.appendChild(svg);
        wrap.appendChild(box);

        const total = document.createElement('div');
        total.id = 'stats-total';
        total.textContent = 'total users (24h): —';
        wrap.appendChild(total);

        document.body.appendChild(wrap);
        this._hudEls.push(wrap);
        this._statsPeakEl = peak;
        this._statsLineEl = line;
        this._statsTotalEl = total;

        this._fetchStats();
        this._statsPollTimer = setInterval(() => this._fetchStats(), 5 * 60 * 1000);
    }

    _fetchStats() {
        fetch(STATS_URL).then(r => (r.ok ? r.json() : null)).then(data => {
            if (data) this._renderStats(data);
        }).catch(() => {});
    }

    _renderStats({ hourly, peak, totalUnique24h }) {
        if (!this._statsLineEl || !Array.isArray(hourly) || hourly.length === 0) return;
        const maxCount = Math.max(peak, 1); // avoid a divide-by-zero when everything's 0
        const left = 10, right = 196, top = 6, bottom = 70;
        const stepX = (right - left) / (hourly.length - 1 || 1);
        const points = hourly.map((h, i) => {
            const x = left + i * stepX;
            const y = bottom - (h.count / maxCount) * (bottom - top);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        this._statsLineEl.setAttribute('points', points);
        this._statsPeakEl.textContent = `peak: ${peak}`;
        this._statsTotalEl.textContent = `total users (24h): ${totalUnique24h}`;
    }

    // ===== Global top-10 leaderboard =====
    // Lifetime cowboy/cowgirl/zombie kill totals (each already tracked +
    // persisted client-side — see the constructor's localStorage reads)
    // self-reported to server/index.js's GET /leaderboard + POST /score.
    // Same trust model as PvP hit relaying elsewhere in this file: the
    // server never re-derives these numbers itself, it just clamps + ranks
    // whatever a client claims — fine for a portfolio game's top-10 list,
    // not an anti-cheat system.
    _buildLeaderboardHud() {
        const wrap = document.createElement('div');
        wrap.id = 'leaderboard-hud';

        const title = document.createElement('div');
        title.id = 'lb-title';
        title.textContent = this.t('lbTitle');
        wrap.appendChild(title);

        const legend = document.createElement('div');
        legend.id = 'lb-legend';
        legend.innerHTML = '<span class="lb-icon lb-icon-cowboy"></span>' +
            '<span class="lb-icon lb-icon-cowgirl"></span>' +
            '<span class="lb-icon lb-icon-zombie"></span>';
        wrap.appendChild(legend);

        const list = document.createElement('div');
        list.id = 'lb-list';
        wrap.appendChild(list);

        document.body.appendChild(wrap);
        this._hudEls.push(wrap);
        this._lbListEl = list;
        this._leaderboardCache = [];

        this._fetchLeaderboard();
        this._leaderboardPollTimer = setInterval(() => this._fetchLeaderboard(), 5 * 60 * 1000);
    }

    _fetchLeaderboard() {
        fetch(LEADERBOARD_URL).then(r => (r.ok ? r.json() : null)).then(data => {
            if (Array.isArray(data)) { this._leaderboardCache = data; this._renderLeaderboard(data); }
        }).catch(() => {});
    }

    _renderLeaderboard(list) {
        if (!this._lbListEl) return;
        this._lbListEl.innerHTML = '';
        if (!list.length) {
            const empty = document.createElement('div');
            empty.id = 'lb-empty';
            empty.textContent = this.t('lbEmpty');
            this._lbListEl.appendChild(empty);
            return;
        }
        list.forEach((entry, i) => {
            const row = document.createElement('div');
            row.className = 'lb-row';
            row.innerHTML = `
                <div class="lb-row-top">
                    <span class="lb-rank">${i + 1}.</span>
                    <span class="lb-name">${entry.name}</span>
                    <span class="lb-total">${entry.total}</span>
                </div>
                <div class="lb-row-breakdown">
                    <span class="lb-icon lb-icon-cowboy"></span><span class="lb-num lb-num-cowboy">${entry.cowboy}</span>
                    <span class="lb-icon lb-icon-cowgirl"></span><span class="lb-num lb-num-cowgirl">${entry.cowgirl}</span>
                    <span class="lb-icon lb-icon-zombie"></span><span class="lb-num lb-num-zombie">${entry.zombie}</span>
                </div>`;
            this._lbListEl.appendChild(row);
        });
    }

    // Submits this browser's current lifetime kill totals (called from the
    // new-high-score flow in _showGameOver()) and re-renders the panel with
    // whatever the server ends up returning — that reflects the real top 10
    // even if this particular submission didn't end up making the cut.
    _submitScore(name, cowboy, cowgirl, zombie) {
        return fetch(SCORE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, cowboy, cowgirl, zombie }),
        }).then(r => (r.ok ? r.json() : null)).then(data => {
            if (Array.isArray(data)) { this._leaderboardCache = data; this._renderLeaderboard(data); }
            return data;
        }).catch(() => null);
    }

    _buildShareText(total, cowboy, cowgirl, zombie) {
        return this.t('shareText')
            .replace('{total}', total).replace('{cowboy}', cowboy)
            .replace('{cowgirl}', cowgirl).replace('{zombie}', zombie);
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
        const actionDown = downF.isDown || this.actionHeld;
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
    }

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
    }

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
    }

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
    }

    // Direction suffix ('up'/'down'/'left'/'right'/'idle') matching whatever
    // <dir>-me animation is currently playing on the local player, so remote
    // clients can mirror it on their copy of our ghost.
    _netDirection() {
        const key = this.player.anims.currentAnim && this.player.anims.currentAnim.key;
        return key ? key.replace('-me', '') : 'idle';
    }

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
    }

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
        const actionDown = downF.isDown || this.actionHeld;
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
                this._navDirty = true; // a blocker is gone — zombies can re-path through
                this.logs += 1;
                // Persist the running tree-cut total + update the HUD counter.
                try { localStorage.setItem('treesCut', this.logs); } catch (e) {}
                if (this._scoreVal) this._scoreVal.textContent = this.logs;
                // Every 3 trees bank one plank (press 3 to place them).
                this._treesTowardPlank += 1;
                if (this._treesTowardPlank >= 3) {
                    this._treesTowardPlank = 0;
                    this.planks += 1;
                    if (this._plankVal) this._plankVal.textContent = this.planks;
                    if (this.planks === 1) this.showToast(this.t('toastPlankEarned'), 3200);
                }
                // Chopped the very last tree? The whole forest regrows.
                if (this.trees.countActive(true) === 0) {
                    this.time.delayedCall(900, () => {
                        this._spawnTrees();
                        this._navDirty = true;
                        this.showToast('THE FOREST REGROWS...', 2600);
                    });
                }
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

    // True while any of the opt-in game modes (zombies / cowboy / cowgirl) is
    // running — either toggled locally or enabled by the live majority vote.
    _anyGameModeOn() {
        return !!(this.zombiesEnabled || this.cowboyEnabled || this.cowgirlEnabled);
    }

    // How many chops it takes to open an entity's iframe/sub-page. Doubles
    // (3 -> 6) while a game mode is on, so opening a project is a real commitment
    // when the world is dangerous.
    _entityChopsNeeded() {
        return this._anyGameModeOn() ? 6 : 3;
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
                if (this.computerChops >= this._entityChopsNeeded()) {
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
                if (this.ohsChops >= this._entityChopsNeeded()) { this.sounds.smash(); this.enterOhsWorld(); }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    }

    // Chop Brown University 3x -> enter the Brown world (shape up / bloom /
    // chipathon), the same in-place swap as the OHS world.
    hitBrown(axe, school) {
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
                this.brownChops++;
                if (this.brownChops >= this._entityChopsNeeded()) { this.sounds.smash(); this.enterBrownWorld(); }
            }
        });
        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
    }

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
    }

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
    }

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
    }

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
    }

    // Chop a zombie: 2 damage (one-shots a regular, chips away at a big one).
    hitZombie(axe, z) {
        if (!this.canChop || !z.active) return;
        this.canChop = false;
        this.sounds.chop();
        this._damageZombie(z, 2);
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    _navBlockedAt(x, y) {
        if (!this._navGrid) return false;
        const CELL = this.NAV_CELL, cols = this._navCols;
        const gx = Phaser.Math.Clamp(Math.floor(x / CELL), 0, cols - 1);
        const gy = Phaser.Math.Clamp(Math.floor(y / CELL), 0, cols - 1);
        return !!this._navGrid[gy * cols + gx];
    }

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
    }

    // ===== Tools & planks =====

    setTool(tool) {
        if (this.tool === tool) return;
        this.tool = tool;
        this._updateToolHud();
        const messages = {
            axe: this.t('toastAxeSelected'),
            axegun: this.t('toastGunSelected'),
            plank: this.t('toastPlankSelected'),
        };
        this.showToast(messages[tool] || '', 1600);
    }

    // Reflects the current tool on the 3-way tool row (which chip is lit up)
    // and on the universal action button (its icon + label become FIRE for
    // the axe gun, PLANK for planks, CHOP otherwise).
    _updateToolHud() {
        if (this._axeToolBtn) this._axeToolBtn.classList.toggle('selected', this.tool === 'axe');
        if (this._axeGunToolBtn) this._axeGunToolBtn.classList.toggle('selected', this.tool === 'axegun');
        if (this._plankHud) this._plankHud.classList.toggle('selected', this.tool === 'plank');
        if (this._actionBtn) {
            const label = this._actionBtn.querySelector('.action-label');
            const icon = this._actionBtn.querySelector('.axe-icon, .axegun-icon');
            if (label) label.textContent = this.tool === 'plank' ? this.t('actionPlank') : (this.tool === 'axegun' ? this.t('actionFire') : this.t('actionChop'));
            if (icon) icon.className = this.tool === 'axegun' ? 'axegun-icon' : 'axe-icon';
            this._actionBtn.setAttribute('aria-label', this.tool === 'axegun' ? this.t('actionAriaFire') : this.t('actionAriaChop'));
        }
    }

    // Drop a plank wall just ahead of the player (facing direction in 2D,
    // view direction in DOOM). Zombies path around it — or chew through it.
    _placePlank() {
        if (this.planks <= 0) {
            this.showToast(this.t('toastNoPlanks'), 2200);
            return;
        }
        let dx = 1, dy = 0;
        if (this.is3D) {
            dx = Math.cos(this.doomAngle); dy = Math.sin(this.doomAngle);
        } else {
            const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1], none: [1, 0] };
            [dx, dy] = dirs[this.lastDirection] || dirs.right;
        }
        const px = Phaser.Math.Clamp(this.player.x + dx * 85, 40, 1960);
        const py = Phaser.Math.Clamp(this.player.y + dy * 85, 40, 1960);
        const plank = this.plankGroup.create(px, py, 'plank').setScale(3).refreshBody();
        plank._hp = 5;             // zombie bites it can absorb
        plank._userHp = 3;         // axe chops the player needs to break it back down
        plank.setDepth(4);
        this.planks -= 1;
        if (this._plankVal) this._plankVal.textContent = this.planks;
        this._navDirty = true;     // zombies + the cowboy re-path around it
        this.sounds.chop();
        this._pixelBurst(px, py, {
            colors: [0x8b5a2b, 0xa9772f, 0xc9a24a],
            count: 12, minSpeed: 60, maxSpeed: 180, gravity: 420
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f', '#c9a24a'], count: 12 });
        }
    }

    // A zombie pressed against a plank gnaws it down over time (big zombies
    // chew twice as fast). Five bites and it's splinters.
    _zombieBitesPlank(z, plank) {
        const now = this.time.now;
        if (now < (plank._lastBite || 0) + 600) return;
        plank._lastBite = now;
        plank._hp -= z._big ? 2 : 1;
        this.tweens.add({
            targets: plank,
            x: { value: plank.x + Phaser.Math.Between(-3, 3), duration: 40, yoyo: true, repeat: 2 },
            alpha: { value: 0.55 + (plank._hp / 5) * 0.45, duration: 80 }
        });
        this._pixelBurst(plank.x, plank.y, {
            colors: [0x8b5a2b, 0x6b431d],
            count: 5, minSpeed: 50, maxSpeed: 150, gravity: 420
        });
        if (plank._hp <= 0) {
            const px = plank.x, py = plank.y;
            plank.destroy();
            this._navDirty = true;
            this.sounds.smash();
            this._pixelBurst(px, py, {
                colors: [0x8b5a2b, 0xa9772f, 0xc9a24a, 0x6b431d],
                count: 18, minSpeed: 90, maxSpeed: 260, gravity: 520
            });
            if (this.doomView && this.doomView.active) {
                this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f', '#c9a24a'], count: 18 });
            }
        }
    }

    // Player chops their own plank back down with the axe — takes 3 chops now,
    // each one splinters + fades it a little, unlike the slow multi-bite grind
    // zombies have to do.
    _axeHitsPlank(axe, plank) {
        if (!this.canChop || !plank.active) return;
        this.canChop = false;
        this.sounds.chop();
        const px = plank.x, py = plank.y;

        if (plank._userHp === undefined) plank._userHp = 3;
        plank._userHp -= 1;

        if (plank._userHp > 0) {
            // Not broken yet — shake, fade a step, and spit a small chip burst.
            this.tweens.add({
                targets: plank,
                x: { value: plank.x + Phaser.Math.Between(-4, 4), duration: 45, yoyo: true, repeat: 2 },
                alpha: { value: 0.55 + (plank._userHp / 3) * 0.45, duration: 90 }
            });
            this._pixelBurst(px, py, {
                colors: [0x8b5a2b, 0x6b431d, 0xa9772f],
                count: 6, minSpeed: 60, maxSpeed: 170, gravity: 460
            });
            if (this.doomView && this.doomView.active) {
                this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f'], count: 6 });
            }
            this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
            return;
        }

        plank.destroy();
        this._navDirty = true;
        this.sounds.smash();
        this._pixelBurst(px, py, {
            colors: [0x8b5a2b, 0xa9772f, 0xc9a24a, 0x6b431d],
            count: 18, minSpeed: 90, maxSpeed: 260, gravity: 520
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(px, py, { colors: ['#8b5a2b', '#a9772f', '#c9a24a'], count: 18 });
        }
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    }

    // True if any active plank's rectangle sits on the segment between the
    // two points — used to make enemy ranged attacks (bullets, fire breath)
    // respect plank cover the same way physics collisions already do.
    _lineBlockedByPlank(x1, y1, x2, y2) {
        if (!this.plankGroup) return false;
        const line = new Phaser.Geom.Line(x1, y1, x2, y2);
        for (const p of this.plankGroup.getChildren()) {
            if (p.active && Phaser.Geom.Intersects.LineToRectangle(line, p.getBounds())) return true;
        }
        return false;
    }

    // ===== Ranged slash (Hollow-Knight style) =====

    // Ranged is a FULL-HEALTH-only privilege: fire the slash if the player has
    // every heart, otherwise nudge them with a throttled warning. Melee (the
    // axe body) is unaffected and keeps working while hurt.
    _tryFireSlash(dx, dy) {
        if (this.health >= this.maxHealth) { this._fireSlash(dx, dy); return true; }
        const now = this.time.now;
        if (!this._rangedWarnAt || now - this._rangedWarnAt > 2500) {
            this._rangedWarnAt = now;
            this.showToast(this.t('toastRangedLocked'), 1400);
        }
        return false;
    }

    // Launch a flying slash arc. 1 damage — two of these kill a regular
    // zombie; the axe itself does 2.
    _fireSlash(dx, dy) {
        const s = this.slashGroup.create(this.player.x + dx * 42, this.player.y + dy * 42, 'fxSlash');
        s.setScale(0.55).setDepth(15998).setAlpha(0.95).setTint(0x8ff0ff);
        s.setRotation(Math.atan2(dy, dx));
        s.body.setSize(46, 46, true);
        s.setVelocity(dx * 520, dy * 520);
        if (this.miniMap) this.miniMap.ignore(s);
        // Ranged, not infinite: fizzles out after ~350px of flight.
        this.time.delayedCall(650, () => { if (s.active) this._popSlash(s, true); });
    }

    _slashHitsZombie(s, z) {
        if (!s.active || !z.active) return;
        this._popSlash(s);
        this._damageZombie(z, 1);
    }

    // The slash dissolves — quietly when it just runs out of range, with a
    // little cyan sparkle when it actually hit something.
    _popSlash(s, quiet = false) {
        if (!s.active) return;
        const sx = s.x, sy = s.y;
        s.destroy();
        if (quiet) return;
        this._pixelBurst(sx, sy, {
            colors: [0x8ff0ff, 0xffffff, 0x00c7ff],
            count: 8, minSpeed: 60, maxSpeed: 180, gravity: 260
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(sx, sy, { colors: ['#8ff0ff', '#ffffff', '#00c7ff'], count: 8 });
        }
    }

    // ===== Axe gun (rapid-fire tool) =====

    // Twin-stick aim: 2D mouse/mouse-look angle from the player to the
    // cursor's world position. Touch has no cursor, so it falls back to the
    // player's last walking direction (matches the mobile FIRE button's
    // original "shoot the way you're facing" behavior).
    _axeGunAimAngle() { return this._aimAngle(); }

    // Shared aim angle for every player attack (melee axe swing, ranged slash,
    // axe gun): point at the mouse cursor's world position on desktop, fall
    // back to the last walking direction on touch (no cursor there). In 3D the
    // whole world is aimed via doomAngle, so use that.
    _aimAngle() {
        if (this.is3D) return this.doomAngle;
        if (!this.isTouch()) {
            const p = this.input.activePointer;
            return Math.atan2(p.worldY - this.player.y, p.worldX - this.player.x);
        }
        const dirs = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 };
        return dirs[this.facingDirection] || 0;
    }

    // Throws a small tumbling hatchet in the given (unit) direction. No
    // full-health gate like the slash — this is a distinct ranged tool, kept
    // in check purely by its low per-hit damage + fire-rate cap.
    _fireAxeGun(dx, dy) {
        const a = this.axeGunGroup.create(this.player.x + dx * 30, this.player.y + dy * 30, 'axe', 0);
        a.setScale(1.6).setDepth(15997);
        a.body.setSize(24, 24, true);
        a.setVelocity(dx * 780, dy * 780);
        if (this.miniMap) this.miniMap.ignore(a);
        // Tumbles end-over-end like a thrown hatchet instead of staying aimed.
        this.tweens.add({ targets: a, angle: '+=900', duration: 500, repeat: -1 });
        // Ranged, not infinite: fizzles out after ~390px of flight.
        this.time.delayedCall(500, () => { if (a.active) this._popAxeGun(a, true); });
    }

    _axeGunHitsZombie(a, z) {
        if (!a.active || !z.active) return;
        this._popAxeGun(a);
        this._damageZombie(z, this.AXEGUN_DAMAGE);
    }

    _axeGunHitsCowboy(c, a) {
        if (!a.active || !c.active) return;
        this._popAxeGun(a);
        this._damageCowboy(this.AXEGUN_DAMAGE);
    }

    // The little axe splinters — quietly when it just runs out of range, with
    // a small wood-and-glow sparkle when it actually hit something.
    _popAxeGun(a, quiet = false) {
        if (!a.active) return;
        const ax = a.x, ay = a.y;
        a.destroy();
        if (quiet) return;
        this._pixelBurst(ax, ay, {
            colors: [0xc6ff33, 0xffffff, 0x8b5a2b],
            count: 6, minSpeed: 50, maxSpeed: 160, gravity: 260
        });
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(ax, ay, { colors: ['#c6ff33', '#ffffff', '#8b5a2b'], count: 6 });
        }
    }

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
    }

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
    }

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
    }

    // ===== Half-heart pickups =====

    // Rarely drop a lone half-heart somewhere in the main world (at most 2
    // out at once, coin-flip per 16s tick — so roughly one every ~30s).
    _maybeSpawnHeartPickup() {
        if (this.inOhs) return;
        if (this.heartPickups.countActive(true) >= 2) return;
        if (Math.random() < 0.5) return;
        let x = 0, y = 0, tries = 0, ok = false;
        while (tries++ < 40 && !ok) {
            x = Phaser.Math.Between(150, 1850);
            y = Phaser.Math.Between(150, 1850);
            if (this._navDirty) this._buildNavGrid();
            ok = !this._navBlockedAt(x, y)
                && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > 300;
        }
        if (!ok) return;
        const h = this.heartPickups.create(x, y, 'halfHeartPix');
        h.setScale(2).setDepth(4);
        h.body.setAllowGravity(false);
        h.setImmovable(true);
        h.body.moves = false; // let the bob tween own the position
        // Gentle bob + pulse so it catches the eye.
        this.tweens.add({ targets: h, y: y - 8, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: h, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });
    }

    _collectHeart(player, h) {
        if (!h.active) return;
        const hx = h.x, hy = h.y;
        h.destroy();
        this.heal(0.5);
        this.sounds.chop();
        this._pixelBurst(hx, hy, {
            colors: [0xff3b3b, 0xff8080, 0xffd0d0, 0xffffff],
            count: 14, minSpeed: 70, maxSpeed: 210, gravity: 260
        });
        this.showCutText(hx, hy - 30, '+ HALF HEART');
        if (this.doomView && this.doomView.active) {
            this.doomView.burstAtWorld(hx, hy, { colors: ['#ff3b3b', '#ff8080', '#ffd0d0'], count: 14 });
            this.doomView.textAtWorld(hx, hy, '+ HALF HEART');
        }
    }

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
    }

    _despawnCowboy() {
        if (this._cowboyColliders) {
            this._cowboyColliders.forEach(c => c && c.destroy && c.destroy());
            this._cowboyColliders = null;
        }
        if (this.cowboy) { this.cowboy.destroy(); this.cowboy = null; }
    }

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
    }

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
    }

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
    }

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
    }

    _popBullet(b) {
        if (!b.active) return;
        const bx = b.x, by = b.y;
        b.destroy();
        this._pixelBurst(bx, by, {
            colors: [0xff9500, 0xffb340, 0xffe500],
            count: 6, minSpeed: 50, maxSpeed: 160, gravity: 300
        });
    }

    _axeHitsCowboy(axe, c) {
        if (!this.canChop || !c.active) return;
        this.canChop = false;
        this.sounds.chop();
        this._damageCowboy(2);
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    }

    _slashHitsCowboy(c, s) {
        if (!s.active || !c.active) return;
        this._popSlash(s);
        this._damageCowboy(1);
    }

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
    }

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
    }

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
    }

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
    }

    _despawnCowgirl() {
        if (this._cowgirlColliders) {
            this._cowgirlColliders.forEach(c => c && c.destroy && c.destroy());
            this._cowgirlColliders = null;
        }
        if (this.cowgirl) { this.cowgirl.destroy(); this.cowgirl = null; }
    }

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
    }

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
    }

    _axeHitsCowgirl(axe, g) {
        if (!this.canChop || !g.active) return;
        this.canChop = false;
        this.sounds.chop();
        this._damageCowgirl(2);
        this.time.delayedCall(300, () => { this.canChop = true; }, [], this);
    }

    _slashHitsCowgirl(g, s) {
        if (!s.active || !g.active) return;
        this._popSlash(s);
        this._damageCowgirl(1);
    }

    _axeGunHitsCowgirl(g, a) {
        if (!a.active || !g.active) return;
        this._popAxeGun(a);
        this._damageCowgirl(this.AXEGUN_DAMAGE);
    }

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
    }

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
    }

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
    }

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
    }

    // ===== World spawning / regeneration =====

    // Scatter 100 trees, skipping anything too close to another tree, the
    // landmarks, or the player (so a regrowing forest can't trap anyone).
    _spawnTrees() {
        const worldWidth = 2000, worldHeight = 2000;
        for (let i = 0; i < 40; i++) {
            let x, y, overlap, tries = 0;
            do {
                x = Phaser.Math.Between(0, worldWidth);
                y = Phaser.Math.Between(0, worldHeight);
                overlap = false;
                this.trees.getChildren().forEach(tree => {
                    if (Phaser.Math.Distance.Between(x, y, tree.x, tree.y) < 80) overlap = true;
                });
                if (!overlap) {
                    if (Phaser.Math.Distance.Between(x, y, this.computer.x, this.computer.y) < 350) overlap = true;
                    else if (Phaser.Math.Distance.Between(x, y, this.contributeSign.x, this.contributeSign.y) < 160) overlap = true;
                    else if (Phaser.Math.Distance.Between(x, y, this.ohsSchool.x, this.ohsSchool.y) < 340) overlap = true;
                    else if (Phaser.Math.Distance.Between(x, y, this.brownSchool.x, this.brownSchool.y) < 380) overlap = true;
                    else if (this.player && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 140) overlap = true;
                }
            } while (overlap && tries++ < 60);
            if (overlap) continue;
            const tree = this.trees.create(x, y, 'tree').setScale(3).refreshBody();
            tree.chopProgress = 0;
        }
    }

    // Scatter a fresh batch of hidden bombs (used at start + regeneration).
    _spawnBombs() {
        const worldWidth = 2000, worldHeight = 2000;
        for (let i = 0; i < this.BOMB_COUNT; i++) {
            const bx = Phaser.Math.Between(150, worldWidth - 150);
            const by = Phaser.Math.Between(150, worldHeight - 150);
            if (Phaser.Math.Distance.Between(bx, by, worldWidth / 2, worldHeight / 2) < 350) { i--; continue; }
            if (this.player && Phaser.Math.Distance.Between(bx, by, this.player.x, this.player.y) < 250) { i--; continue; }
            const b = this.bombs.create(bx, by, 'hidden-bomb').setImmovable(true).setScale(3).refreshBody();
            if (this.anims.exists('bomb-idle')) b.anims.play('bomb-idle');
            // Inside a sub-world? Keep the fresh batch hidden until we're back.
            if (this.inOhs) { b.setVisible(false); b.body.enable = false; }
        }
        this._bombRegenQueued = false;
    }

    // Once every hidden bomb has been used up, bury a fresh batch.
    _checkBombRegen() {
        if (this._bombRegenQueued) return;
        const anyLive = this.bombs.getChildren().some(b => b.active);
        if (anyLive) return;
        this._bombRegenQueued = true;
        this.time.delayedCall(3000, () => {
            this.bombs.clear(true, true);
            this._spawnBombs();
            if (!this.inOhs) this.showToast('...more bombs were buried.', 2200);
        });
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
                    if (spr.newTab) window.open(spr.pageUrl, '_blank', 'noopener,noreferrer');
                    else this.openSubPage(spr.pageUrl);
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
        const projects = this.ohsProjects.map(p => ({
            key: p.key, label: p.label,
            url: `https://${p.key}.bruno-rodriguez-mendez.com`,
            path: `assets/subdomains/${p.key}.png`
        }));
        this._loadSubWorldAssets(projects, () => {
            this._enterSubWorld('ohs', {
                projects,
                bg: '#33343a', // dark cement
                toast: 'Welcome to OHS!\nChop a project to open it — hit the EXIT sign to leave.'
            });
        });
    }

    enterBrownWorld() {
        this._loadSubWorldAssets(this.brownProjects, () => {
            this._enterSubWorld('brown', {
                projects: this.brownProjects,
                bg: '#4e3629', // Brown University brown
                toast: 'Welcome to BROWN!\nChop a project to open it — hit the EXIT sign to leave.'
            });
        });
    }

    // Shared in-place world swap used by the OHS + Brown sub-worlds. (The
    // `inOhs` flag and the `ohs*` collections mean "current sub-world" now.)
    _enterSubWorld(id, { projects, bg, toast }) {
        if (this.inOhs) return;
        this.inOhs = true;
        this.subWorldId = id;
        this.ohsChops = 0;
        this.brownChops = 0;
        this.resetHeldInput();

        this._setMainWorldActive(false);
        this.cameras.main.setBackgroundColor(bg);
        if (this.doomView) this.doomView.setFloorColor && this.doomView.setFloorColor(bg);

        const worldW = 2000, worldH = 2000;
        this.player.setPosition(300, worldH / 2);
        this.player.setVelocity(0, 0);
        this._navDirty = true; // different obstacles in here — zombies re-path

        // Layout: up to 3 projects sit in one centered row; more (OHS's 6)
        // fall into the 2-column x 3-row grid.
        const spots = projects.length <= 3
            ? projects.map((p, i) => ({ x: 500 + i * 500, y: 1000 }))
            : projects.map((p, i) => ({ x: [760, 1240][i % 2], y: [560, 1000, 1440][Math.floor(i / 2)] }));
        projects.forEach((p, i) => {
            const { x: cx, y: cy } = spots[i];
            const spr = this.physics.add.staticImage(cx, cy, p.key).setScale(0.12).refreshBody();
            spr.pageUrl = p.url;
            spr.newTab = !!p.newTab;
            spr.chops = 0;
            this.ohsProjectSprites.push(spr);

            const label = this.add.text(cx, cy - 108, p.label, {
                fontFamily: 'monospace', fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(20);
            this.miniMap.ignore(label);
            this.ohsLabels.push(label);

            this.ohsColliders.push(this.physics.add.collider(this.player, spr));
            this.ohsColliders.push(this.physics.add.collider(this.zombieGroup, spr));
            this.ohsColliders.push(this.physics.add.overlap(this.axe, spr, this.hitProject, null, this));
        });

        // Exit sign, bottom-right.
        this.ohsExitSign = this.physics.add.staticImage(worldW - 260, worldH - 260, 'exit-sign').setScale(4).refreshBody();
        this.ohsColliders.push(this.physics.add.overlap(this.axe, this.ohsExitSign, this.hitExitSign, null, this));

        // The orb lives specifically in OHS (bottom-left corner), not Brown or
        // the main world — it's created once in create() at this exact spot
        // and just shown/hidden here rather than moved.
        const orbHere = id === 'ohs';
        this.orb.setVisible(orbHere);
        if (this.orb.body) this.orb.body.enable = orbHere;

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

        this.showToast(toast, 4000);
    }

    exitOhsWorld() {
        if (!this.inOhs) return;
        const cameFrom = this.subWorldId;
        this.inOhs = false;
        this.subWorldId = null;
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
        this.orb.setVisible(false);
        if (this.orb.body) this.orb.body.enable = false;

        this.cameras.main.setBackgroundColor(this._mainBgColor());
        if (this.doomView) this.doomView.setFloorColor && this.doomView.setFloorColor(null);
        this._setMainWorldActive(true);
        this.ohsChops = 0;
        this.brownChops = 0;
        this._navDirty = true; // back to the main world's obstacles

        // Drop the player just to the right of whichever school we entered.
        const school = cameFrom === 'brown' ? this.brownSchool : this.ohsSchool;
        this.player.setPosition(school.x + 240, school.y);
        this.player.setVelocity(0, 0);
    }

    // Show/hide + enable/disable every main-world entity when swapping worlds.
    _setMainWorldActive(on) {
        const set = (o) => { if (!o) return; o.setVisible(on); if (o.body) o.body.enable = on; };
        this.trees.getChildren().forEach(set);
        set(this.computer);
        if (this.computerPreview) this.computerPreview.setVisible(on);
        set(this.contributeSign);
        set(this.ohsSchool);
        set(this.brownSchool);
        if (this._bombOverlap) this._bombOverlap.active = on;
        this.bombs.getChildren().forEach(b => {
            // Only re-show bombs that were never triggered (triggered ones stay gone).
            b.setVisible(on && b.active);
            if (b.body) b.body.enable = on && b.active;
        });
        // Half-heart pickups only live in the main world.
        this.heartPickups.getChildren().forEach(h => {
            h.setVisible(on && h.active);
            if (h.body) h.body.enable = on && h.active;
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
                if (ghost.chops >= this._entityChopsNeeded()) {
                    this.sounds.smash();
                    this.openSubPage(`https://${ghost.subdomain}.bruno-rodriguez-mendez.com`, ghost);
                }
            }
        });

        this.time.delayedCall(500, () => {
            this.canChop = true;
        }, [], this);
    }

    // Chop the contribute sign 3x -> new tab to the CONTRIBUTING guide.
    // GitHub blocks framing, so this can't go through openSubPage's iframe.
    hitContributeSign(axe, sign) {
        if (!this.canChop) return;
        this.canChop = false;
        this.sounds.chop();
        this.emitHitParticles(axe.x, axe.y);
        this.doomView.burstAtWorld(axe.x, axe.y, { colors: this._rainbowFx, count: 16, wz: 40 });

        this.tweens.add({
            targets: sign,
            x: { value: sign.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: sign.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.contributeSignChops++;
                if (this.contributeSignChops >= 3) {
                    this.contributeSignChops = 0;
                    this.sounds.smash();
                    window.open('https://github.com/brubru6707/bruno-rodriguez-mendez/blob/main/CONTRIBUTING.md', '_blank', 'noopener,noreferrer');
                }
            }
        });

        this.time.delayedCall(500, () => { this.canChop = true; }, [], this);
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
                if (this.orbChops >= this._entityChopsNeeded()) {
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
        if (window.posthog && typeof window.posthog.capture === 'function') window.posthog.capture('subpage_open', { url });

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

        const el = document.createElement('iframe');
        el.id = 'subPageFrame';
        el.className = 'subpage-frame';
        el.src = url;
        // Always scrollable — the personal site is a tall page. (It used to be
        // locked via a 'DISABLE INTERACTION' message, which is why it wouldn't
        // scroll; we no longer send that.)
        el.setAttribute('scrolling', 'yes');
        document.body.appendChild(el);

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

        this.activeSubPage = { el, escButton, ghost };
    }

    closeSubPage() {
        if (!this.activeSubPage) return;
        const { el, escButton, ghost } = this.activeSubPage;
        this.activeSubPage = null;

        el.remove();
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
        // Zenith mode: the player is untouchable — don't even waste the bomb.
        if (this.time.now < this._invincibleUntil) return;
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
