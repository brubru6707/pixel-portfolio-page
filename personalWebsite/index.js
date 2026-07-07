const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// When this page is opened standalone (recruiter path) rather than embedded in
// the game's iframe, render it in a clean sans-serif (drop the pixel font) and
// show an Exit button that clears the saved choice and returns to the gate.
if (window.self === window.top) {
    document.documentElement.classList.add('recruiter-view');
    window.addEventListener('DOMContentLoaded', function () {
        const exit = document.createElement('button');
        exit.id = 'recruiter-exit';
        exit.type = 'button';
        exit.textContent = 'Exit';
        exit.addEventListener('click', function () {
            try { localStorage.removeItem('visitorType'); } catch (e) {}
            window.location.href = '../index.html';
        });
        document.body.appendChild(exit);
    });
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

document.getElementById('escButton-holder').addEventListener('click', function() {
    if (isMobile) {
        window.parent.postMessage('ESCAPE_PRESSED', '*');
    }
});

window.addEventListener('message', (event) => {
    if (event.data === 'INFORM USER') {
        document.getElementById('escButton-holder').style.visibility = 'visible';
    } else if (event.data === 'DISABLE INTERACTION') {
        // Aggressive lockdown for mobile/iOS Safari
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '0';
        document.body.style.left = '0';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.WebkitTouchCallout = 'none';
        document.body.style.WebkitUserSelect = 'none';
        document.body.style.KhtmlUserSelect = 'none';
        document.body.style.MozUserSelect = 'none';
        document.body.style.msUserSelect = 'none';
        
        // iOS Safari specific fixes
        document.body.style.WebkitOverflowScrolling = 'touch'; // Actually disable it
        document.documentElement.style.overflow = 'hidden';
        document.documentElement.style.position = 'fixed';
        document.documentElement.style.width = '100%';
        document.documentElement.style.height = '100%';
        
        // Disable all pointer events except for the ESC button
        document.body.style.pointerEvents = 'none';
        document.documentElement.style.pointerEvents = 'none';
        const escButton = document.getElementById('escButton-holder');
        if (escButton) {
            escButton.style.pointerEvents = 'auto';
            escButton.style.WebkitTouchCallout = 'default';
            escButton.style.WebkitUserSelect = 'auto';
        }
        
        // Prevent all touch and scroll events
        const preventAll = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        
        // Add multiple layers of event prevention
        document.addEventListener('touchstart', preventAll, { passive: false, capture: true });
        document.addEventListener('touchmove', preventAll, { passive: false, capture: true });
        document.addEventListener('touchend', preventAll, { passive: false, capture: true });
        document.addEventListener('wheel', preventAll, { passive: false, capture: true });
        document.addEventListener('scroll', preventAll, { passive: false, capture: true });
        document.addEventListener('gesturestart', preventAll, { passive: false, capture: true });
        document.addEventListener('gesturechange', preventAll, { passive: false, capture: true });
        document.addEventListener('gestureend', preventAll, { passive: false, capture: true });
        
        // iOS Safari momentum scrolling prevention
        document.addEventListener('touchstart', function(e) {
            if (e.target !== escButton && !escButton.contains(e.target)) {
                e.preventDefault();
            }
        }, { passive: false });
        
        console.log('Interaction disabled for iframe overlay');
    } else if (event.data === 'ENABLE INTERACTION') {
        // Re-enable interaction
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
        document.body.style.pointerEvents = '';
        document.body.style.WebkitTouchCallout = '';
        document.body.style.WebkitUserSelect = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.position = '';
        
        // Remove all event listeners (this is a simplified cleanup)
        console.log('Interaction re-enabled');
    }
});


if (isMobile) {
    document.body.classList.add('is-mobile');
}

const projectDict = {
  "Cleaning": {
    description: "This is a cleaning website that I made for a customer. I designed the site in Figma, used the Next.js framework, incorporated MUI tools from Google, deployed it using Vercel, and purchased a Cloudflare domain for the client. I also assisted them with domain forwarding.",
    videoId: "MU29LHSan7s"
  },
  "SAT": {
    description: "This is an SAT (standardized test) study website that I created for students to get study help. I sourced all the questions and responses from the SAT question bank, extracted them to my local server, and then transferred them to my Firebase database. I designed the website progressively, adding Firebase OAuth, MUI tools, the Gemini AI API, and deployed it using Vercel.",
    videoId: "5STXbS4Zbwk"
  },
  "Sandbox": {
    description: "This is a C++ game where I utilized SFML, custom data structures, and memory management to create multiple entities on-screen that acted as elements such as rock, water, and sand. The elements could interact with each other and had their own physics.",
    videoId: "Xn1EZlRGCj0"
  },
  "Raycaster": {
    description: "This is a C++ game where I utilized SFML to create a 3D rendering of a 2D map.",
    videoId: "R9uFJCGIhYg"
  },
  "Battery": {
    description: "This is a beta portable battery bank that I created using a lithium battery from a vape. I incorporated a charger and a voltage variable module to charge the battery bank and discharge the appropriate voltage to phones and other appliances.",
    videoId: "Qli8OGthsF0"
  },
  "Circuit": {
    description: "This is a gift that I made for a friend, where I designed the circuit in KiCad and the casing in FreeCAD. I sourced the motor component from e-waste and also included cryptocurrency as a surprise element inside the gift.",
    videoId: "zG51ETyX5W0"
  },
  "Inventory": {
    description: "This is a project I haven't finished yet, as it's still in the beta phase. However, in its current miniature form, it utilizes cardboard, a scissor lift, a client-to-server connection, and AI text analysis to manage inventory. It can also be controlled via a TV remote.",
    videoId: "-HSq1XvC44M"
  },
  "Lego": {
    description: "This project utilizes both Lego and Arduino, along with a custom-designed battery holder in series to power the Lego components and attached DC motors. The car is controlled using a TV remote.",
    videoId: "6gf6aHQHjY0"
  }
};

// Getting the first word that comes from the project name so that I can then load up the modal and the respective video/desc
function openModal() {
    document.getElementById('escButton-holder').style.visibility = "hidden"
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
    document.getElementById('escButton-holder').style.visibility = "visible"
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
   Splatoon-style rainbow goop — drips down from the two intro triangles
   once their slide-in animations finish (#background is the last, ~3s).
   ===================================================================== */
(function () {
    const GOOP_COLORS = [
        '#ff2e63', '#ff8b00', '#ffd500', '#3ddc84',
        '#00c2ff', '#4d5bff', '#b14dff', '#ff4de0'
    ];

    function spawnGoop() {
        const layer = document.getElementById('goop-layer');
        if (!layer || layer.dataset.done) return;
        layer.dataset.done = '1';

        const count = 14;
        for (let i = 0; i < count; i++) {
            const drip = document.createElement('div');
            drip.className = 'goop-drip';
            const color = GOOP_COLORS[Math.floor(Math.random() * GOOP_COLORS.length)];
            const width = 22 + Math.random() * 55;          // px
            const left = (i / count) * 100 + (Math.random() * 6 - 3); // %
            const height = 45 + Math.random() * 55;          // vh
            drip.style.left = left + '%';
            drip.style.width = width + 'px';
            drip.style.height = height + 'vh';
            drip.style.background = 'linear-gradient(to bottom, ' + color + ' 0%, ' + color + ' 70%, ' + color + 'cc 100%)';
            drip.style.animationDelay = (Math.random() * 0.6) + 's';
            layer.appendChild(drip);
        }
    }

    const bg = document.getElementById('background');
    if (bg) {
        bg.addEventListener('animationend', spawnGoop, { once: true });
        // Fallback in case the animationend event doesn't fire (e.g. reduced motion).
        setTimeout(spawnGoop, 3400);
    } else {
        window.addEventListener('DOMContentLoaded', spawnGoop);
    }
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
