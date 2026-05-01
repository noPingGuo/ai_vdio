let time = 0;
let timer = null;

// ── 状态文字 ──
function setStatus(text) {
    document.getElementById("status").innerText = text;
}

// ── 字幕 ──
function setSubtitle(text) {
    const box = document.querySelector(".text-box");
    if (box) box.innerText = text;
}

// ── 歌曲信息 ──
function setSongInfo(title, artist) {
    const titleEl = document.getElementById("songTitle");
    const artistEl = document.getElementById("songArtist");
    if (titleEl) titleEl.innerText = title;
    if (artistEl) artistEl.innerText = artist;
}

// ── 歌单列表 ──
function renderPlaylist(tracks) {
    const list = document.getElementById("playlist");
    if (!list) return;
    list.innerHTML = tracks.map((t, i) =>
        `<li data-index="${i}">${t.name}<span class="pl-artist"> — ${t.artist}</span></li>`
    ).join("");
}

// ── 高亮当前播放 ──
function highlightTrack(index) {
    const items = document.querySelectorAll("#playlist li");
    items.forEach((li, i) => {
        li.classList.toggle("active", i === index);
    });
    // 滚动到可见区域
    const active = items[index];
    if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ── 计时器 ──
function startTimer() {
    time = 0;
    timer = setInterval(() => {
        time++;
        document.getElementById("time").innerText = formatTime(time);
    }, 1000);
}

function stopTimer() {
    clearInterval(timer);
}

function formatTime(t) {
    let m = Math.floor(t / 60);
    let s = t % 60;
    return m + ":" + (s < 10 ? "0" + s : s);
}

// ── 波形 ──
function buildWave(count = 40) {
    const wave = document.getElementById("wave");
    if (!wave) return;
    wave.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.animationDelay = (i * 0.08) + "s";
        bar.style.height = (10 + Math.random() * 10) + "px";
        wave.appendChild(bar);
    }
}

function waveActive(on) {
    const bars = document.querySelectorAll(".bar");
    bars.forEach(b => {
        b.style.animationPlayState = on ? "running" : "paused";
    });
}

window.addEventListener("DOMContentLoaded", buildWave);
