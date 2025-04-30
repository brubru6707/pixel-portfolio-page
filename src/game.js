let downF
let downL

class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.axeRotations = 0;
        this.logs = 0; // Variable to store number of logs
        this.canChop = true; // Cooldown flag for axe
        this.lastDirection = 'none'; // Track player's last direction
        this.miniMap = null
    }

    preload() {
        this.load.spritesheet('me', 'assets/me-sprite.png', { frameWidth: 13, frameHeight: 15 });
        this.load.image('tree', 'assets/tree.png');
        this.load.spritesheet('axe', 'assets/axe.png', { frameWidth: 12, frameHeight: 15 });
        this.load.spritesheet('computer', 'assets/computer.png', { frameWidth: 30, frameHeight: 26 });
        this.load.image('escKey', 'assets/esc-key.png');
    }

    create() {
        const worldWidth = 2000;
        const worldHeight = 2000;
        
        this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
        
        this.escKeySprite = this.add.image(0, 0, 'escKey')
        .setScrollFactor(0)
        .setVisible(false)
        .setDepth(1000)
        .setScale(3) // on top of everything   

        // Add the computer in the center of the world
        this.computer = this.physics.add.staticSprite(worldWidth / 2, worldHeight / 2, 'computer', 0).setScale(15).refreshBody();

        // Computer blinking animation
        this.anims.create({
            key: 'blink',
            frames: this.anims.generateFrameNumbers('computer', { start: 0, end: 1 }),
            frameRate: 2,
            repeat: -1
        });
        this.computer.anims.play('blink');

        // Track computer chopping
        this.computerChops = 0;

        // Create player
        this.player = this.physics.add.sprite(worldWidth / 2 - 250, worldHeight / 2, 'me', 0);
        this.player.setScale(3);
        this.player.setCollideWorldBounds(true);

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
                        console.log("true")
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

        // Add collision between player and trees
        this.physics.add.collider(this.player, this.trees);

        // Add collision between player and the computer
        this.physics.add.collider(this.player, this.computer);


        // Axe setup 
        this.axe = this.physics.add.sprite(0, 0, 'axe', 0).setVisible(false).setScale(4).refreshBody();

        // Create animations
        this.anims.create({
            key: 'idle',
            frames: [{ key: 'me', frame: 0 }],
            frameRate: 1,
            repeat: -1
        });

        this.anims.create({
            key: 'right',
            frames: this.anims.generateFrameNumbers('me', { start: 1, end: 4 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'left',
            frames: this.anims.generateFrameNumbers('me', { start: 5, end: 8 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'up',
            frames: this.anims.generateFrameNumbers('me', { start: 9, end: 13 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'down',
            frames: this.anims.generateFrameNumbers('me', { start: 14, end: 17 }),
            frameRate: 10,
            repeat: -1
        });

        // Keyboard input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.cameras.main.startFollow(this.player);
        downF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        downL = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
        
        // Overlap detection instead of collider for axe
        this.physics.add.overlap(this.axe, this.trees, this.cutTree, null, this);
        this.physics.add.overlap(this.axe, this.computer, this.hitComputer, null, this);

        this.physics.add.overlap(this.player, this.computer, () => {
            this.showEscPrompt();
        }, null, this);        

        // Mini map camera
        const miniMapWidth = 150
        this.miniMap = this.cameras.add(
            window.innerWidth - miniMapWidth - 20,
            20,
            150,
            150
        ).setZoom(0.1)
         .startFollow(this.player, true, 0.1, 0.1)
         .setBackgroundColor(0x002244)
         .setBounds(0, 0, worldWidth, worldHeight);

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
        const speed = 100;
        const player = this.player;
        const cursors = this.cursors;

        if (this.lastDirection == "none") { 
            this.trees.getChildren().forEach(tree => {
                if (Phaser.Math.Distance.Between(tree.x, tree.y, this.computer.x, this.computer.y) < 350) {
                    tree.destroy();
                }
            });
        }

        player.setVelocity(0);

        if (cursors.left.isDown) {
            player.setVelocityX(-speed);
            player.anims.play('left', true);
            this.lastDirection = 'left';
        } else if (cursors.right.isDown) {
            player.setVelocityX(speed);
            player.anims.play('right', true);
            this.lastDirection = 'right';
        } else if (cursors.up.isDown) {
            player.setVelocityY(-speed);
            player.anims.play('up', true);
            this.lastDirection = 'up';
        } else if (cursors.down.isDown) {
            player.setVelocityY(speed);
            player.anims.play('down', true);
            this.lastDirection = 'down';
        } else {
            player.anims.play('idle', true);
        }

        // Axe positioning
        if (downF.isDown) {
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

        const distToComputer = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            this.computer.x, this.computer.y
        );
        
        if (distToComputer < 250) { // tweak as needed
            this.showEscPrompt();
        } else {
            this.escKeySprite.setVisible(false);
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
                this.setLog('Tree chopped! Logs: ' + this.logs);
            }
        });
        
    
        this.time.delayedCall(500, () => { 
            this.canChop = true; 
        }, [], this);
    
    
    }

    showEscPrompt() {
        console.log("sow esc")
        if (!this.escKeySprite.visible) {
            this.escKeySprite.setVisible(true);
            this.escKeySprite.setPosition(this.cameras.main.width / 2 + 30, this.cameras.main.height - 40);
    
            this.setLog('Hold');
            this.time.delayedCall(500, () => {
                this.setLog('Hold    to interact'); // spacing leaves room for sprite
            });
    
            // Re-show text + sprite if camera moves (optional)
            this.escKeySprite.setScrollFactor(0);
        }
    }
    

    setLog(message) {
        if (this.logText) {
            this.logText.setText(message);
    
            // Optional: after 2 seconds, clear the log automatically
            this.time.delayedCall(2000, () => {
                this.logText.setText('');
            }, [], this);
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
                this.setLog('Computer hit! Hits: ' + this.computerChops);
    
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
        this.scene.pause();
        this.game.canvas.style.display = 'none';
        document.body.style.overflow = 'scroll';
    
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
    
        // ESC key handling

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
    
}

// Game config
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: MainScene,
    pixelArt: true
};

// Launch game
const game = new Phaser.Game(config);

// Handle window resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);

    this.scene.get('MainScene').update(); // Or call your custom positioning logic here

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
