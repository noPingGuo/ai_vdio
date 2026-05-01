// Vercel Serverless Function — 代理 TTS 请求到 Fish Audio
const { encode } = require("@msgpack/msgpack");
const https = require("https");

module.exports = async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.status(200);
        return res.end();
    }

    // GET = 调试：检查环境变量和连接状态
    if (req.method === "GET") {
        const hasKey = !!process.env.FISH_API_KEY;
        res.status(200);
        return res.end(JSON.stringify({
            status: "ok",
            fishApiKeySet: hasKey,
            fishApiKeyLength: (process.env.FISH_API_KEY || "").length
        }));
    }

    if (req.method !== "POST") {
        res.status(405);
        return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const { text, voice_id } = req.body;
    if (!text) {
        res.status(400);
        return res.end(JSON.stringify({ error: "Missing text" }));
    }

    // MessagePack 编码
    let payload;
    try {
        payload = encode({
            text: text,
            reference_id: voice_id,
            format: "mp3",
            normalize: true,
            latency: "normal"
        });
    } catch (err) {
        res.status(500);
        return res.end(JSON.stringify({ error: "msgpack encode failed", detail: err.message }));
    }

    // 调用 Fish Audio API（使用原生 https 模块，不依赖 fetch）
    try {
        const result = await callFishAPI(payload);

        if (result.error) {
            res.status(result.status);
            return res.end(JSON.stringify({ error: result.error, detail: result.detail }));
        }

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", result.data.length);
        res.end(result.data);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500);
        res.end(JSON.stringify({ error: "Proxy error", detail: err.message }));
    }
};

// ── 使用原生 https 发送请求 ──
function callFishAPI(payload) {
    return new Promise((resolve) => {
        const options = {
            hostname: "api.fish.audio",
            path: "/v1/tts",
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.FISH_API_KEY || ""}`,
                "Content-Type": "application/msgpack",
                "Content-Length": payload.length
            },
            timeout: 25000
        };

        const hReq = https.request(options, (fishRes) => {
            const chunks = [];
            fishRes.on("data", (chunk) => chunks.push(chunk));
            fishRes.on("end", () => {
                const data = Buffer.concat(chunks);
                if (fishRes.statusCode === 200) {
                    resolve({ data });
                } else {
                    resolve({
                        error: "Fish TTS failed",
                        status: fishRes.statusCode,
                        detail: data.toString().substring(0, 300)
                    });
                }
            });
        });

        hReq.on("error", (err) => {
            resolve({ error: "Network error", status: 502, detail: err.message });
        });

        hReq.on("timeout", () => {
            hReq.destroy();
            resolve({ error: "Timeout", status: 504, detail: "Fish API timed out" });
        });

        hReq.write(payload);
        hReq.end();
    });
}
