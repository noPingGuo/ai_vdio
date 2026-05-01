// ============================================================
// 电台总调度 — AI 旁白 → 音乐 → AI 旁白 → 音乐 → 循环
// ============================================================
let radioActive = false;
let radioPaused = false;
let skipMode = null;

// ── 跳过当前：用户点上一首/下一首时调用 ──
function skipToNext() {
    if (!radioActive) return;
    skipMode = "next";
    abortNarration();
    abortMusic();
}

function skipToPrev() {
    if (!radioActive) return;
    skipMode = "prev";
    abortNarration();
    abortMusic();
}

// ── 主循环 ──
async function startRadio() {
    if (radioActive) return;
    radioActive = true;
    updatePlayBtn(true);
    skipMode = null;
    resetPeriodTracking();
    applyMoodToUI();  // 同步时段到界面

    while (radioActive) {
        // 每个循环开始时检测时段变化
        if (periodChanged()) {
            applyMoodToUI();
        }

        const track = getCurrentTrack();
        if (!track) {
            setStatus("● No tracks");
            break;
        }

        // ——— 第 1 步：AI 生成旁白 ———
        setStatus("● AI thinking...");
        const mood = getCurrentMood();
        setSubtitle(`${mood.emoji} Claudio 正在酝酿...`);
        waveActive(false);

        try {
            const narration = await getTextFromAI(track);
            setSubtitle(narration);                        // 字幕显示原文
            setSongInfo(track.name, track.artist);
            highlightTrack(currentTrackIndex);
            setLyrics("");

            // ——— 第 2 步：TTS 朗读（舞台指示转化为音频行为）———
            setStatus("● Speaking...");
            await speakNarration(narration);

            if (handleSkip()) continue;
            if (!radioActive) break;

            // 旁白结束后的呼吸停顿
            await sleep(600);

            // ——— 第 3 步：淡入播放音乐 ———
            setStatus("● Now Playing...");
            setSubtitle(`${track.name} — ${track.artist}`);
            waveActive(true);

            // 异步加载歌词
            fetchLyric(track.id).then(lrc => {
                if (lrc && !skipMode) setLyrics(lrc.lyric || lrc.translated || "");
            });

            await playMusic(track.url);  // playMusic 内含 fadeInMusic

            if (handleSkip()) continue;
            if (!radioActive) break;

            // ——— 第 4 步：音乐淡出，呼吸，进入下一轮 ———
            await fadeOutMusic(1000);
            waveActive(false);
            setLyrics("");
            nextTrack();
            await sleep(400);

        } catch (err) {
            console.error("电台循环出错:", err);
            setStatus("● Error");
            setSubtitle("出现错误，请重试。（检查 API Key 或网络连接）");
            break;
        }
    }

    radioActive = false;
    skipMode = null;
    updatePlayBtn(false);
    waveActive(false);
    setLyrics("");
    setStatus("● Ready");
}

// ── 跳过处理：返回 true 表示本轮被跳过，应 continue ──
function handleSkip() {
    if (!skipMode) return false;

    if (skipMode === "next") {
        nextTrack();
    } else if (skipMode === "prev") {
        prevTrack();
    }

    skipMode = null;
    waveActive(false);
    setLyrics("");
    return true;
}

// ── 时段 UI 同步 ──
function applyMoodToUI() {
    const mood = getCurrentMood();
    setMood(mood);
    const titleEl = document.querySelector(".title");
    if (titleEl) titleEl.innerText = `${mood.emoji} ${mood.name}`;
    const subEl = document.querySelector(".subtitle");
    if (subEl) subEl.innerText = mood.greeting;
    document.querySelector(".card").style.borderTop = `3px solid ${mood.color}`;
    console.log(`🕐 时段切换: ${mood.name} (${new Date().getHours()}:00)`);
}

// ── 暂停 / 恢复 ──
function pauseRadio() {
    radioPaused = true;
    musicAudio.pause();
    const na = getNarrationAudio();
    if (na) na.pause();
    waveActive(false);
    stopTimer();
    setStatus("● Paused");
    updatePlayBtn(false);
}

function resumeRadio() {
    radioPaused = false;
    if (musicAudio.src && !musicAudio.ended && musicAudio.paused) {
        musicAudio.play().catch(() => {});
    }
    const na = getNarrationAudio();
    if (na && na.paused) {
        na.play().catch(() => {});
    }
    waveActive(true);
    startTimer();
    setStatus("● Playing...");
    updatePlayBtn(true);
}

// ── 停止电台 ──
function stopRadio() {
    radioActive = false;
    radioPaused = false;
    abortNarration();
    stopMusic();
    waveActive(false);
    setLyrics("");
    setStatus("● Stopped");
    updatePlayBtn(false);
}

// ── 辅助 ──
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updatePlayBtn(active) {
    const btn = document.getElementById("playBtn");
    if (btn) btn.textContent = active ? "⏸" : "▶";
}

// ============================================================
// 入口
// ============================================================
let _playlistLoaded = false;

async function toggleAudio() {
    if (radioPaused) { resumeRadio(); return; }
    if (radioActive) { pauseRadio(); return; }

    if (!_playlistLoaded) {
        setStatus("● Loading playlist...");
        try {
            await loadPlaylistQuick(PLAYLIST_ID);
            _playlistLoaded = true;
            renderPlaylist(playlist.tracks);
            setSongInfo("Ready", `歌单: ${playlist.name}`);
        } catch (err) {
            console.error(err);
            setStatus("● 歌单加载失败");
            setSubtitle("无法加载歌单，请检查 ID 或 API 是否可用。\n\n" + err.message);
            return;
        }
    }
    await startRadio();
}

function init() {
    showVoiceInfo();
    setStatus("● Ready");
    // 预热 Vercel serverless 函数（静默 GET，不消耗 TTS 配额）
    fetch("/api/tts").catch(() => {});
}

function showVoiceInfo() {
    console.log("🎙 TTS: Fish Audio");
    console.log("   Voice ID:", FISH_VOICE_ID);
    const vi = document.getElementById("voiceName");
    if (vi) vi.innerText = "TTS: Fish Audio";
}

window.onload = init;
