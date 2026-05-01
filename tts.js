// ============================================================
// Fish TTS 配置
// ============================================================

// 👇 Fish Audio 声音模型 ID（当前为女声，男 DJ 建议更换）
const FISH_VOICE_ID = "faccba1a8ac54016bcfc02761285e67f";

// ============================================================
// 双引擎 TTS（Fish TTS 优先，失败降级 Web Speech API）
// 通过 Vercel /api/tts 代理访问 Fish Audio，解决 CORS
// ============================================================
let ttsAudio = null;
let ttsSource = "Fish";
let fallbackUtterance = null;

function speak(text, onComplete) {
    stopSpeak();

    setStatus("● TTS generating...");
    console.log("🎙 Fish TTS requesting:", text.substring(0, 30) + "...");

    tryFishTTS(text)
        .then(() => {
            if (onComplete) onComplete();
        })
        .catch((err) => {
            console.warn("⚠ Fish TTS 失败，降级到浏览器语音:", err.message);
            ttsSource = "Browser";
            const vi = document.getElementById("voiceName");
            if (vi) vi.innerText = "TTS: Browser (fallback)";
            speakWithBrowserFallback(text, onComplete);
        });
}

// ── Fish TTS（通过 Vercel 代理）──
function tryFishTTS(text) {
    return new Promise((resolve, reject) => {
        fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                voice_id: FISH_VOICE_ID
            })
        })
        .then(async (response) => {
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${response.status}`);
            }
            return response.blob();
        })
        .then((audioBlob) => {
            if (audioBlob.size < 100) {
                throw new Error("Fish TTS 返回数据过短");
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            ttsAudio = new Audio(audioUrl);
            ttsSource = "Fish";

            const vi = document.getElementById("voiceName");
            if (vi) vi.innerText = "TTS: Fish Audio";

            ttsAudio.onplay = () => {
                setStatus("● Speaking...");
                waveActive(true);
                startTimer();
            };

            ttsAudio.onended = () => {
                setStatus("● Finished");
                waveActive(false);
                stopTimer();
                URL.revokeObjectURL(audioUrl);
                ttsAudio = null;
                resolve();
            };

            ttsAudio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                ttsAudio = null;
                reject(new Error("音频播放失败"));
            };

            ttsAudio.play().catch((err) => {
                reject(new Error(`播放被阻止: ${err.message}`));
            });
        })
        .catch(reject);
    });
}

// ── 浏览器语音降级 ──
function speakWithBrowserFallback(text, onComplete) {
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();

    fallbackUtterance = new SpeechSynthesisUtterance(text);
    fallbackUtterance.rate = 0.95;
    fallbackUtterance.pitch = 1;
    fallbackUtterance.volume = 1;

    const voices = synth.getVoices();
    const zhVoice = voices.find(v => v.lang.includes("zh"))
                 || voices.find(v => v.lang.includes("en"));
    if (zhVoice) fallbackUtterance.voice = zhVoice;

    fallbackUtterance.onstart = () => {
        setStatus("● Speaking...");
        waveActive(true);
        startTimer();
    };

    fallbackUtterance.onend = () => {
        setStatus("● Finished");
        waveActive(false);
        stopTimer();
        fallbackUtterance = null;
        if (onComplete) onComplete();
    };

    fallbackUtterance.onerror = () => {
        console.error("浏览器语音也失败了");
        setStatus("● TTS Error");
        waveActive(false);
        stopTimer();
        fallbackUtterance = null;
        if (onComplete) onComplete();
    };

    synth.speak(fallbackUtterance);
}

function stopSpeak() {
    if (ttsAudio) {
        ttsAudio.pause();
        ttsAudio.currentTime = 0;
        ttsAudio = null;
    }
    if (fallbackUtterance) {
        window.speechSynthesis.cancel();
        fallbackUtterance = null;
    }
    setStatus("● Paused");
    waveActive(false);
    stopTimer();
}
