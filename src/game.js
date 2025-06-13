let downESC
let downF
const keyPopout = new Set(); // used to show specific keys when the player is interacting 
let playerNearTree = false;

class IntroScene extends Phaser.Scene {
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

class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.axeRotations = 0;
        this.logs = 0; // Variable to store number of logs
        this.canChop = true; // Cooldown flag for axe
        this.lastDirection = 'none'; // Track player's last direction
        this.miniMap = null
        this.acceleration = 15;
        this.maxSpeed = 200;
        this.friction = 0.9;
        this.orbActivated = false;
        this.zombieMoved = false
        this.touchTarget = {x: 0, y: 0}
        this.activateAxe = false
        this.movementTimer = null;
        this.mobilePlayerMove = false;
    }

    preload() {
        this.load.spritesheet('me', 'assets/me-sprite.png', { frameWidth: 13, frameHeight: 15 });
        this.load.spritesheet('zombie', 'assets/zombie.png', { frameWidth: 13, frameHeight: 15 });
        this.load.image('tree', 'assets/tree.png');
        this.load.spritesheet('axe', 'assets/axe.png', { frameWidth: 12, frameHeight: 15 });
        this.load.spritesheet('computer', 'assets/computer.png', { frameWidth: 30, frameHeight: 26 });
        this.load.image('escKey', 'assets/esc-key.png');
        this.load.image('fKey', 'assets/f-key.png');
        this.load.image('plank', 'assets/plank.png');
        this.load.spritesheet('orb', 'assets/orb.png', { frameWidth: 26, frameHeight: 30 });
        this.load.spritesheet('ghost', 'assets/ghost.png', { frameWidth: 18, frameHeight: 30 });
        this.load.spritesheet('hidden-bomb', 'assets/hidden-bomb.png', { frameWidth: 27, frameHeight: 15 });
        this.load.spritesheet('explosive', 'assets/explosive.png', { frameWidth: 34, frameHeight: 40 });
    }

    create() {
        const worldWidth = 2000;
        const worldHeight = 2000;
        const keySize = 2;
        
        this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
        
        // Add objects in the center of the world
        this.escKeySprite = this.add.image(0, 0, 'escKey').setScrollFactor(0).setVisible(false).setDepth(1000).setScale(keySize) // on top of everything   
        this.fKeySprite = this.add.image(0, 0, 'fKey').setScrollFactor(0).setVisible(false).setDepth(1000).setScale(keySize) // on top of everything 
        this.computer = this.physics.add.staticSprite(worldWidth / 2, worldHeight / 2, 'computer', 0).setScale(15).refreshBody();
        this.orb = this.physics.add.staticSprite(worldWidth / 1.2, worldHeight / 3.5, 'orb', 0).setScale(4).refreshBody();
        this.player = this.physics.add.sprite(worldWidth / 2 - 290, worldHeight / 2, 'me', 0).setScale(3).refreshBody();
        this.player.setCollideWorldBounds(true);
        this.axe = this.physics.add.sprite(0, 0, 'axe', 0).setVisible(false).setScale(4).refreshBody();
        this.zombie = this.physics.add.sprite(100, 100, 'zombie').setScale(3).refreshBody();
        this.zombie.setCollideWorldBounds(true);
        let signX = Math.random() < 0.5 ? -1 : 1
        let signY = Math.random() < 0.5 ? -1 : 1
        this.bombTile = this.physics.add.sprite(worldWidth / 2 + (150*(5*Math.random())*signX), worldHeight / 2 + (150*(5*Math.random())*signY), 'hidden-bomb').setImmovable(true).setScale(3).refreshBody();

        // Update pointer mobile location
        this.touchTarget = {x: this.player.x, y:  this.player.y}
        this.input.on('pointerdown', this.handleTouchInput, this);

        // create animations
        this.createAnimations.call(this, 'me');
        this.createAnimations.call(this, 'zombie');
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
          
        // play animations 
        this.orb.anims.play('aura');
        this.computer.anims.play('blink');
        this.zombie.anims.play('idle');
        this.bombTile.anims.play("bomb-idle")

        // Call this periodically
        this.time.addEvent({
            delay: 10000, // every 10 seconds (adjust as needed)
            callback: () => this.spawnGhost(),
            callbackScope: this,
            loop: true
        });

        // Init object variables
        this.computerChops = 0;
        this.orbChops = 0;
        this.zombie.direction = null;

        // Spawn trees without overlap
        this.trees = this.physics.add.staticGroup();
        for (let i = 0; i < 100; i++) {
            let x, y;
            let overlap;
            do {
                x = Phaser.Math.Between(0, worldWidth);
                y = Phaser.Math.Between(0, worldHeight);
                overlap = false;
                this.trees.getChildren().forEach(tree => {
                    if (Phaser.Math.Distance.Between(x, y, tree.x, tree.y) < 80) {
                        overlap = true;
                    }
                });
            } while (overlap);
    
            const tree = this.trees.create(x, y, 'tree').setScale(3).refreshBody();
            tree.chopProgress = 0; 
        }

        // Make sure trees don't spawn on the computer
        this.trees.getChildren().forEach(tree => {
            if (Phaser.Math.Distance.Between(tree.x, tree.y, this.computer.x, this.computer.y) < 150) {
                tree.destroy();
            }
        });

        // Make sure trees don't spawn on the orb
        this.trees.getChildren().forEach(tree => {
            if (Phaser.Math.Distance.Between(tree.x, tree.y, this.orb.x, this.orb.y) < 150) {
                tree.destroy();
            }
        });

        // Add collision between player and some objects
        this.physics.add.collider(this.player, this.trees);
        this.physics.add.collider(this.player, this.computer);
        this.physics.add.collider(this.player, this.orb);
        this.physics.add.overlap(this.player, this.bombTile, this.triggerExplosion, null, this);


        // Keyboard input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.cameras.main.startFollow(this.player);
        downF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        downESC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        // Overlap detection instead of collider for axe
        this.physics.add.overlap(this.axe, this.trees, this.cutTree, null, this);
        this.physics.add.overlap(this.axe, this.computer, this.hitComputer, null, this);        
        this.physics.add.overlap(this.axe, this.orb, this.hitOrb, null, this);        

        // Mini map camera 
        const miniMapWidth = 150
        this.miniMap = this.cameras.add(
            window.innerWidth - miniMapWidth - 20,
            20,
            150,
            150
        ).setZoom(0.1).startFollow(this.player, true, 0.1, 0.1).setBackgroundColor(0x002244).setBounds(0, 0, worldWidth, worldHeight);

         this.logText = this.add.text(
            this.cameras.main.width / 2, 
            this.cameras.main.height - 30, 
            '', 
            {
                font: '16px monospace',
                fill: '#ffffff'
            }
        ).setOrigin(0.5)
         .setScrollFactor(0) // So it stays in place even when camera moves
         .setDepth(1000); // Always on top

        // 2. Now overlay the iframe
        this.time.delayedCall(500, () => {
            const canvasRect = this.game.canvas.getBoundingClientRect();
            const computerCenter = this.computer.getCenter();

            const domX = canvasRect.left + (computerCenter.x * (canvasRect.width / this.game.config.width));
            const domY = canvasRect.top + (computerCenter.y * (canvasRect.height / this.game.config.height));

            // Create the iframe once
            this.computerIframe = document.createElement('iframe');
            this.computerIframe.src = 'personalWebsite/index.html';
            this.computerIframe.style.position = 'absolute';
            this.computerIframe.style.width = '1600px';
            this.computerIframe.style.height = '900px';
            this.computerIframe.style.transform = 'scale(0.15)';
            this.computerIframe.style.border = 'none';
            this.computerIframe.style.zIndex = '999';
            this.computerIframe.style.pointerEvents = 'none';
            document.body.appendChild(this.computerIframe);
        }, [], this);
    }

    update() {
        let pointingAtKey = true
        this.input.on('pointerdown', (pointer) => {
            if (this.mobilePlayerMove == false) {
                this.mobilePlayerMove = true
                this.movementTimer = setTimeout(() => {
                    this.mobilePlayerMove = false
                    this.player.setVelocity(0, 0);
                    this.player.play('idle-me', true);
                    this.lastDirection = 'none';  
                }, 4000);
            }   
        }, this);
        keyPopout.clear();

        const computerDistanceX = Math.abs(this.player.x-this.computer.getCenter().x)
        const computerDistanceY = Math.abs(this.player.y-this.computer.getCenter().y)
        const orbDistanceX = Math.abs(this.player.x-this.orb.getCenter().x)
        const orbDistanceY = Math.abs(this.player.y-this.orb.getCenter().y)
        // Calculate distance between tree and the users
        playerNearTree = false
        this.trees.getChildren().forEach(tree => {
            if (Phaser.Math.Distance.Between(tree.x, tree.y, this.player.x, this.player.y) < 150) { 
                playerNearTree = true;
            }
        });

        let holdFRules = (computerDistanceX < 250 && computerDistanceY < 240) || (orbDistanceX < 150 && orbDistanceY < 150 ) || playerNearTree

        if (holdFRules) { 
            if (this.orbActivated) {
                keyPopout.add("holdESC")
            } else
                keyPopout.add("holdF")
        } 

        const player = this.player;
        const cursors = this.cursors;
        let velX = this.player.body.velocity.x;
        let velY = this.player.body.velocity.y;

        if (this.lastDirection == "none") { 
            this.trees.getChildren().forEach(tree => {
                if (Phaser.Math.Distance.Between(tree.x, tree.y, this.computer.x, this.computer.y) < 350) {
                    tree.destroy();
                }
            });

            this.trees.getChildren().forEach(tree => {
                if (Phaser.Math.Distance.Between(tree.x, tree.y, this.orb.x, this.orb.y) < 150) {
                    tree.destroy();
                }
            });
        }

        // Check if the player is pointing at a key
        if (this.isLikelyMobileDevice()) {
            const centerX = this.cameras.main.width / 2;
            const bottomY = this.cameras.main.height - 40;
            this.input.on('pointerdown', this.handleTouchInput, this);
            const { x: keyX, y: keyY } = this.cameras.main.getWorldPoint(centerX, bottomY);
            const dx = Math.round(this.touchTarget.x - keyX);
            const dy = Math.round(this.touchTarget.y - keyY);
            const distance = Math.hypot(dx, dy); 

            if (distance < 55 && keyPopout.size != 0) {
                pointingAtKey = true
                this.activateAxe = true;
                setTimeout(() => {
                    this.activateAxe = false;
                }, 2000); 
            } else {
                pointingAtKey = false 
                this.activateAxe = false
            }          
        }

        // Player Movement
        if (this.isLikelyMobileDevice() && !pointingAtKey && this.mobilePlayerMove)  {
            const dx = Math.round(this.touchTarget.x - this.player.x);
            const dy = Math.round(this.touchTarget.y - this.player.y);
            const distance = Math.hypot(dx, dy);
            const speed = this.maxSpeed;

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
            }
        } else {
                
            // Keyboard Input
            if (this.cursors.left.isDown) {
                velX -= this.acceleration;
            } else if (this.cursors.right.isDown) {
                velX += this.acceleration;
            }
            if (this.cursors.up.isDown) {
                velY -= this.acceleration;
            } else if (this.cursors.down.isDown) {
                velY += this.acceleration;
            }

            // Apply friction if no key is pressed
            if (!this.cursors.left.isDown && !this.cursors.right.isDown) {
                velX *= this.friction;
            }
            if (!this.cursors.up.isDown && !this.cursors.down.isDown) {
                velY *= this.friction;
            }

            // Cap velocity
            velX = Phaser.Math.Clamp(velX, -this.maxSpeed, this.maxSpeed);
            velY = Phaser.Math.Clamp(velY, -this.maxSpeed, this.maxSpeed);

            // Apply new velocity
            this.player.setVelocity(velX, velY);

            if (cursors.left.isDown) {
                player.play('left-me', true);
                this.lastDirection = 'left';
            } else if (cursors.right.isDown) {
                player.play('right-me', true);
                this.lastDirection = 'right';
            } else if (cursors.up.isDown) {
                player.play('up-me', true);
                this.lastDirection = 'up';
            } else if (cursors.down.isDown) {
                player.play('down-me', true);
                this.lastDirection = 'down';
            } else
                player.play('idle-me', true);
        }

        // Axe positioning
        if ((downF.isDown || this.activateAxe) && this.mobilePlayerMove) {
            this.axeRotations += this.axeRotations < 0.5 ? this.axeRotations * 1.01 + 0.01 : 0.5;
            let variableOffsetChange = 10          
            if (this.lastDirection == "left") {
                this.axe.setFlipX(true)
                this.axe.setOrigin(1,1)
                this.axe.setPosition(player.x + Math.cos(this.axeRotations)*variableOffsetChange, player.y - Math.sin(this.axeRotations)*variableOffsetChange);
                this.axe.rotation = -(this.axeRotations);
            } else {
                this.axe.setFlipX(false)
                this.axe.setOrigin(0.5,1)
                this.axe.setPosition(player.x + Math.cos(this.axeRotations)*variableOffsetChange, player.y + Math.sin(this.axeRotations)*variableOffsetChange);
                this.axe.rotation = (this.axeRotations);
            }
            this.axe.setVisible(true);
        } else {
            this.axeRotations = 0
            this.axe.setVisible(false);
            this.axe.setPosition(0,0)
        }
        
        // Update iframe position relative to the computer sprite
        if (this.computer && this.computerIframe) {
            const canvasRect = this.game.canvas.getBoundingClientRect();
            const camera = this.cameras.main;
            const computerWorldPos = this.computer.getCenter();
    
            // Convert world to screen space
            const screenX = computerWorldPos.x - camera.scrollX;
            const screenY = computerWorldPos.y - camera.scrollY;
    
            const scaleX = canvasRect.width / this.game.config.width;
            const scaleY = canvasRect.height / this.game.config.height;
    
            const iframeLeft = canvasRect.left + screenX * scaleX;
            const iframeTop = canvasRect.top + screenY * scaleY;
    
            // Calculate scaled offsets (relative to canvas scaling)
            const scaledOffsetX = 800 * scaleX;
            const scaledOffsetY = 550 * scaleY;
    
            this.computerIframe.style.left = `${iframeLeft - scaledOffsetX}px`;
            this.computerIframe.style.top = `${iframeTop - scaledOffsetY}px`;
        }

        // Periodically update direction
        if (this.zombieMoved == false) {
            this.zombieMoved = true
            const directions = ['left', 'right', 'up', 'down'];
            this.zombie.direction = Phaser.Math.RND.pick(directions);
            this.time.delayedCall(2000, () => { 
                this.zombieMoved = false
            }, [], this); 
        }

        const speed = 50;
        switch (this.zombie.direction) {
            case 'left':
                this.zombie.setVelocity(-speed, 0);
                this.zombie.anims.play('left-zombie', true);
                break;
            case 'right':
                this.zombie.setVelocity(speed, 0);
                this.zombie.anims.play('right-zombie', true);
                break;
            case 'up':
                this.zombie.setVelocity(0, -speed);
                this.zombie.anims.play('up-zombie', true);
                break;
            case 'down':
                this.zombie.setVelocity(0, speed);
                this.zombie.anims.play('down-zombie', true);
                break;
            default:
                this.zombie.setVelocity(0, 0);
                this.zombie.anims.play('idle-zombie', true);
                break;
        }

        this.setLog(keyPopout) 

    }

    cutTree(axe, tree) {
        if (!this.canChop) return;
        
        this.canChop = false;
    
        // === Shake the tree ===
        this.tweens.add({
            targets: tree,
            x: { value: tree.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: tree.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                tree.destroy();
                this.logs += 1;
            }
        });
        
    
        this.time.delayedCall(500, () => { 
            this.canChop = true; 
        }, [], this);
    
    
    }

    setLog(messagesSet) {
        const centerX = this.cameras.main.width / 2;
        const bottomY = this.cameras.main.height - 40;

        // Hide everything first and add init configs
        this.fKeySprite.setVisible(false);
        this.escKeySprite.setVisible(false);
        this.fKeySprite.setScrollFactor(0);
        this.escKeySprite.setScrollFactor(0);
        this.fKeySprite.setPosition(3000, 3000);
        this.escKeySprite.setPosition(3000, 3000);
        this.fKeySprite.setVisible(true);
        this.escKeySprite.setVisible(true);

        // Convert set to array
        const keys = Array.from(messagesSet);

        if (keys.length === 0) {
            return; // nothing to show
        } else if (keys.length == 1) {
            if(keys[0] == "holdF")
                this.fKeySprite.setPosition(centerX, bottomY);
            else 
                this.escKeySprite.setPosition(centerX, bottomY);
        } else if (keys.length == 2) {
            this.fKeySprite.setPosition(centerX + 20, bottomY);
            this.escKeySprite.setPosition(centerX - 20, bottomY);
        }

    }
    
    hitComputer(axe, computer) {
        if (!this.canChop) return;
        this.canChop = false;
    
        // Shake the computer randomly
        this.tweens.add({
            targets: computer,
            x: { value: computer.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: computer.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.computerChops++;    
                if (this.computerChops >= 3) {
                    this.enterWebsiteMode();
                }
            }
        });
    
        this.time.delayedCall(500, () => { 
            this.canChop = true; 
        }, [], this);
    }
    
    enterWebsiteMode() {
        keyPopout.add("HoldF")
        keyPopout.add("HoldESC")
        this.scene.pause();
        this.game.canvas.style.display = 'none';
        document.body.style.overflow = 'hidden';
    
        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'fakeWebsite';
        iframe.src = 'personalWebsite/index.html';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.zIndex = '1000';
    
        document.body.appendChild(iframe);

        setTimeout(() => {
            iframe.contentWindow.postMessage('INFORM USER', '*');
        }, 500);

        const escHandler = (event) => {
            if (event.code === "Escape") {
                iframe.remove();
                this.game.canvas.style.display = 'block';
                document.body.style.overflow = 'hidden';
                this.scene.resume();
                document.removeEventListener('keydown', escHandler);
            }
        };

        window.addEventListener('message', (e) => {
            if (e.data === 'ESCAPE_PRESSED') {
                iframe.remove();
                this.game.canvas.style.display = 'block';
                document.body.style.overflow = 'hidden';
                this.scene.resume();
                document.removeEventListener('keydown', escHandler);
            }
        });
    
        document.addEventListener('keydown', escHandler);
    }
    
    spawnGhost() {
        const x = Phaser.Math.Between(0, this.cameras.main.width);
        const y = Phaser.Math.Between(0, this.cameras.main.height);
      
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
        bomb.disableBody(true, true); // hide & disable bomb
      
        const explosion = this.add.sprite(bomb.x, bomb.y, 'explosive').setScale(3);
        explosion.play('explode');
      
        // Optional knockback: apply velocity based on position
        const knockbackForce = 1000;
        const dx = player.x - bomb.x;
        const dy = player.y - bomb.y;
        const angle = Math.atan2(dy, dx);
        const vx = Math.cos(angle) * knockbackForce;
        const vy = Math.sin(angle) * knockbackForce;
      
        player.body.velocity.x = vx;
        player.body.velocity.y = vy;
      
        // Remove explosion sprite after animation completes
        explosion.on('animationcomplete', () => {
          explosion.destroy();
        });
    }
      
    hitOrb(axe, orb) {
        if (!this.canChop) return;
        this.canChop = false;
    
        this.tweens.add({
            targets: orb,
            x: { value: orb.x + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            y: { value: orb.y + Phaser.Math.Between(-5, 5), duration: 50, yoyo: true, repeat: 3 },
            onComplete: () => {
                this.orbChops++;    
                if (this.orbChops >= 3) {
                    this.orbActivated = true
                    keyPopout.add("HoldESC")
                    let title = "I'm Salutrian ^_^"
                    let description = "My silly speech"
                    let videoUrl = "https://www.youtube.com/embed/8MPoMOXszWM"
                    this.enterModal(title, description, videoUrl)
                }
            }
        });
    
        this.time.delayedCall(500, () => { 
            this.canChop = true; 
        }, [], this); 
    }

    enterModal(title, description, videoUrl) {
        // Set modal content
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-description').textContent = description;
        document.getElementById('modal-video').src = videoUrl;
        document.getElementById('project-modal').style.display = 'flex';

        // Show escKeySprite in a fixed position
        this.escKeySprite.setVisible(true);
        this.escKeySprite.setScrollFactor(0);
        this.escKeySprite.setPosition(this.cameras.main.width / 2 + 80, this.cameras.main.height - 40);

        this.scene.pause(); // Pause game logic

        // Keyboard close handler
        const keyHandler = (e) => {
            if(e.code == "Escape") {
                this.hideProjectModal();
            }
        };

        // Mobile click-to-close handler
        const clickHandler = (e) => {
            // Check if click is outside modal content (on backdrop)
            if (!e.target.closest('.modal-content')) {
                this.hideProjectModal();
            }
        };

        // Store handlers for later removal
        this.currentModalHandlers = {
            keyHandler,
            clickHandler
        };

        // Add event listeners
        window.addEventListener('keydown', keyHandler);
        document.getElementById('project-modal').addEventListener('click', clickHandler);
    }

    hideProjectModal() {
        // Clear video source and hide modal
        document.getElementById('modal-video').src = '';
        document.getElementById('project-modal').style.display = 'none';
        this.escKeySprite.setVisible(false);
        
        // Remove event listeners
        if (this.currentModalHandlers) {
            window.removeEventListener('keydown', this.currentModalHandlers.keyHandler);
            document.getElementById('project-modal').removeEventListener('click', this.currentModalHandlers.clickHandler);
            this.currentModalHandlers = null;
        }

        this.orbActivated = false;
        this.scene.resume(); // Resume game logic
    }
    
    createAnimations(textureKey) {
        this.anims.create({
          key: `idle-${textureKey}`,
          frames: [{ key: textureKey, frame: 0 }],
          frameRate: 1,
          repeat: -1
        });
        this.anims.create({
          key: `right-${textureKey}`,
          frames: this.anims.generateFrameNumbers(textureKey, { start: 1, end: 4 }),
          frameRate: 10,
          repeat: -1
        });
        this.anims.create({
          key: `left-${textureKey}`,
          frames: this.anims.generateFrameNumbers(textureKey, { start: 5, end: 8 }),
          frameRate: 10,
          repeat: -1
        });
        this.anims.create({
          key: `up-${textureKey}`,
          frames: this.anims.generateFrameNumbers(textureKey, { start: 9, end: 13 }),
          frameRate: 10,
          repeat: -1
        });
        this.anims.create({
          key: `down-${textureKey}`,
          frames: this.anims.generateFrameNumbers(textureKey, { start: 14, end: 17 }),
          frameRate: 10,
          repeat: -1
        });
    }

    isLikelyMobileDevice() {
        return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    handleTouchInput(pointer) {
        // Save the destination coordinates
        this.touchTarget = {
            x: pointer.worldX,
            y: pointer.worldY
        };
    }
      
}

// Game config
const config = {
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

// Launch game
const game = new Phaser.Game(config);

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
