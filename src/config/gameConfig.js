import IntroScene from '../scenes/IntroScene.js';
import MainScene from '../scenes/MainScene.js';

export const gameConfig = {
    type: Phaser.AUTO,
    scale: {
        // RESIZE keeps the internal canvas size in sync with the window, so
        // world<->page coordinate math stays correct after window resizes
        mode: Phaser.Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight
    },
    render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: [IntroScene, MainScene],
    pixelArt: true
};
