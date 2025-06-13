const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);


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

// Getting the first word that comes from the project name so that I can then load up the modal and the respected video/dsc
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
