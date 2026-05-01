// ============================================================
// AI 电台入口
// ============================================================

// 播放 / 停止切换
async function toggleAudio() {
    if (radioActive) {
        stopRadio();
    } else {
        // 如果歌单还没加载，等待加载
        if (playlist.tracks.length === 0) {
            setStatus("● Loading playlist...");
            try {
                await loadPlaylist(PLAYLIST_ID);
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
}

// ── 初始化 ──
function init() {
    showVoiceInfo();
    setStatus("● Ready");
}

function showVoiceInfo() {
    console.log("🎙 TTS: Fish Audio");
    console.log("   Voice ID:", FISH_VOICE_ID);
    const vi = document.getElementById("voiceName");
    if (vi) vi.innerText = "TTS: Fish Audio";
}

window.onload = init;
