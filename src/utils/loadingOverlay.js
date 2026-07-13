// Game-loading overlay: a pixel dial (rainbow sparks) plus a real progress
// bar driven by Phaser's own load-progress events (see preload() in
// src/scenes/MainScene.js) — never a fake timer. Plain script (not a
// module) so `window.showGameLoading` etc. are global before Phaser/game.js
// load, matching how index.html has always wired this up.
(function () {
    var overlay = document.getElementById('game-loading');
    var spinner = overlay.querySelector('.loading-spinner');
    var fill = document.getElementById('loading-bar-fill');
    var rainbow = ['#ff2d55', '#ff9500', '#ffe500', '#34d158', '#00c7ff', '#5e5ce6', '#ff2dd4'];
    var sparkTimer = null;

    function spawnLoadingSparks() {
        var r = spinner.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (var i = 0; i < 2; i++) {
            var angle = Math.random() * Math.PI * 2;
            var dist = 30 + Math.random() * 55;
            var p = document.createElement('div');
            p.className = 'loading-particle';
            var size = 3 + Math.floor(Math.random() * 4);
            p.style.width = p.style.height = size + 'px';
            var col = rainbow[Math.floor(Math.random() * rainbow.length)];
            p.style.background = col;
            p.style.boxShadow = '0 0 5px ' + col;
            p.style.left = (cx + Math.cos(angle) * 36) + 'px';
            p.style.top = (cy + Math.sin(angle) * 36) + 'px';
            p.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(0) + 'px');
            p.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(0) + 'px');
            p.addEventListener('animationend', function () { this.remove(); });
            document.body.appendChild(p);
        }
    }

    // Real progress only — driven by MainScene's Phaser load events,
    // never a fake timer.
    window.showGameLoading = function () {
        if (fill) fill.style.width = '0%';
        overlay.classList.add('show');
        clearInterval(sparkTimer);
        sparkTimer = setInterval(spawnLoadingSparks, 120);
    };
    window.updateGameLoading = function (progress) {
        if (fill) fill.style.width = Math.round(progress * 100) + '%';
    };
    window.hideGameLoading = function () {
        overlay.classList.remove('show');
        clearInterval(sparkTimer);
        sparkTimer = null;
    };
})();
