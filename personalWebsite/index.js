//Bruno Rodriguez
//version 12/30/22


// let changePageColor = e => {
//     console.log(e.getAttribute('value'))
//     let color = e.getAttribute("value")
//     document.documentElement.style.setProperty('--main', color);
// }

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