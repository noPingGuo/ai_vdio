// Vercel Serverless Function — 代理 TTS 请求到 Fish Audio
const { encode } = require("@msgpack/msgpack");

module.exports = async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { text, voice_id } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const payload = encode({
        text: text,
        reference_id: voice_id,
        format: "mp3",
        normalize: true,
        latency: "normal"
    });

    try {
        const fishRes = await fetch("https://api.fish.audio/v1/tts", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.FISH_API_KEY}`,
                "Content-Type": "application/msgpack"
            },
            body: Buffer.from(payload)
        });

        if (!fishRes.ok) {
            const errText = await fishRes.text();
            console.error("Fish TTS error:", fishRes.status, errText);
            return res.status(fishRes.status).json({ error: "Fish TTS failed", detail: errText });
        }

        const audioBuffer = await fishRes.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", audioBuffer.byteLength);
        res.send(Buffer.from(audioBuffer));
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).json({ error: "Proxy error", detail: err.message });
    }
};
