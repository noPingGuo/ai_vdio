// ============================================================
// 旁白引擎 — AI 文本 → 语音+音效 → 拼接播放
// ============================================================

// ── 舞台指示 → 语义意图分类（不依赖关键词列表）──

let _narrationAudio = null;   // 当前播放的旁白 Audio
let _narrationActive = false; // 中断标志

// ============================================================
// 主入口：将含舞台指示的旁白文本变为音频并播放
// ============================================================
async function speakNarration(text) {
    _narrationActive = true;
    const segments = parseSegments(text);

    if (segments.length === 0) return;

    const sampleRate = 44100;

    // 1. 并行生成所有 TTS 语音段
    const ttsTasks = segments.map((seg, i) => {
        if (seg.type === "speech") {
            return generateTTSBuffer(seg.text, sampleRate).then(buf => ({ idx: i, buf }));
        }
        return null;
    });

    const ttsResults = await Promise.all(ttsTasks);
    const audioCtx = new AudioContext({ sampleRate });

    // 2. 组装 buffers（TTS 结果 + 合成音效 + 静音）
    const buffers = [];
    for (let i = 0; i < segments.length; i++) {
        if (!_narrationActive) return; // 用户 skip 中断

        const seg = segments[i];
        if (seg.type === "speech") {
            const result = ttsResults[i];
            if (result && result.buf) {
                buffers.push(result.buf);
            }
        } else if (seg.type === "silence") {
            buffers.push(createSilenceBuffer(audioCtx, seg.duration, sampleRate));
        } else if (seg.type === "vocal") {
            buffers.push(await generateSoundEffect(audioCtx, seg.action, seg.duration, sampleRate));
        }
    }

    if (!_narrationActive) return;

    // 3. 拼接为 WAV blob
    const blob = concatToWavBlob(buffers, sampleRate);
    if (!_narrationActive) return;

    // 4. 播放
    const url = URL.createObjectURL(blob);
    _narrationAudio = new Audio(url);

    // 同步 UI
    _narrationAudio.onplay = () => {
        setStatus("● Speaking...");
        waveActive(true);
        startTimer();
    };

    return new Promise((resolve) => {
        _narrationAudio.onended = () => {
            setStatus("● Finished");
            waveActive(false);
            stopTimer();
            URL.revokeObjectURL(url);
            _narrationAudio = null;
            _narrationActive = false;
            resolve();
        };
        _narrationAudio.onerror = () => {
            URL.revokeObjectURL(url);
            _narrationAudio = null;
            _narrationActive = false;
            resolve();
        };
        _narrationAudio.play().catch(() => resolve());
    });
}

// ── 中断当前旁白 ──
function abortNarration() {
    _narrationActive = false;
    if (_narrationAudio) {
        _narrationAudio.pause();
        _narrationAudio.currentTime = 0;
        _narrationAudio = null;
    }
}

// ── 获取当前旁白 Audio（供 radio.js pause/resume 用）──
function getNarrationAudio() {
    return _narrationAudio;
}

// ============================================================
// 文本解析：括号内容 → 语义意图分类 → segments
// ============================================================
function parseSegments(text) {
    const segments = [];
    const bracketRe = /[（(]([^）)]+)[）)]/g;
    let lastIdx = 0, match;

    while ((match = bracketRe.exec(text)) !== null) {
        const before = text.slice(lastIdx, match.index).trim();
        if (before) segments.push({ type: "speech", text: before });

        const dirText = match[1].trim();

        // 安全过滤 + 语义分类
        if (!shouldIgnoreSegment(dirText)) {
            const norm = normalizeDirection(dirText);
            const intent = classifyIntent(norm);
            const seg = intentToSegment(intent, dirText);
            if (seg) segments.push(seg);
        }
        // 否则：静默丢弃，不朗读，不报错

        lastIdx = bracketRe.lastIndex;
    }

    const after = text.slice(lastIdx).trim();
    if (after) segments.push({ type: "speech", text: after });
    return segments;
}

// ── 安全过滤：明显非指令的内容直接丢弃 ──
function shouldIgnoreSegment(text) {
    if (text.length > 25) return true;              // 过长，不可能是指令
    if (/[，。？?！!]/.test(text)) return true;     // 含标点，是完整句子
    if (/^(这|那|我|你|他|她|它|窗|门|灯|雨|风|月|天|路|车)/.test(text)) return true; // 描述性开头
    return false;
}

// ── 归一化：去修饰，提取核心语义 ──
function normalizeDirection(text) {
    return text
        .replace(/[大概|左右|一下|一点|稍稍|稍微|轻轻地|慢慢地]/g, "")
        .replace(/[的得地]/g, "")
        .trim();
}

// ── 意图分类：返回 { intent: "silence"|"vocal"|"ignore" } ──
function classifyIntent(norm) {
    // TIME 意图：时长词 + 停顿语义
    const hasDuration = /(\d+)\s*[秒秒钟]|[片刻]|[一二三四五]\s*[秒秒]/.test(norm);
    const hasPauseSemantic = /[沉默静默停等待顿]/.test(norm);
    if (hasDuration && hasPauseSemantic) return { intent: "silence" };

    // VOCAL 意图：人声动作词，且非否定/描述语境
    const vocalWords = {
        "深呼吸":  { action: "deepBreath", dur: 2.5 },
        "呼吸":    { action: "breath",     dur: 1.5 },
        "叹气":    { action: "sigh",       dur: 2.0 },
        "叹":      { action: "sigh",       dur: 1.5 },
        "轻笑":    { action: "chuckle",    dur: 1.2 },
        "笑":      { action: "chuckle",    dur: 1.0 },
        "轻哼":    { action: "hum",        dur: 1.0 },
        "哼":      { action: "hum",        dur: 0.8 },
    };
    const hasNegation = /[不是没有别不要不会不能]/.test(norm);

    for (const [word, def] of Object.entries(vocalWords)) {
        if (norm.includes(word) && !hasNegation) {
            return { intent: "vocal", action: def.action, duration: def.dur };
        }
    }

    return { intent: "ignore" };
}

// ── 意图 → segment ──
function intentToSegment(intent, originalText) {
    if (intent.intent === "silence") {
        return { type: "silence", duration: extractDuration(originalText, intent) };
    }
    if (intent.intent === "vocal") {
        return { type: "vocal", action: intent.action, duration: intent.duration };
    }
    return null; // ignore → 丢弃
}

// ── 从文本提取静音时长 ──
function extractDuration(text, _intent) {
    // 匹配 "X秒" 或 中文数字+秒
    const m = text.match(/(\d+)\s*[秒秒]|([一二三四五])\s*[秒秒]|[片刻]/);
    if (m) {
        if (m[1]) return parseFloat(m[1]);
        if (m[2]) return ({ "一":1,"二":2,"三":3,"四":4,"五":5 })[m[2]] || 2;
        if (m[0] === "片刻") return 2;
    }
    // 兜底：根据文本长度估算
    if (text.includes("长")) return 3;
    if (text.includes("短")) return 0.5;
    return 0.8;
}

// ============================================================
// TTS 调用：文本 → AudioBuffer
// ============================================================
async function generateTTSBuffer(text, sampleRate) {
    try {
        const prompt = getTTSPrompt(TTS_STYLE, text);
        const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                voice_id: FISH_VOICE_ID,
                model: "fish-speech-s2",
                prompt,
                temperature: 0.7,
                top_p: 0.9
            })
        });
        if (!res.ok) throw new Error("TTS failed");
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = new AudioContext({ sampleRate });
        return audioCtx.decodeAudioData(arrayBuffer);
    } catch (err) {
        console.warn("TTS segment failed:", err.message);
        return null;
    }
}

// ============================================================
// 音效合成（Web Audio API，无需音频文件）
// ============================================================
function createSilenceBuffer(ctx, duration, sampleRate) {
    const length = Math.ceil(duration * sampleRate);
    return ctx.createBuffer(1, length, sampleRate);
}

async function generateSoundEffect(ctx, action, duration, sampleRate) {
    const len = Math.ceil(duration * sampleRate);
    const offlineCtx = new OfflineAudioContext(1, len, sampleRate);

    switch (action) {
        case "breath":
        case "deepBreath": {
            const noiseBuf = createNoiseBuffer(offlineCtx, len, "pink");
            const src = offlineCtx.createBufferSource();
            src.buffer = noiseBuf;

            const filter = offlineCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.value = action === "deepBreath" ? 600 : 800;

            const gain = offlineCtx.createGain();
            const r = duration;
            gain.gain.setValueAtTime(0, 0);
            gain.gain.linearRampToValueAtTime(0.35, r * 0.2);
            gain.gain.linearRampToValueAtTime(0.35, r * 0.6);
            gain.gain.linearRampToValueAtTime(0, r);

            src.connect(filter); filter.connect(gain); gain.connect(offlineCtx.destination);
            src.start(0);
            return offlineCtx.startRendering();
        }

        case "sigh": {
            const noiseBuf = createNoiseBuffer(offlineCtx, len, "pink");
            const src = offlineCtx.createBufferSource();
            src.buffer = noiseBuf;
            src.playbackRate.value = 0.7; // 降速让声音更低沉

            const filter = offlineCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.value = 400;

            const gain = offlineCtx.createGain();
            const r = duration;
            gain.gain.setValueAtTime(0, 0);
            gain.gain.linearRampToValueAtTime(0.5, r * 0.15);
            gain.gain.linearRampToValueAtTime(0.3, r * 0.5);
            gain.gain.linearRampToValueAtTime(0, r);

            src.connect(filter); filter.connect(gain); gain.connect(offlineCtx.destination);
            src.start(0);
            return offlineCtx.startRendering();
        }

        case "chuckle": {
            // 3 段短促噪声脉冲
            const totalBuf = offlineCtx.createBuffer(1, len, sampleRate);
            const channel = totalBuf.getChannelData(0);
            const burstLen = Math.ceil(0.08 * sampleRate);  // 80ms per burst
            const gapLen = Math.ceil(0.15 * sampleRate);    // 150ms gap

            for (let b = 0; b < 3; b++) {
                const start = b * (burstLen + gapLen);
                for (let i = 0; i < burstLen && start + i < len; i++) {
                    // pink-ish noise with decay
                    const env = 1 - (i / burstLen);
                    channel[start + i] = pinkNoiseSample() * 0.25 * env;
                }
            }
            return totalBuf;
        }

        case "hum": {
            const buf = offlineCtx.createBuffer(1, len, sampleRate);
            const channel = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                const t = i / sampleRate;
                const env = Math.sin((t / duration) * Math.PI); // smooth envelope
                channel[i] = pinkNoiseSample() * 0.2 * env;
            }
            return buf;
        }

        default:
            return createSilenceBuffer(offlineCtx, duration, sampleRate);
    }
}

// ── 噪声生成 ──
function createNoiseBuffer(ctx, length, color) {
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (color === "pink") {
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
        }
    } else {
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
    }
    return buf;
}

// ── 粉噪单采样（用于 chuckle/hum 内联生成）──
let _pinkB0 = 0, _pinkB1 = 0, _pinkB2 = 0;
function pinkNoiseSample() {
    const white = Math.random() * 2 - 1;
    _pinkB0 = 0.99886 * _pinkB0 + white * 0.0555179;
    _pinkB1 = 0.99332 * _pinkB1 + white * 0.0750759;
    _pinkB2 = 0.96900 * _pinkB2 + white * 0.1538520;
    return (_pinkB0 + _pinkB1 + _pinkB2 + white * 0.5362) * 0.11;
}

// ============================================================
// AudioBuffer[] → WAV Blob
// ============================================================
function concatToWavBlob(buffers, sampleRate) {
    let totalLen = 0;
    for (const b of buffers) totalLen += b.length;

    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const b of buffers) {
        combined.set(b.getChannelData(0), offset);
        offset += b.length;
    }

    return float32ToWav(combined, sampleRate);
}

function float32ToWav(samples, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = samples.length * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);

    // WAV header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buf], { type: "audio/wav" });
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
