// A wandering ghost that carries one subdomain: shows a small live preview
// (iframe on fast devices, static PNG on slow ones) and opens the full
// sub-page when chopped 3 times.
export default class GhostEntity {
    constructor(scene, x, y, subdomain) {
        this.scene = scene;
        this.subdomain = subdomain;
        this.chops = 0;

        this.sprite = scene.physics.add.sprite(x, y, 'ghost').setScale(3);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.anims.play('ghost_float');

        this.label = scene.add.text(x, y - 70, subdomain, {
            fontFamily: 'monospace',
            fontSize: '24px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.iframe = null;
        this.staticImage = null;

        const isSlowDevice = scene.performanceData.isSlow || scene.performanceData.isVerySlow;
        if (isSlowDevice) {
            this.createStaticImage();
        } else {
            this.createIframe();
        }

        // Movement properties
        this.direction = null;
        this.speed = 40;
        this.isIdle = false;
        this.movementTimer = 0;
        this.idleTimer = 0;
        this.changeDirection();
    }

    createIframe() {
        this.iframe = document.createElement('iframe');
        this.iframe.src = `https://${this.subdomain}.bruno-rodriguez-mendez.com`;
        this.iframe.className = 'world-preview';
        this.iframe.style.width = '800px';
        this.iframe.style.height = '450px';
        this.iframe.style.transform = 'scale(0.25)';
        this.iframe.style.transformOrigin = 'top left';
        document.body.appendChild(this.iframe);
    }

    createStaticImage() {
        this.staticImage = document.createElement('img');
        this.staticImage.src = `assets/subdomains/${this.subdomain}.png`;
        this.staticImage.className = 'world-preview';
        this.staticImage.style.width = '200px';
        this.staticImage.style.height = '112.5px';
        this.staticImage.style.objectFit = 'cover';

        // Fall back to a live iframe if the snapshot is missing
        this.staticImage.onerror = () => {
            console.warn(`Static image for ${this.subdomain} not found, falling back to iframe`);
            this.staticImage.remove();
            this.staticImage = null;
            this.createIframe();
        };
        document.body.appendChild(this.staticImage);
    }

    changeDirection() {
        // 30% chance to go idle
        if (Math.random() < 0.3) {
            this.isIdle = true;
            this.idleTimer = Phaser.Math.Between(1000, 3000);
            this.sprite.setVelocity(0, 0);
        } else {
            this.isIdle = false;
            const directions = ['left', 'right', 'up', 'down'];
            this.direction = Phaser.Math.RND.pick(directions);
            this.movementTimer = Phaser.Math.Between(2000, 4000);
        }
    }

    update(delta) {
        this.label.setPosition(this.sprite.x, this.sprite.y - 70);
        this.updatePreviewPosition();

        if (this.isIdle) {
            this.idleTimer -= delta;
            if (this.idleTimer <= 0) this.changeDirection();
        } else {
            this.movementTimer -= delta;
            if (this.movementTimer <= 0) {
                this.changeDirection();
            } else {
                switch (this.direction) {
                    case 'left':
                        this.sprite.setVelocity(-this.speed, 0);
                        this.sprite.setFlipX(true);
                        break;
                    case 'right':
                        this.sprite.setVelocity(this.speed, 0);
                        this.sprite.setFlipX(false);
                        break;
                    case 'up':
                        this.sprite.setVelocity(0, -this.speed);
                        break;
                    case 'down':
                        this.sprite.setVelocity(0, this.speed);
                        break;
                }
            }
        }
    }

    // Convert the ghost's world position to page coordinates and pin the
    // preview element above it. Uses live camera/canvas sizes so it stays
    // aligned after window resizes.
    updatePreviewPosition() {
        const element = this.iframe || this.staticImage;
        if (!element || !this.scene.game.canvas) return;

        const canvasRect = this.scene.game.canvas.getBoundingClientRect();
        const cam = this.scene.cameras.main;

        const screenX = (this.sprite.x - cam.worldView.x) * cam.zoom;
        const screenY = (this.sprite.y - cam.worldView.y) * cam.zoom;

        const scaleX = canvasRect.width / cam.width;
        const scaleY = canvasRect.height / cam.height;

        const pageX = canvasRect.left + screenX * scaleX;
        const pageY = canvasRect.top + screenY * scaleY;

        // Preview renders at 200x112.5 CSS px; center it above the ghost
        element.style.left = `${pageX - 100}px`;
        element.style.top = `${pageY - 210}px`;
    }

    destroy() {
        this.label.destroy();
        if (this.iframe) this.iframe.remove();
        if (this.staticImage) this.staticImage.remove();
        this.sprite.destroy();
    }
}
