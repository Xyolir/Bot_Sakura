/* ===== THEME ===== */
const themeSwitch = document.getElementById("themeSwitch");

if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    if (themeSwitch) themeSwitch.checked = true;
}

if (themeSwitch) {
    themeSwitch.addEventListener("change", () => {
        document.body.classList.toggle("dark-mode", themeSwitch.checked);
        localStorage.setItem("theme", themeSwitch.checked ? "dark" : "light");
    });
}

/* ===== MUSIC ===== */
// Fonctionne sur toute page qui contient #musicSwitch et #bgMusic (index + dashboard).
const musicSwitch = document.getElementById("musicSwitch");
const music = document.getElementById("bgMusic");

if (musicSwitch && music) {
    // Reprend la musique là où elle s'est arrêtée en changeant de page
    const savedTime = parseFloat(localStorage.getItem("musicTime"));
    if (!Number.isNaN(savedTime)) {
        const restoreTime = () => {
            if (savedTime < music.duration) music.currentTime = savedTime;
        };
        if (music.readyState >= 1) restoreTime();
        else music.addEventListener("loadedmetadata", restoreTime, { once: true });
    }

    const startMusic = async () => {
        try {
            await music.play();
            return true;
        } catch {
            return false; // lecture automatique bloquée par le navigateur
        }
    };

    if (localStorage.getItem("music") === "on") {
        musicSwitch.checked = true;
        startMusic().then((ok) => {
            if (ok) return;
            // Le navigateur exige un geste de l'utilisateur : on relance au premier clic / touche
            const resume = () => { if (musicSwitch.checked) startMusic(); };
            window.addEventListener("pointerdown", resume, { once: true });
            window.addEventListener("keydown", resume, { once: true });
        });
    }

    musicSwitch.addEventListener("change", async () => {
        if (musicSwitch.checked) {
            const ok = await startMusic();
            if (!ok) {
                musicSwitch.checked = false;
                return;
            }
            localStorage.setItem("music", "on");
        } else {
            music.pause();
            localStorage.setItem("music", "off");
        }
    });

    window.addEventListener("pagehide", () => {
        localStorage.setItem("musicTime", String(music.currentTime));
    });
}
