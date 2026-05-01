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
// 加载歌单（分批获取详情 + 播放 URL）
// ============================================================
async function loadPlaylist(id) {
    setStatus("● Loading playlist...");
    setSubtitle("正在加载歌单...");

    // 1. 获取歌单基本信息和所有 trackIds
    const plRes = await fetch(withCookie(`/playlist/detail?id=${id}`));
    const plData = await plRes.json();

    if (plData.code !== 200 || !plData.playlist) {
        throw new Error("歌单加载失败，请检查歌单 ID");
    }

    playlist.name = plData.playlist.name;
    const allIds = plData.playlist.trackIds.map(t => t.id);

    if (allIds.length === 0) throw new Error("歌单为空");

    console.log(`📋 歌单: ${playlist.name}，共 ${allIds.length} 首`);

    // 2. 分批获取歌曲详情 + 播放 URL
    const allTracks = [];
    const totalBatches = Math.ceil(allIds.length / BATCH_SIZE);

    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const idsStr = batch.join(",");
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        setSubtitle(`正在加载歌单... (${batchNum}/${totalBatches})`);

        const [detailRes, urlRes] = await Promise.all([
            fetch(withCookie(`/song/detail?ids=${idsStr}`)),
            fetch(withCookie(`/song/url?id=${idsStr}`))
        ]);

        const detailData = await detailRes.json();
        const urlData = await urlRes.json();

        const urlMap = {};
        if (urlData.code === 200) {
            urlData.data.forEach(item => {
                if (item.url) urlMap[item.id] = item.url;
            });
        }

        if (detailData.code === 200 && detailData.songs) {
            for (const song of detailData.songs) {
                if (urlMap[song.id]) {
                    allTracks.push({
                        id: song.id,
                        name: song.name,
                        artist: (song.ar || []).map(a => a.name).join(", "),
                        album: (song.al || {}).name || "",
                        duration: song.dt || 0,
                        url: urlMap[song.id]
                    });
                }
            }
        }
    }

    playlist.tracks = allTracks;

    if (playlist.tracks.length === 0) {
        throw new Error("歌单中没有可播放的歌曲，MUSIC_U cookie 可能已过期");
    }

    console.log(`✅ 就绪: ${playlist.tracks.length} 首可播放`);
    setSubtitle(`歌单就绪 — ${playlist.tracks.length} 首`);
    return playlist;
}

// ============================================================
// 队列操作
// ============================================================
function getCurrentTrack() {
    return playlist.tracks[currentTrackIndex] || null;
}

function nextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.tracks.length;
    return getCurrentTrack();
}

function getPlaylistName() {
    return playlist.name;
}

function getTrackCount() {
    return playlist.tracks.length;
}
