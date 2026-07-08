import { gameConfig } from './config/gameConfig.js';

// Launch game. Window resizing is handled by Phaser.Scale.RESIZE (see
// gameConfig) plus each scene's own 'resize' listener — no manual work here.
const game = new Phaser.Game(gameConfig);

// Handy for debugging from the browser console (window.__game.scene...).
window.__game = game;
