const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// When this page is opened standalone (recruiter path) rather than embedded in
// the game's iframe, render it in a clean sans-serif (drop the pixel font).
// Returning to the game is handled by the "Pixel version" button (#pixel-toggle,
// in index.html) rather than here.
if (window.self === window.top) {
    document.documentElement.classList.add('recruiter-view');
}


const observer = new IntersectionObserver((entries) => {
    //gives visible elements 'show' else remove
    entries.forEach((entry) => {
        if(entry.isIntersecting){
            entry.target.classList.add("show")
        } else {
            entry.target.classList.remove("show")
        }
    })
})

const hiddenElements = document.querySelectorAll(".hidden")
hiddenElements.forEach((el) => observer.observe(el))

// Inside iframe's JS
window.addEventListener('keydown', (e) => {
    if (e.code === "Escape") {
        window.parent.postMessage('ESCAPE_PRESSED', '*');
    }
});

// (The old floating esc-key.png button + the INFORM USER / DISABLE INTERACTION
// message handlers are gone — the game's own "BACK" button owns closing the
// embedded view now, and the esc-key image should never appear on this page.)

if (isMobile) {
    document.body.classList.add('is-mobile');
}

const projectDict = {
  "Cleaning": {
    name: "Cleaning Website",
    description: "This is a cleaning website that I made for a customer. I designed the site in Figma, used the Next.js framework, incorporated MUI tools from Google, deployed it using Vercel, and purchased a Cloudflare domain for the client. I also assisted them with domain forwarding.",
    videoId: "MU29LHSan7s"
  },
  "SAT": {
    name: "SAT Study Website",
    description: "This is an SAT (standardized test) study website that I created for students to get study help. I sourced all the questions and responses from the SAT question bank, extracted them to my local server, and then transferred them to my Firebase database. I designed the website progressively, adding Firebase OAuth, MUI tools, the Gemini AI API, and deployed it using Vercel.",
    videoId: "5STXbS4Zbwk"
  },
  "Sandbox": {
    name: "Sandbox Game",
    description: "This is a C++ game where I utilized SFML, custom data structures, and memory management to create multiple entities on-screen that acted as elements such as rock, water, and sand. The elements could interact with each other and had their own physics.",
    videoId: "Xn1EZlRGCj0"
  },
  "Raycaster": {
    name: "Raycaster",
    description: "This is a C++ game where I utilized SFML to create a 3D rendering of a 2D map.",
    videoId: "R9uFJCGIhYg"
  },
  "Battery": {
    name: "Battery Bank (e-waste)",
    description: "This is a beta portable battery bank that I created using a lithium battery from a vape. I incorporated a charger and a voltage variable module to charge the battery bank and discharge the appropriate voltage to phones and other appliances.",
    videoId: "Qli8OGthsF0"
  },
  "Circuit": {
    name: "Circuit Gift",
    description: "This is a gift that I made for a friend, where I designed the circuit in KiCad and the casing in FreeCAD. I sourced the motor component from e-waste and also included cryptocurrency as a surprise element inside the gift.",
    videoId: "zG51ETyX5W0"
  },
  "Inventory": {
    name: "Inventory System",
    description: "This is a project I haven't finished yet, as it's still in the beta phase. However, in its current miniature form, it utilizes cardboard, a scissor lift, a client-to-server connection, and AI text analysis to manage inventory. It can also be controlled via a TV remote.",
    videoId: "-HSq1XvC44M"
  },
  "Lego": {
    name: "Lego Cars",
    description: "This project utilizes both Lego and Arduino, along with a custom-designed battery holder in series to power the Lego components and attached DC motors. The car is controlled using a TV remote.",
    videoId: "6gf6aHQHjY0"
  }
};

// Getting the first word that comes from the project name so that I can then load up the modal and the respective video/desc
function openModal() {
    let innerText = event.target.innerText;
    let firstProjWord = innerText.split(' ')[0];
    let project = projectDict[firstProjWord];
    
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDescription = document.getElementById('modal-description');
    const modalVideo = document.getElementById('modal-video');
    
    modalTitle.textContent = innerText;
    modalDescription.textContent = project.description;
    
    // Update iframe src (only if video exists for this project)
    if (project.videoId) {
        modalVideo.src = `https://www.youtube.com/embed/${project.videoId}?autoplay=1`;
        modalVideo.style.display = 'block'; // Show iframe
    } else {
        modalVideo.style.display = 'none'; // Hide iframe if no video
    }
    
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

function closeModal() {
    const modal = document.getElementById('modal');
    const modalVideo = document.getElementById('modal-video');
    
    // Reset video to stop playback
    modalVideo.src = '';
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

// Close modal if clicked outside content
window.onclick = function(event) {
    const modal = document.getElementById('modal');
    if (event.target === modal) {
        closeModal();
    }
};

/* =====================================================================
   Full-page background video — once the intro triangles finish sliding
   in (#background is the last, ~3s), a muted YouTube video starts
   cycling randomly through the same project videoIds used in the modals
   above. It fills the whole viewport at reduced opacity (#video-layer),
   so it reads as a black-tinted video outside the triangles, and the
   translucent triangles above it add their green/red color tints.
   A bottom-left "now playing" badge names the project whose video is
   currently running (updated on every video change).
   ===================================================================== */
(function () {
    const VIDEO_IDS = Object.keys(projectDict)
        .map(function (key) { return projectDict[key].videoId; })
        .filter(Boolean);
    // videoId -> human-readable project name, for the "now playing" badge.
    const VIDEO_NAMES = {};
    Object.keys(projectDict).forEach(function (key) {
        const p = projectDict[key];
        if (p.videoId) VIDEO_NAMES[p.videoId] = p.name || key;
    });

    function pickRandomVideoId(excludeId) {
        if (VIDEO_IDS.length <= 1) return VIDEO_IDS[0];
        let id;
        do {
            id = VIDEO_IDS[Math.floor(Math.random() * VIDEO_IDS.length)];
        } while (id === excludeId);
        return id;
    }

    // Update + show the bottom-left "now playing" badge with a little pop.
    function showNowPlaying(videoId) {
        const badge = document.getElementById('now-playing');
        const nameEl = document.getElementById('now-playing-name');
        if (!badge || !nameEl) return;
        nameEl.textContent = VIDEO_NAMES[videoId] || 'a project';
        badge.classList.add('show');
        badge.classList.remove('pop');
        void badge.offsetWidth; // restart the pop animation
        badge.classList.add('pop');
    }

    function styleVideoIframe(iframe) {
        iframe.style.position = 'absolute';
        iframe.style.top = '50%';
        iframe.style.left = '50%';
        iframe.style.width = '177.78vh';   // oversized + centered "cover" trick so the
        iframe.style.height = '100vh';     // video always fills the viewport with no
        iframe.style.minWidth = '100%';    // letterboxing, regardless of aspect ratio
        iframe.style.minHeight = '56.25vw';
        iframe.style.transform = 'translate(-50%, -50%)';
        iframe.style.border = '0';
        iframe.style.pointerEvents = 'none';
    }

    window.onYouTubeIframeAPIReady = function () {
        if (!VIDEO_IDS.length || !document.getElementById('bg-video-target')) return;
        const firstId = pickRandomVideoId();
        new YT.Player('bg-video-target', {
            videoId: firstId,
            playerVars: {
                autoplay: 1,
                mute: 1,
                controls: 0,
                disablekb: 1,
                fs: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                playsinline: 1,
                rel: 0
            },
            events: {
                onReady: function (e) {
                    e.target.mute();
                    styleVideoIframe(e.target.getIframe());
                    e.target.playVideo();
                },
                onStateChange: function (e) {
                    if (e.data === YT.PlayerState.PLAYING) {
                        // Fade the layer in only once frames are actually coming,
                        // and (re)label the badge with the current project.
                        const layer = document.getElementById('video-layer');
                        if (layer) layer.classList.add('playing');
                        const data = e.target.getVideoData && e.target.getVideoData();
                        showNowPlaying((data && data.video_id) || firstId);
                    } else if (e.data === YT.PlayerState.ENDED) {
                        const data = e.target.getVideoData && e.target.getVideoData();
                        e.target.loadVideoById(pickRandomVideoId(data && data.video_id));
                    }
                }
            }
        });
    };

    function loadYouTubeApi() {
        if (window.YT && window.YT.Player) {
            window.onYouTubeIframeAPIReady();
            return;
        }
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }

    let started = false;
    function start() {
        if (started) return;
        started = true;
        loadYouTubeApi();
    }

    const bg = document.getElementById('background');
    if (bg) {
        bg.addEventListener('animationend', start, { once: true });
        // Fallback in case the animationend event doesn't fire (e.g. reduced motion).
        setTimeout(start, 3400);
    } else {
        window.addEventListener('DOMContentLoaded', start);
    }
})();

/* =====================================================================
   Goop reveal — the dripping-liquid effect over the background video.
   The #goop-cover canvas is an opaque black sheet between the video and
   the triangles. Every frame we repaint it black and punch the falling
   drips through it with destination-out; the CSS `filter: url(#goo)`
   (gaussian blur + alpha threshold) on the canvas merges nearby holes
   into one gooey blob, exactly like the classic CSS goo tutorial —
   inverted into a reveal, so the drips read as liquid made of video.
   ===================================================================== */
(function () {
    const canvas = document.getElementById('goop-cover');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');

    // Rendered at half resolution and upscaled by the CSS box (canvas is
    // `width/height: 100vw/100vh` — the browser stretches the smaller
    // bitmap to fit). The gooey blur filter already softens every edge, so
    // the resolution drop is invisible but quarters the fill/arc rasterization
    // cost per shape, which is what actually got expensive when the blob
    // count went up — not the shape count itself.
    const RES_SCALE = 0.5;
    let W = 0, H = 0;
    function resize() {
        W = canvas.width = Math.round(window.innerWidth * RES_SCALE);
        H = canvas.height = Math.round(window.innerHeight * RES_SCALE);
    }
    window.addEventListener('resize', resize);
    resize();

    // Lava-lamp globs. Each blob slowly bobs UP and DOWN on a long sine
    // (thermal convection), sways sideways, and squashes/stretches with the
    // direction it's travelling — and is drawn as a little cluster of breathing
    // sub-lobes so the merged silhouette reads as wobbling liquid, not a hard
    // disc. The goo filter (blur + alpha threshold) fuses neighbouring globs
    // into one flowing body.
    //
    // Rather than each glob traversing the whole screen and fully leaving it
    // (which read as globs "disappearing and regenerating"), every glob now
    // orbits a HOME position and only bobs a limited distance around it, so the
    // field is always full and continuous. More globs + bigger radii = more goop.
    const COUNT = window.innerWidth < 700 ? 46 : 80;
    const COLS = window.innerWidth < 700 ? 6 : 10;
    const blobs = [];
    for (let i = 0; i < COUNT; i++) {
        blobs.push({
            // Home cell, scattered over the whole screen (slight bleed past the
            // edges so goop hugs the borders instead of stopping short of them).
            x: -0.05 + 1.1 * ((i % COLS) + Math.random()) / COLS,
            y: -0.05 + 1.1 * Math.random(),
            r: (74 + Math.random() * 110) * RES_SCALE, // glob radius, in the (downscaled) canvas's own px
            phase: Math.random() * Math.PI * 2,       // where it is in its bob
            speed: 0.05 + Math.random() * 0.08,       // convection speed (slow!)
            amp: 0.10 + Math.random() * 0.14,         // vertical bob amount (of H)
            sway: 0.04 + Math.random() * 0.10,        // horizontal drift amount (of W)
            swayPhase: Math.random() * Math.PI * 2,
            swaySpeed: 0.09 + Math.random() * 0.14,
            wob: Math.random() * Math.PI * 2,         // deformation phase
            lobes: 4 + (Math.random() * 3 | 0)        // sub-lobes making up the glob
        });
    }

    // The bob/sway/wobble here is all slow (multi-second periods), so a
    // repaint rate above ~30fps buys nothing visible — cap it to roughly
    // halve the frame count on 60Hz+ displays.
    const FRAME_INTERVAL_MS = 1000 / 30;
    let lastPaint = 0;
    function frame(now) {
        if (now - lastPaint < FRAME_INTERVAL_MS) { requestAnimationFrame(frame); return; }
        lastPaint = now;
        const t = now / 1000;
        // Opaque cover...
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        // ...with the liquid globs punched out of it.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#fff';
        for (const b of blobs) {
            const rise = b.phase + t * b.speed;
            // Vertical convection: bobs up and down around its home row, but
            // never wanders far enough to fully leave the screen.
            const yc = (b.y + b.amp * Math.cos(rise)) * H;
            const xc = (b.x + b.sway * Math.sin(b.swayPhase + t * b.swaySpeed)) * W;
            // Elongate along travel: fastest mid-bob (sin peaks), rounder at
            // the turnarounds — exactly how a real glob necks and pulls free.
            const stretch = 1 + 0.22 * Math.sin(rise);
            const N = b.lobes;
            for (let k = 0; k < N; k++) {
                const a = (k / N) * Math.PI * 2 + b.wob + t * 0.3;
                const spread = b.r * (0.26 + 0.14 * Math.sin(t * 0.7 + k * 1.3 + b.wob));
                const rr = b.r * (0.5 + 0.22 * Math.sin(t * 0.9 + k * 1.7 + b.wob));
                ctx.beginPath();
                ctx.arc(xc + Math.cos(a) * spread, yc + Math.sin(a) * spread * stretch, rr, 0, Math.PI * 2);
                ctx.fill();
            }
            // Solid core keeps the lobes reading as a single body.
            ctx.beginPath();
            ctx.ellipse(xc, yc, b.r * 0.68, b.r * 0.68 * stretch, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();

/* =====================================================================
   Load-More toggles (archived projects + awards) and the collapsible
   Software / Hardware project categories.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', function () {
    // ---- Archived projects: show 2, reveal the rest on demand ----
    const archMore = document.getElementById('archived-load-more');
    if (archMore) {
        archMore.addEventListener('click', function () {
            const list = document.getElementById('archived-list');
            const hidden = list.querySelectorAll('.archived-project-item.collapsed');
            if (hidden.length) {
                hidden.forEach(el => el.classList.remove('collapsed'));
                archMore.textContent = 'Show Less';
            } else {
                const items = list.querySelectorAll('.archived-project-item');
                items.forEach((el, idx) => { if (idx >= 2) el.classList.add('collapsed'); });
                archMore.textContent = 'Load More';
                document.getElementById('archived-projects').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // ---- Awards: show the first 5, reveal the rest on demand ----
    const awardsMore = document.getElementById('awards-load-more');
    if (awardsMore) {
        const awardItems = Array.from(document.querySelectorAll('#awards-desc li'));
        const SHOWN = 5;
        awardItems.forEach((li, idx) => { if (idx >= SHOWN) li.style.display = 'none'; });
        if (awardItems.length <= SHOWN) {
            awardsMore.style.display = 'none';
        }
        awardsMore.addEventListener('click', function () {
            const isHidden = awardItems.some((li, idx) => idx >= SHOWN && li.style.display === 'none');
            awardItems.forEach((li, idx) => {
                if (idx >= SHOWN) li.style.display = isHidden ? '' : 'none';
            });
            awardsMore.textContent = isHidden ? 'Show Less' : 'Load More';
            if (!isHidden) {
                document.getElementById('awards-holder').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // ---- Collapsible Software / Hardware categories ----
    document.querySelectorAll('.proj-cat-header').forEach(function (header) {
        header.addEventListener('click', function () {
            header.parentElement.classList.toggle('expanded');
        });
    });
});
