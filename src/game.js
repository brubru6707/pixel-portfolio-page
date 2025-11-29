import { gameConfig } from './config/gameConfig.js';

// Launch game
const game = new Phaser.Game(gameConfig);

// Handle window resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
    game.scene.getScene('MainScene').update();
    if (game.scene.keys.MainScene) {
        const scene = game.scene.keys.MainScene;
        
        if (scene.miniMap) {
            const miniMapWidth = 150;
            scene.miniMap.setPosition(window.innerWidth - miniMapWidth - 20, 20);
        }
        
        if (scene.logText) {
            scene.logText.setPosition(window.innerWidth / 2, window.innerHeight - 30);
        }
    }
});
