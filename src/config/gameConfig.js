import IntroScene from '../scenes/IntroScene.js';
import MainScene from '../scenes/MainScene.js';

export const gameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: [IntroScene, MainScene],
    pixelArt: true
};
