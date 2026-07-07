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

    // The intro always plays first. Only once it finishes do we route: a
    // returning visitor goes straight to their saved choice; a first-timer
    // gets the "Who are you?" gate (which then starts the game or redirects).
    _afterIntro() {
        let saved = null;
        try { saved = localStorage.getItem('visitorType'); } catch (e) {}

        if (saved === 'recruiter') {
            window.location.replace('personalWebsite/index.html');
            return;
        }
        if (saved === 'everyone') {
            this.scene.start('MainScene');
            return;
        }
        // First visit: reveal the gate. It starts the game on "Everyone Else".
        if (typeof window.showVisitorGate === 'function') {
            window.showVisitorGate(() => this.scene.start('MainScene'));
        } else {
            this.scene.start('MainScene');
        }
    }
}
