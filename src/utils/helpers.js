export const subdomains = [
  "darkhorse",
  "ai-arsenal",
  "anarchy-clipboard",
  "checkers-game",
  "cyber-insurance-model",
  "nts-study-buddy",
  "ohs-chess-club",
  "ohs-key-club",
  "rag-for-hod-book",
];

export const keyPopout = new Set(); // used to show specific keys when the player is interacting

export function isLikelyMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function createAnimations(scene, textureKey) {
    scene.anims.create({
      key: `idle-${textureKey}`,
      frames: [{ key: textureKey, frame: 0 }],
      frameRate: 1,
      repeat: -1
    });
    scene.anims.create({
      key: `right-${textureKey}`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 1, end: 4 }),
      frameRate: 10,
      repeat: -1
    });
    scene.anims.create({
      key: `left-${textureKey}`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 5, end: 8 }),
      frameRate: 10,
      repeat: -1
    });
    scene.anims.create({
      key: `up-${textureKey}`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 9, end: 13 }),
      frameRate: 10,
      repeat: -1
    });
    scene.anims.create({
      key: `down-${textureKey}`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 14, end: 17 }),
      frameRate: 10,
      repeat: -1
    });
}
