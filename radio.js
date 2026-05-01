// ============================================================
// 电台总调度 — AI 旁白 → 音乐 → AI 旁白 → 音乐 → 循环
// ============================================================
let radioActive = false;

async function startRadio() {
    if (radioActive) return;
    radioActive = true;
    updatePlayBtn(true);

    while (radioActive) {
        const track = getCurrentTrack();
        if (!track) {
            setStatus("● No tracks");
            break;
        }

        // ── 第 1 步：AI 生成旁白 ──
        setStatus("● AI thinking...");
        setSubtitle("Claudio 正在酝酿...");
        waveActive(false);

        try {
            const narration = await getTextFromAI(track);
            setSubtitle(narration);
            setSongInfo(track.name, track.artist);
            highlightTrack(currentTrackIndex);

            // ── 第 2 步：TTS 朗读旁白 ──
            setStatus("● Speaking...");
            await speakAsync(narration);

            if (!radioActive) break; // 用户在旁白期间停止了

            // ── 第 3 步：播放音乐 ──
            setStatus("● Now Playing...");
            setSubtitle(`${track.name} — ${track.artist}`);
            waveActive(true);

            await playMusic(track.url);

            if (!radioActive) break;

            // ── 第 4 步：音乐结束后短暂停顿，进入下一轮 ──
            waveActive(false);
            nextTrack();

        } catch (err) {
            console.error("电台循环出错:", err);
            setStatus("● Error");
            setSubtitle("出现错误，请重试。（检查 API Key 或网络连接）");
            break;
        }
    }

    radioActive = false;
    updatePlayBtn(false);
    waveActive(false);
    setStatus("● Ready");
}

function stopRadio() {
    radioActive = false;
    stopSpeak();
    stopMusic();
    waveActive(false);
    setStatus("● Stopped");
    updatePlayBtn(false);
}

// ── 辅助：将 TTS 包装为 Promise ──
function speakAsync(text) {
    return new Promise((resolve) => {
        speak(text, resolve);
    });
}

// ── 播放/停止按钮切换 ──
function updatePlayBtn(active) {
    const btn = document.getElementById("playBtn");
    if (btn) btn.textContent = active ? "⏸" : "▶";
}
