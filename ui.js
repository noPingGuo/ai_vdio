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

// ── 歌词（LRC 解析 + Apple Music 风格同步）──
let lyricsLines = [];
let _prevLyricIdx = -1;
let _scrollThrottleUntil = 0;
let _pendingScrollIdx = -1;   // 节流期间暂存的目标行
let _scrollRafId = null;      // 当前滚动动画 ID，用于中断

const LYRIC_OFFSET = 0.25;    // 提前量（秒）
const LYRIC_EPS    = 0.05;    // 二分容差（秒）

function setLyrics(lrcText) {
    const el = document.getElementById("lyricsBox");
    lyricsLines = [];
    _prevLyricIdx = -1;
    _scrollThrottleUntil = 0;
    if (!el) return;
    if (!lrcText) { el.innerHTML = ""; el.style.paddingTop = el.style.paddingBottom = ""; return; }

    // 解析 LRC
    const re = /^\[(\d{2}):(\d{2})(?:[.:](\d{2,3}))?\]/;
    for (const line of lrcText.split("\n")) {
        const m = line.match(re);
        if (!m) continue;
        const mins = parseInt(m[1]), secs = parseInt(m[2]);
        const ms = m[3] ? parseInt(m[3].padEnd(3,"0").slice(0,3)) : 0;
        const text = line.replace(m[0], "").trim();
        if (text) lyricsLines.push({ timeSec: mins * 60 + secs + ms / 1000, text });
    }

    el.innerHTML = lyricsLines.map((l, i) =>
        `<p data-lyric-index="${i}">${l.text}</p>`
    ).join("");

    // rAF 等容器渲染完成后再算 padding（防止高度为 0）
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const h = el.clientHeight;
            if (h > 0) {
                el.style.paddingTop = (h / 2) + "px";
                el.style.paddingBottom = (h / 2) + "px";
            }
        });
    });
    el.scrollTop = 0;
}

function syncLyricsToTime(currentSec) {
    const el = document.getElementById("lyricsBox");
    if (!el || lyricsLines.length === 0) return;

    const sec = currentSec + LYRIC_OFFSET + LYRIC_EPS;

    // 二分查找：最后一条 timeSec <= sec 的行
    let lo = 0, hi = lyricsLines.length - 1, activeIdx = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lyricsLines[mid].timeSec <= sec) {
            activeIdx = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    if (activeIdx === _prevLyricIdx) return;

    // ── 唯一高亮 ──
    if (_prevLyricIdx >= 0 && el.children[_prevLyricIdx]) {
        el.children[_prevLyricIdx].classList.remove("active-lyric");
    }
    if (activeIdx >= 0 && el.children[activeIdx]) {
        el.children[activeIdx].classList.add("active-lyric");
    }
    _prevLyricIdx = activeIdx;

    // ── 300ms 节流：未到期则暂存，到期后补滚 ──
    const now = performance.now();
    if (activeIdx >= 0) {
        if (now >= _scrollThrottleUntil) {
            _scrollThrottleUntil = now + 300;
            _pendingScrollIdx = -1;
            const p = el.children[activeIdx];
            scrollToEased(el, lyricCenterTarget(el, p), 250);
        } else {
            _pendingScrollIdx = activeIdx;
            const delay = Math.max(0, _scrollThrottleUntil - now + 10);
            setTimeout(() => {
                if (_pendingScrollIdx >= 0 && _pendingScrollIdx === _prevLyricIdx) {
                    const p2 = el.children[_pendingScrollIdx];
                    if (p2) scrollToEased(el, lyricCenterTarget(el, p2), 250);
                    _pendingScrollIdx = -1;
                }
            }, delay);
        }
    }
}

// ── 计算 p 元素在 el 中居中所需的 scrollTop ──
function lyricCenterTarget(el, p) {
    const elRect = el.getBoundingClientRect();
    const pRect = p.getBoundingClientRect();
    // p 相对于 el 内容顶部的偏移
    const relTop = pRect.top - elRect.top + el.scrollTop;
    return relTop - el.clientHeight / 2 + pRect.height / 2;
}

// ── 可中断的 rAF 缓动滚动 ──
function scrollToEased(el, to, duration) {
    // 中断上一次未完成的动画
    if (_scrollRafId !== null) {
        cancelAnimationFrame(_scrollRafId);
        _scrollRafId = null;
    }

    const start = el.scrollTop;
    const change = to - start;
    const startTime = performance.now();

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        el.scrollTop = start + change * eased;
        if (progress < 1) {
            _scrollRafId = requestAnimationFrame(tick);
        } else {
            _scrollRafId = null;
        }
    }
    _scrollRafId = requestAnimationFrame(tick);
}

// ── 时段显示 ──
function setMood(mood) {
    const el = document.getElementById("moodBadge");
    if (el) {
        el.innerText = `${mood.emoji} ${mood.name}`;
        el.style.color = mood.color;
        el.style.borderColor = mood.color;
    }
}

// ── 初始化时段显示 ──
function initMoodDisplay() {
    const mood = getCurrentMood();
    setMood(mood);
    const titleEl = document.querySelector(".title");
    if (titleEl) titleEl.innerText = `${mood.emoji} ${mood.name}`;
    const subEl = document.querySelector(".subtitle");
    if (subEl) subEl.innerText = mood.greeting;
}

window.addEventListener("DOMContentLoaded", () => {
    buildWave();
    initMoodDisplay();
});
