// ============================================================
// 网易云音乐歌单配置
// ============================================================
const PLAYLIST_ID = "6999135665";

// 👇 你的 MUSIC_U cookie——用于获取歌曲播放地址
//    获取：浏览器登录 music.163.com → F12 → Application → Cookies → MUSIC_U
//    cookie 会过期，若歌曲无法播放请重新获取并更新此处
const MUSIC_U = "00DD89DEBBE44847EBE4ECDB63F9812C9EFB6FB057353F1730A8EFCCC89796FE9D57C4A2AF165E3FD3FB6F7BE5D45B5C5E96A0FFC72D6A29BC834A67017955D2DCDC27F4C36E680C0D266B8546D5DB632E7AAE0444DF9240430E33EB6A9F43FAAA9248108742EC3353BE51A43437408674C312D8AAABDAF413B24FE1458DEAE2196C0A71ECAEB4AC165F0DB77E259718571613C52FE780573F499DFD3B18AAE22186067D0A841EE170CEED1175A2A40E3E5F9B1B5478A5129F31EC7A79E0640D7C90413AB321B68AFFD27B5DDC1B8109257FA4A9E82B4B9B7224325F1702F4B91FBD74B635BB835E5801089521E9346476D59D9D8086BEA2EAA9ED6F706D570DFCA471A56D6647BE0DC33B391472A0E58409AB5E44AB7D605BF71602702023EB0A4573423241FF085BAE15044B79ADA9C8C7295280A77F9CB7F87FE31BB2744A816641D037FF78D644F185CCD567B5E38016C80F2457C407F70A47CC57073465B134F2A73C9469D0289B78BCD905135C2727E852A36263F1162B7639C756160F7DE429B3F58BFE3302F34B53BD553BAC6EC8206A549A4B879DC8A400B8D97A5333";

// ============================================================
// 网易云音乐 API
// ============================================================
const NETEASE_API = "https://netease-cloud-music-api-ochre.vercel.app";
const BATCH_SIZE = 100;

let playlist = { name: "", tracks: [] };
let currentTrackIndex = 0;

// 在 URL 后附加 cookie 参数
function withCookie(path) {
    const sep = path.includes("?") ? "&" : "?";
    return `${NETEASE_API}${path}${sep}cookie=MUSIC_U=${encodeURIComponent(MUSIC_U)}`;
}

// ============================================================
// 渐进式加载歌单（localStorage 缓存 + 首批 80 首快速就绪）
// ============================================================
const INITIAL_BATCH = 80;
const CACHE_KEY = "claudio_playlist_";
const CACHE_HOURS = 6;

function _cacheKey(id) { return CACHE_KEY + id; }

function _getCached(id) {
    try {
        const raw = localStorage.getItem(_cacheKey(id));
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > CACHE_HOURS * 3600 * 1000) {
            localStorage.removeItem(_cacheKey(id));
            return null;
        }
        return data; // { ts, name, tracks: [{id,name,artist,album,duration}] }
    } catch { return null; }
}

function _setCache(id, name, tracks) {
    try {
        localStorage.setItem(_cacheKey(id), JSON.stringify({
            ts: Date.now(), name,
            tracks: tracks.map(t => ({ id: t.id, name: t.name, artist: t.artist, album: t.album, duration: t.duration }))
        }));
    } catch { /* quota exceeded */ }
}

// 仅获取 URL 映射（不拿详情，配合缓存使用）
async function _fetchUrlMap(ids) {
    const idsStr = ids.join(",");
    const urlRes = await fetch(withCookie(`/song/url?id=${idsStr}`));
    const urlData = await urlRes.json();
    const map = {};
    if (urlData.code === 200) {
        urlData.data.forEach(item => { if (item.url) map[item.id] = item.url; });
    }
    return map;
}

async function loadPlaylistQuick(id) {
    setStatus("● Loading playlist...");
    const cached = _getCached(id);

    let allIds, urlMap;

    if (cached) {
        // ── 缓存命中：秒读 metadata，仅刷新 URL ──
        setSubtitle("加载歌单...");
        playlist.name = cached.name;
        // 用缓存构建 tracks（url 先为空）
        playlist.tracks = cached.tracks.map(t => ({ ...t, url: null }));
        allIds = cached.tracks.map(t => t.id);

        // 刷新首批 URL
        urlMap = await _fetchUrlMap(allIds.slice(0, INITIAL_BATCH));
        for (const t of playlist.tracks) {
            if (urlMap[t.id]) t.url = urlMap[t.id];
        }
        playlist.tracks = playlist.tracks.filter(t => t.url);
        console.log(`📋 缓存命中: ${playlist.name}，${playlist.tracks.length}/${allIds.length} 首可播`);
    } else {
        // ── 首次加载：完整 API 获取 ──
        setSubtitle("正在加载歌单...");
        const plRes = await fetch(withCookie(`/playlist/detail?id=${id}`));
        const plData = await plRes.json();
        if (plData.code !== 200 || !plData.playlist) throw new Error("歌单加载失败");

        playlist.name = plData.playlist.name;
        allIds = plData.playlist.trackIds.map(t => t.id);
        if (allIds.length === 0) throw new Error("歌单为空");

        // 首批：完整加载详情+URL
        playlist.tracks = await _loadBatch(allIds.slice(0, INITIAL_BATCH));
        console.log(`📋 首次加载: ${playlist.name}，共 ${allIds.length} 首`);

        // 缓存 metadata（不含 URL）
        _setCache(id, playlist.name, playlist.tracks);
    }

    if (playlist.tracks.length === 0) throw new Error("没有可播放的歌曲，MUSIC_U cookie 可能已过期");

    currentTrackIndex = Math.floor(Math.random() * playlist.tracks.length);
    trackHistory = [currentTrackIndex];

    // 后台加载剩余
    const remaining = allIds.slice(INITIAL_BATCH);
    if (remaining.length > 0) {
        if (cached) {
            _loadRemainingFromCache(remaining);
        } else {
            _loadRemaining(remaining);
        }
    }

    setSubtitle(`歌单就绪 — ${playlist.tracks.length}+ 首`);
    return playlist;
}

async function _loadBatch(ids) {
    const idsStr = ids.join(",");
    const [detailRes, urlRes] = await Promise.all([
        fetch(withCookie(`/song/detail?ids=${idsStr}`)),
        fetch(withCookie(`/song/url?id=${idsStr}`))
    ]);
    const detailData = await detailRes.json();
    const urlData = await urlRes.json();

    const urlMap = {};
    if (urlData.code === 200) {
        urlData.data.forEach(item => { if (item.url) urlMap[item.id] = item.url; });
    }

    const tracks = [];
    if (detailData.code === 200 && detailData.songs) {
        for (const song of detailData.songs) {
            if (urlMap[song.id]) {
                tracks.push({
                    id: song.id, name: song.name,
                    artist: (song.ar || []).map(a => a.name).join(", "),
                    album: (song.al || {}).name || "",
                    duration: song.dt || 0, url: urlMap[song.id]
                });
            }
        }
    }
    return tracks;
}

async function _loadRemaining(allIds) {
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const tracks = await _loadBatch(batch);
        playlist.tracks.push(...tracks);
        renderPlaylist(playlist.tracks);
        console.log(`📥 后台: +${tracks.length} (累计 ${playlist.tracks.length})`);
    }
    // 后台加载完成后更新缓存
    _setCache(PLAYLIST_ID, playlist.name, playlist.tracks);
    console.log(`✅ 全部就绪: ${playlist.tracks.length} 首`);
}

// 缓存命中时的后台加载：仅获取 URL，不重复获取详情
async function _loadRemainingFromCache(allIds) {
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const urlMap = await _fetchUrlMap(batch);
        for (const t of playlist.tracks) {
            if (!t.url && urlMap[t.id]) t.url = urlMap[t.id];
        }
        renderPlaylist(playlist.tracks);
        const withUrl = playlist.tracks.filter(t => t.url).length;
        console.log(`📥 后台URL: +${Object.keys(urlMap).length} (累计可播 ${withUrl})`);
    }
    console.log(`✅ 全部就绪: ${playlist.tracks.filter(t => t.url).length} 首可播`);
}

// ============================================================
// 队列操作（情绪驱动选歌 + 顺序回退）
// ============================================================
let trackHistory = []; // 播放历史栈，用于 prevTrack

function getCurrentTrack() {
    return playlist.tracks[currentTrackIndex] || null;
}

function nextTrack() {
    const mood = getCurrentMood();
    // 情绪选歌，如果歌单太小则顺序播放
    if (playlist.tracks.length > 10) {
        pickTrackForMood(mood);
    } else {
        currentTrackIndex = (currentTrackIndex + 1) % playlist.tracks.length;
    }
    trackHistory.push(currentTrackIndex);
    if (trackHistory.length > 100) trackHistory.shift();
    return getCurrentTrack();
}

function prevTrack() {
    // 从历史栈回溯
    if (trackHistory.length > 1) {
        trackHistory.pop(); // 移除当前
        currentTrackIndex = trackHistory[trackHistory.length - 1];
    } else {
        currentTrackIndex = (currentTrackIndex - 1 + playlist.tracks.length) % playlist.tracks.length;
    }
    return getCurrentTrack();
}

function getPlaylistName() {
    return playlist.name;
}

function getTrackCount() {
    return playlist.tracks.length;
}

// ============================================================
// 歌词获取
// ============================================================
async function fetchLyric(trackId) {
    try {
        const res = await fetch(withCookie(`/lyric?id=${trackId}`));
        const data = await res.json();
        if (data.code === 200) {
            const lrc = (data.lrc && data.lrc.lyric) || "";
            const tlrc = (data.tlyric && data.tlyric.lyric) || "";
            return { lyric: lrc, translated: tlrc };
        }
    } catch (err) {
        console.warn("歌词获取失败:", err);
    }
    return null;
}
