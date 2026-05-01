// ============================================================
// 音乐播放器 — HTML5 Audio 封装
// ============================================================
const musicAudio = new Audio();

// 播放一首歌，返回 Promise（播完后 resolve）
function playMusic(url) {
    return new Promise((resolve) => {
        musicAudio.src = url;
        musicAudio.volume = 1;

        const cleanup = () => {
            musicAudio.removeEventListener("ended", onEnded);
            musicAudio.removeEventListener("error", onError);
        };

        const onEnded = () => {
            cleanup();
            resolve();
        };

        const onError = (e) => {
            cleanup();
            console.warn("音乐播放失败，跳过当前歌曲", e);
            resolve(); // 失败也继续，跳到下一首
        };

        musicAudio.addEventListener("ended", onEnded);
        musicAudio.addEventListener("error", onError);

        musicAudio.play().catch((err) => {
            console.warn("浏览器阻止自动播放:", err.message);
            cleanup();
            resolve();
        });
    });
}

function stopMusic() {
    musicAudio.pause();
    musicAudio.currentTime = 0;
}

// 音乐淡出（音量从当前值逐渐降到 0）
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
            if (i >= steps) {
                clearInterval(timer);
                musicAudio.volume = 0;
                resolve();
            }
        }, 50);
    });
}

// 音乐淡入（音量从 0 逐渐升到 1）
function fadeInMusic(ms = 1500) {
    return new Promise((resolve) => {
        musicAudio.volume = 0;
        const steps = Math.floor(ms / 50);
        const delta = 1 / steps;
        let i = 0;

        const timer = setInterval(() => {
            i++;
            musicAudio.volume = Math.min(1, delta * i);
            if (i >= steps) {
                clearInterval(timer);
                musicAudio.volume = 1;
                resolve();
            }
        }, 50);
    });
}
