export default class IntroScene extends Phaser.Scene {
    constructor() {
        super('IntroScene');
    }

    preload() {
        this.load.spritesheet('introAnim', 'assets/animation.png', {
            frameWidth: 160,
            frameHeight: 90
        });
    }

    create() {
        let scale = 0

        if (window.innerWidth > window.innerHeight) {
            scale = window.innerHeight / (90 * 1.2)
        } else {
            scale = window.innerWidth / (160 * 1.2)
        }

        this.anims.create({
            key: 'playIntro',
            frames: this.anims.generateFrameNumbers('introAnim', { start: 0, end: 13 }),
            frameRate: 16, // a little faster than before (was 10)
            repeat: 0
        });

        const anim = this.add.sprite(this.cameras.main.centerX, this.cameras.main.centerY, 'introAnim')
            .setOrigin(0.5)
            .setScale(scale, scale) // scale to fill screen
            .play('playIntro');

        anim.on('animationcomplete', () => {
            this._afterIntro();
        });
    }

    // Chompixel is a game first, so the field is the front door for EVERYONE —
    // no "who are you?" gate. Recruiters reach the portfolio by chopping the
    // in-world computer, or by opening personalWebsite/index.html directly (the
    // résumé link), which has its own "Pixel version" button back into the game.
    _afterIntro() {
        this.scene.start('MainScene');
    }
}
