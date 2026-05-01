// ============================================================
// Fish TTS 配置
// ============================================================
const FISH_API_KEY = "4f9f7af7c749428f98de8fa74528779f";
const FISH_VOICE_ID = "faccba1a8ac54016bcfc02761285e67f";

// ── 电台风格 ──
const TTS_STYLE = "male"; // "male" = 深夜男主播 | "female" = 温柔女主播

// ============================================================
// 双引擎 TTS（Fish Speech S2 优先，失败降级 Web Speech API）
// ============================================================
let ttsAudio = null;
let ttsSource = "Fish";
let fallbackUtterance = null;

function speak(text, onComplete) {
    stopSpeak();
    setStatus("● TTS generating...");

    const processed = preprocessText(text);
    console.log("🎙 Fish TTS requesting:", processed.substring(0, 30) + "...");

    tryFishTTS(processed, text)
        .then(() => { if (onComplete) onComplete(); })
        .catch((err) => {
            console.warn("⚠ Fish TTS 失败，降级到浏览器语音:", err.message);
            ttsSource = "Browser";
            const vi = document.getElementById("voiceName");
            if (vi) vi.innerText = "TTS: Browser (fallback)";
            speakWithBrowserFallback(text, onComplete);
        });
}

// ── Fish Speech S2 ──
function tryFishTTS(processedText, _original) {
    return new Promise((resolve, reject) => {
        const prompt = getTTSPrompt(TTS_STYLE, processedText);

        console.log("🎙 TTS Model:", "fish-speech-s2");
        console.log("🎙 Style:", TTS_STYLE);
        console.log("🎙 Prompt:", prompt.substring(0, 60));

        fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: processedText,
                voice_id: FISH_VOICE_ID,
                model: "fish-speech-s2",
                prompt: prompt,
                temperature: 0.7,
                top_p: 0.9
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
            if (audioBlob.size < 100) throw new Error("Fish TTS 返回数据过短");
            const audioUrl = URL.createObjectURL(audioBlob);
            ttsAudio = new Audio(audioUrl);
            ttsSource = "Fish";

            const vi = document.getElementById("voiceName");
            if (vi) vi.innerText = "TTS: Fish S2";

            ttsAudio.onplay = () => { setStatus("● Speaking..."); waveActive(true); startTimer(); };
            ttsAudio.onended = () => {
                setStatus("● Finished"); waveActive(false); stopTimer();
                URL.revokeObjectURL(audioUrl); ttsAudio = null; resolve();
            };
            ttsAudio.onerror = () => { URL.revokeObjectURL(audioUrl); ttsAudio = null; reject(new Error("音频播放失败")); };
            ttsAudio.play().catch((err) => reject(new Error(`播放被阻止: ${err.message}`)));
        })
        .catch(reject);
    });
}

// ── 浏览器语音降级 ──
function speakWithBrowserFallback(text, onComplete) {
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    fallbackUtterance = new SpeechSynthesisUtterance(text);
    fallbackUtterance.rate = 0.95; fallbackUtterance.pitch = 1; fallbackUtterance.volume = 1;
    const voices = synth.getVoices();
    const zhVoice = voices.find(v => v.lang.includes("zh")) || voices.find(v => v.lang.includes("en"));
    if (zhVoice) fallbackUtterance.voice = zhVoice;
    fallbackUtterance.onstart = () => { setStatus("● Speaking..."); waveActive(true); startTimer(); };
    fallbackUtterance.onend = () => {
        setStatus("● Finished"); waveActive(false); stopTimer();
        fallbackUtterance = null; if (onComplete) onComplete();
    };
    fallbackUtterance.onerror = () => { setStatus("● TTS Error"); waveActive(false); stopTimer(); fallbackUtterance = null; if (onComplete) onComplete(); };
    synth.speak(fallbackUtterance);
}

function stopSpeak() {
    if (ttsAudio) { ttsAudio.pause(); ttsAudio.currentTime = 0; ttsAudio = null; }
    if (fallbackUtterance) { window.speechSynthesis.cancel(); fallbackUtterance = null; }
    setStatus("● Paused"); waveActive(false); stopTimer();
}

// ============================================================
// 电台风格 prompt
// ============================================================
function getTTSPrompt(style, _text) {
    if (style === "male") {
        return "你是一名深夜电台男主播，请用低沉、贴近耳边、略带气声的方式朗读文本。语速偏慢，语气平稳但有情绪，像在凌晨对一个人说话。加入自然停顿和轻微呼吸感，避免机械朗读。风格：late night, calm, whisper, emotional";
    }
    // female
    return "你是一名温柔的夜间电台女主播，请用轻柔、温暖、治愈的语气朗读文本。语速稍慢，声音亲近自然，像在陪伴一个人入睡。句尾轻柔收音，避免播音腔。风格：soft, warm, gentle, bedtime";
}

// ============================================================
// 文本预处理 — 增强 TTS 自然度
// ============================================================
function preprocessText(text) {
    let t = text;

    // 标点替换为自然停顿
    t = t.replace(/。/g, "... ");
    t = t.replace(/，/g, ", ");
    t = t.replace(/？/g, "? ");
    t = t.replace(/！/g, "! ");

    // 短句增强（独立短词 → 带尾音）
    t = t.replace(/\b晚安\b/g, "晚安…");
    t = t.replace(/\b你好\b/g, "你好呀…");
    t = t.replace(/\b嗯\b/g, "嗯…");
    t = t.replace(/\b好\b/g, "好…");

    // 超过 40 字自动插入换行（引导 TTS 停顿）
    if (t.length > 40 && !t.includes("\n")) {
        const mid = Math.floor(t.length / 2);
        const commaIdx = t.indexOf(",", mid - 8);
        if (commaIdx > 0 && commaIdx < mid + 8) {
            t = t.slice(0, commaIdx + 2) + "\n" + t.slice(commaIdx + 2);
        }
    }

    return t.trim();
}
