// ============================================================
// 音乐播放器 — HTML5 Audio 封装 + 进度条 + 歌词同步
// ============================================================
const musicAudio = new Audio();
let musicResolve = null;
let progressDragging = false;

// ── 播放一首歌 ──
function playMusic(url) {
    return new Promise((resolve) => {
        musicResolve = resolve;
        musicAudio.src = url;
        musicAudio.volume = 0;

        const cleanup = () => {
            musicAudio.removeEventListener("ended", onEnded);
            musicAudio.removeEventListener("error", onError);
        };

        const onEnded = () => {
            cleanup();
            musicResolve = null;
            resolve();
        };

        const onError = (e) => {
            cleanup();
            console.warn("音乐播放失败，跳过当前歌曲", e);
            musicResolve = null;
            resolve();
        };

        musicAudio.addEventListener("ended", onEnded);
        musicAudio.addEventListener("error", onError);

        musicAudio.play()
            .then(() => {
                fadeInMusic(2000);
                resetProgress();
            })
            .catch((err) => {
                console.warn("浏览器阻止自动播放:", err.message);
                cleanup();
                musicResolve = null;
                resolve();
            });
    });
}

function abortMusic() {
    if (musicResolve) { musicResolve(); musicResolve = null; }
    musicAudio.pause();
    musicAudio.currentTime = 0;
}

function stopMusic() { abortMusic(); }

function fadeOutMusic(ms = 2000) {
    return new Promise((resolve) => {
        const startVol = musicAudio.volume;
        if (startVol <= 0) { resolve(); return; }
        const steps = Math.floor(ms / 50);
        const delta = startVol / steps;
        let i = 0;
        const timer = setInterval(() => {
            i++;
            musicAudio.volume = Math.max(0, startVol - delta * i);
            if (i >= steps) { clearInterval(timer); musicAudio.volume = 0; resolve(); }
        }, 50);
    });
}

function fadeInMusic(ms = 2000) {
    return new Promise((resolve) => {
        musicAudio.volume = 0;
        const steps = Math.floor(ms / 50);
        const delta = 1 / steps;
        let i = 0;
        const timer = setInterval(() => {
            i++;
            musicAudio.volume = Math.min(1, delta * i);
            if (i >= steps) { clearInterval(timer); musicAudio.volume = 1; resolve(); }
        }, 50);
    });
}

// ============================================================
// 进度条
// ============================================================
function resetProgress() {
    const bar = document.getElementById("progressBar");
    if (bar) { bar.value = 0; bar.max = 1000; }
    document.getElementById("currentTime").innerText = "0:00";
    document.getElementById("totalTime").innerText = "0:00";
}

// timeupdate 驱动进度条 + 歌词同步
musicAudio.addEventListener("timeupdate", () => {
    if (progressDragging) return;
    const bar = document.getElementById("progressBar");
    const dur = musicAudio.duration;
    if (!bar || isNaN(dur)) return;
    bar.value = (musicAudio.currentTime / dur) * 1000;
    document.getElementById("currentTime").innerText = fmtTime(musicAudio.currentTime);
    document.getElementById("totalTime").innerText = fmtTime(dur);
    syncLyricsToTime(musicAudio.currentTime);
});

// ── 用户拖动进度条 ──
function onProgressInput(e) {
    progressDragging = true;
    const dur = musicAudio.duration;
    if (isNaN(dur)) return;
    const t = (e.target.value / 1000) * dur;
    document.getElementById("currentTime").innerText = fmtTime(t);
    syncLyricsToTime(t);
}

function onProgressChange(e) {
    progressDragging = false;
    const dur = musicAudio.duration;
    if (isNaN(dur)) return;
    musicAudio.currentTime = (e.target.value / 1000) * dur;
}

function fmtTime(sec) {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
}
