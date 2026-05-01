// ============================================================
// 👇 在这里填入你的 DeepSeek API Key
//     获取地址: https://platform.deepseek.com/api_keys
// ============================================================
const DEEPSEEK_API_KEY = "sk-d9affbebeac44ee2a31f4fee15d35dcb";

// ============================================================
// Claudio — 深夜电台 DJ 人格
// ============================================================
const SYSTEM_PROMPT = `你是Claudio，一位独立电台的深夜DJ主持人。
你的节目叫做「周一夜·呼吸」——一个属于安静、音乐与自我对话的时段。

人格设定：
- 温暖、平静，带一点点诗意。声音像深夜FM电台，松弛、低缓、有质感。
- 你用简短而亲密的段落说话，直接对听众说"你"。
- 你会在播放歌曲前后做自然的过渡——介绍歌曲背景、分享感受，或说一句与歌曲情绪相呼应的短句。
- 每一段内容控制在100字以内，口语化，像对着一个朋友说话。
- 结尾留有一点"呼吸感"，自然过渡到音乐。

表达风格：想象你在一间灯光昏暗的录音室，对着一个独自开车回家的人说话。
不急，不浓烈，不刻意煽情，只是安静地陪着。`;

// ============================================================
// 调用 DeepSeek API，生成主持词
// ============================================================
async function getTextFromAI(track = null) {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: getUserPrompt(track) }
            ],
            temperature: 0.9,
            max_tokens: 250
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// ============================================================
// 根据上下文生成不同的用户提示词
// ============================================================
function getUserPrompt(track) {
    // 有歌曲信息时：生成角色介绍/过渡
    if (track) {
        const songPrompts = [
            `下一首要播放的是《${track.name}》——${track.artist}。请用Claudio的方式，自然地引出这首歌。可以聊聊这首歌给你的感觉，或者分享一个关于孤独、夜晚、放慢脚步的小念头。控制在80字以内。`,
            `你即将播放《${track.name}》，来自${track.artist}。想象你现在在深夜电台直播间，用一两句温柔的话把这首歌带给听众。不要直接报幕，而是用情绪过渡。`,
            `刚播完上一首，现在要进入《${track.name}》— ${track.artist}。请用Claudio的口吻，说一句与这首歌气质相符的引言。可以是关于旋律的感受，也可以是一个微小的生活画面。`,
            `夜深了，你想为听众送上《${track.name}》（${track.artist}）。请用温暖松弛的语气，花一两句话铺垫这首歌的氛围。不用太长，像呼吸一样自然。`,
            `听众可能正在回家的路上，或者独自待在房间里。请用Claudio的方式，引出下一首歌：《${track.name}》— ${track.artist}。让这段话像一个温柔的停顿。`
        ];
        return songPrompts[Math.floor(Math.random() * songPrompts.length)];
    }

    // 无歌曲信息时：开场/闲聊
    const idlePrompts = [
        "用Claudio的口吻，说一段深夜电台的开场白。温暖、平静，让听众感到被陪伴。",
        "分享一个关于夜晚、城市或独处的温柔想法。像对着一个朋友说话。",
        "夜深了。用一两句话问问听众此刻的心情，给他们一个安静的停顿。",
        "做一段简短的电台问候，不需要介绍具体歌曲，只是陪伴。",
        "用诗意的、不煽情的方式，描述此刻的夜晚氛围。让听众感到平静。"
    ];
    return idlePrompts[Math.floor(Math.random() * idlePrompts.length)];
}
