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
            frameRate: 10, // adjust as needed
            repeat: 0
        });

        const anim = this.add.sprite(this.cameras.main.centerX, this.cameras.main.centerY, 'introAnim')
            .setOrigin(0.5)
            .setScale(scale, scale) // scale to fill screen
            .play('playIntro');

        anim.on('animationcomplete', () => {
            this.scene.start('MainScene');
        });
    }
}
