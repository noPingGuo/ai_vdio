// ============================================================
// 情绪引擎 — 根据时间段自动调整电台氛围
// ============================================================

const TIME_PERIODS = {
    morning:     { start: 6,  end: 10 },
    lateMorning: { start: 10, end: 12 },
    afternoon:   { start: 12, end: 17 },
    evening:     { start: 17, end: 21 },
    night:       { start: 21, end: 24 },
    lateNight:   { start: 0,  end: 6  }
};

const MOODS = {
    morning: {
        id: "morning",
        name: "清晨·苏醒",
        emoji: "🌅",
        color: "#f0a060",
        greeting: "早安。新的一天开始了。",
        tone: "gentle and slowly waking, soft morning light",
        tempo: "slow-to-mid, gradually building",
        keywords: ["soft","gentle","acoustic","morning","light","rise","new","calm","wake","dreamy","quiet","slow","warm","breeze","sun","piano","folk","dawn","peaceful","still"]
    },
    lateMorning: {
        id: "lateMorning",
        name: "上午·专注",
        emoji: "☀️",
        color: "#e8b440",
        greeting: "上午好。阳光正好。",
        tone: "energetic but not frantic, clear-minded focus",
        tempo: "mid-to-upbeat, bright",
        keywords: ["energy","bright","up","dance","pop","happy","fun","love","sun","light","shine","good","day","feel","alive","move","beat","smile","summer","joy"]
    },
    afternoon: {
        id: "afternoon",
        name: "午后·慵懒",
        emoji: "🌤",
        color: "#d4956b",
        greeting: "午后了。阳光开始变软。",
        tone: "warm and nostalgic, comfortable drowsiness",
        tempo: "mid-tempo, warm and soulful",
        keywords: ["warm","soft","afternoon","nostalgia","chill","soul","breeze","lazy","dream","slow","gentle","golden","memory","old","time","blue","river","wind","rain","coffee"]
    },
    evening: {
        id: "evening",
        name: "傍晚·过渡",
        emoji: "🌆",
        color: "#c06850",
        greeting: "天快黑了。一天要收尾了。",
        tone: "reflective and unwinding, the day settling",
        tempo: "relaxed, soulful, reflective",
        keywords: ["evening","sunset","reflection","soul","chill","relax","wind","home","return","warm","night","day","end","rest","peace","twilight","goodbye","shadow","still","calm"]
    },
    night: {
        id: "night",
        name: "深夜·呼吸",
        emoji: "🌙",
        color: "#7b8cce",
        greeting: "夜深了。",
        tone: "intimate and quiet, breathing slowly in the dark",
        tempo: "slow, intimate, minimal",
        keywords: ["night","moon","star","quiet","slow","deep","dream","intimate","alone","dark","sleep","still","silence","midnight","blue","cold","whisper","shadow","breathe","drift"]
    },
    lateNight: {
        id: "lateNight",
        name: "凌晨·独处",
        emoji: "🦉",
        color: "#5b6abf",
        greeting: "凌晨了。你还没睡？",
        tone: "almost a whisper, dreamy and existential",
        tempo: "minimal, ambient, weightless",
        keywords: ["midnight","silence","dream","alone","quiet","dark","star","empty","sleep","still","cold","deep","lost","ghost","space","drift","float","far","night","blue"]
    }
};

// ── 获取当前时间段 ──
function getTimePeriod() {
    const hour = new Date().getHours();
    for (const [key, range] of Object.entries(TIME_PERIODS)) {
        if (range.start < range.end) {
            if (hour >= range.start && hour < range.end) return key;
        } else {
            // 跨午夜：lateNight 0-6
            if (hour >= range.start || hour < range.end) return key;
        }
    }
    return "night"; // fallback
}

// ── 获取当前情绪配置 ──
function getCurrentMood() {
    return MOODS[getTimePeriod()];
}

// ── 根据情绪从歌单中选歌 ──
function pickTrackForMood(mood, recentCount = 80) {
    if (!playlist.tracks.length) return null;

    const total = playlist.tracks.length;
    const recent = new Set();

    // 避免最近播放过的（至少保留 10 首可选，避免小歌单全排除）
    const lookback = Math.min(recentCount, total - 10);
    for (let i = 1; i <= lookback; i++) {
        recent.add((currentTrackIndex - i + total) % total);
    }

    // 为每首歌打分
    const keywords = mood.keywords;
    const scored = playlist.tracks.map((track, idx) => {
        if (recent.has(idx)) return { idx, score: -999 };

        const text = (track.name + " " + track.artist + " " + track.album).toLowerCase();
        let score = 0;
        for (const kw of keywords) {
            if (text.includes(kw)) score += 1;
        }
        // 加入随机因子，保证不会每次都一样
        score += Math.random() * 2.5;
        return { idx, score };
    });

    // 按分数排序，从前 25% 中随机选
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.max(8, Math.floor(scored.length * 0.25));
    const pick = scored[Math.floor(Math.random() * topN)];

    const prevIndex = currentTrackIndex;
    currentTrackIndex = pick.idx;

    console.log(`🎭 情绪选歌 [${mood.name}]: ${playlist.tracks[pick.idx].name} — ${playlist.tracks[pick.idx].artist} (score: ${pick.score.toFixed(1)})`);
    return getCurrentTrack();
}

// ── 检测时间段是否变化 ──
let lastPeriod = null;
function periodChanged() {
    const current = getTimePeriod();
    if (current !== lastPeriod) {
        lastPeriod = current;
        return true;
    }
    return false;
}

function resetPeriodTracking() {
    lastPeriod = getTimePeriod();
}
