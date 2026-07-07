export const subdomains = [
  "checkers-game",
  "cyber-insurance-model",
  "nts-study-buddy",
  "ohs-chess-club",
  "ohs-key-club",
  "old-portfolio",
];

export const keyPopout = new Set(); // used to show specific keys when the player is interacting

export function isLikelyMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Performance detection functions
export function detectDevicePerformance() {
    const result = {
        isSlow: false,
        isVerySlow: false,
        hardwareConcurrency: navigator.hardwareConcurrency || 2,
        deviceMemory: navigator.deviceMemory || 4,
        userAgent: navigator.userAgent,
        isMobile: isLikelyMobileDevice(),
        benchmarkScore: 0
    };

    // Hardware-based detection
    if (result.hardwareConcurrency < 4) result.isSlow = true;
    if (result.deviceMemory < 4) result.isSlow = true;
    if (result.hardwareConcurrency < 2) result.isVerySlow = true;
    if (result.deviceMemory < 2) result.isVerySlow = true;

    // Mobile devices are generally slower
    if (result.isMobile) result.isSlow = true;

    // Old browsers or specific slow devices
    if (/MSIE|Trident|Edge\/1[0-7]/.test(result.userAgent)) result.isVerySlow = true;

    // Run benchmark test
    result.benchmarkScore = runPerformanceBenchmark();

    // Adjust based on benchmark
    if (result.benchmarkScore < 50) result.isSlow = true;
    if (result.benchmarkScore < 20) result.isVerySlow = true;

    return result;
}

export function runPerformanceBenchmark() {
    const iterations = 100000;
    const startTime = performance.now();

    // Simple computational benchmark
    let result = 0;
    for (let i = 0; i < iterations; i++) {
        result += Math.sin(i) * Math.cos(i);
        result += Math.sqrt(i + 1);
    }

    const endTime = performance.now();
    const timeTaken = endTime - startTime;

    // Normalize score (higher is better)
    const score = Math.max(1, Math.min(100, 1000 / timeTaken));

    return Math.round(score);
}

export function monitorFPS(scene, callback) {
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 60;

    const fpsMonitor = () => {
        frameCount++;
        const currentTime = performance.now();

        if (currentTime - lastTime >= 1000) {
            fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
            frameCount = 0;
            lastTime = currentTime;

            if (callback) callback(fps);
        }
    };

    scene.events.on('update', fpsMonitor);

    return {
        getFPS: () => fps,
        destroy: () => scene.events.off('update', fpsMonitor)
    };
}

export function getPerformanceRecommendations(perfData) {
    const recommendations = [];

    if (perfData.isVerySlow) {
        recommendations.push("Disable ghost animations");
        recommendations.push("Reduce iframe count");
        recommendations.push("Lower game resolution");
        recommendations.push("Disable minimap");
    } else if (perfData.isSlow) {
        recommendations.push("Reduce ghost movement frequency");
        recommendations.push("Limit iframe updates");
        recommendations.push("Simplify particle effects");
    }

    if (perfData.hardwareConcurrency < 4) {
        recommendations.push("Consider reducing concurrent animations");
    }

    if (perfData.deviceMemory < 4) {
        recommendations.push("Monitor memory usage - consider cleanup");
    }

    return recommendations;
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
