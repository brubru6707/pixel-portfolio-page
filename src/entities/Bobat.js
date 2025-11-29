export default class Bobat {
    constructor(scene, x, y, subdomain) {
        this.scene = scene;
        this.subdomain = subdomain;
        
        // Create the sprite
        this.sprite = scene.physics.add.sprite(x, y, 'bobat').setScale(3);
        this.sprite.setCollideWorldBounds(true);
        
        // Increase the physics body size for better collision detection
        this.sprite.body.setSize(120, 120);
        this.sprite.body.setOffset(-10, -10);
        
        // Create text label above the bobat
        this.label = scene.add.text(x, y - 120, subdomain, {
            fontFamily: 'monospace',
            fontSize: '24px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        
        // Create iframe for the subdomain website
        this.iframe = document.createElement('iframe');
        this.iframe.src = `https://${subdomain}.bruno-rodriguez-mendez.com`;
        this.iframe.style.position = 'absolute';
        this.iframe.style.width = '800px';
        this.iframe.style.height = '450px';
        this.iframe.style.transform = 'scale(0.25)';
        this.iframe.style.transformOrigin = 'top left';
        this.iframe.style.border = '2px solid white';
        this.iframe.style.zIndex = '600';
        this.iframe.style.pointerEvents = 'none';
        this.iframe.style.backgroundColor = '#000000';
        document.body.appendChild(this.iframe);
        
        // Movement properties
        this.direction = null;
        this.speed = 40;
        this.isIdle = false;
        this.movementTimer = 0;
        this.idleTimer = 0;
        
        // Start with a random direction
        this.changeDirection();
    }

    changeDirection() {
        // 30% chance to go idle
        if (Math.random() < 0.3) {
            this.isIdle = true;
            this.idleTimer = Phaser.Math.Between(1000, 3000); // Idle for 1-3 seconds
            this.sprite.setVelocity(0, 0);
            this.sprite.anims.play('idle-bobat', true);
        } else {
            this.isIdle = false;
            const directions = ['left', 'right', 'up', 'down'];
            this.direction = Phaser.Math.RND.pick(directions);
            this.movementTimer = Phaser.Math.Between(2000, 4000); // Move for 2-4 seconds
        }
    }

    update(delta) {
        // Update label position to follow sprite
        this.label.setPosition(this.sprite.x, this.sprite.y - 120);
        
        // Update iframe position to follow sprite
        if (this.iframe && this.scene.game.canvas) {
            const canvasRect = this.scene.game.canvas.getBoundingClientRect();
            const camera = this.scene.cameras.main;
            
            // Convert world position to screen position
            const screenX = this.sprite.x - camera.scrollX;
            const screenY = this.sprite.y - camera.scrollY;
            
            const scaleX = canvasRect.width / this.scene.game.config.width;
            const scaleY = canvasRect.height / this.scene.game.config.height;
            
            const iframeLeft = canvasRect.left + screenX * scaleX;
            const iframeTop = canvasRect.top + screenY * scaleY;
            
            // Position iframe below the bobat (accounting for 0.25 scale = 200px width, 112.5px height)
            const scaledWidth = 800 * 0.25; // 200px
            const scaledHeight = 450 * 0.25; // 112.5px
            
            this.iframe.style.left = `${iframeLeft - scaledWidth / 2}px`;
            this.iframe.style.top = `${iframeTop - 100}px`;
        }
        
        if (this.isIdle) {
            this.idleTimer -= delta;
            if (this.idleTimer <= 0) {
                this.changeDirection();
            }
        } else {
            this.movementTimer -= delta;
            if (this.movementTimer <= 0) {
                this.changeDirection();
            } else {
                // Move in current direction
                switch (this.direction) {
                    case 'left':
                        this.sprite.setVelocity(-this.speed, 0);
                        this.sprite.anims.play('left-bobat', true);
                        break;
                    case 'right':
                        this.sprite.setVelocity(this.speed, 0);
                        this.sprite.anims.play('right-bobat', true);
                        break;
                    case 'up':
                        this.sprite.setVelocity(0, -this.speed);
                        this.sprite.anims.play('up-bobat', true);
                        break;
                    case 'down':
                        this.sprite.setVelocity(0, this.speed);
                        this.sprite.anims.play('down-bobat', true);
                        break;
                }
            }
        }
    }

    destroy() {
        this.label.destroy();
        if (this.iframe) {
            this.iframe.remove();
        }
        this.sprite.destroy();
    }
}
