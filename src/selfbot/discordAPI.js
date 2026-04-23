const axios = require('axios');
const { DISCORD_API, CLIENT_PROPERTIES, USER_AGENT } = require('../config');

function getSelfbotHeaders(userToken) {
    return {
        'Authorization': userToken,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'en-US',
        'Origin': 'https://discord.com',
        'Referer': 'https://discord.com/channels/@me',
        'X-Discord-Locale': 'en-US',
        'X-Discord-Timezone': 'Asia/Jakarta',
        'X-Super-Properties': CLIENT_PROPERTIES,
    };
}

async function selfbotGet(userToken, endpoint) {
    const res = await axios.get(`${DISCORD_API}${endpoint}`, {
        headers: getSelfbotHeaders(userToken),
    });
    return res.data;
}

async function selfbotPost(userToken, endpoint, body) {
    const res = await axios.post(`${DISCORD_API}${endpoint}`, body, {
        headers: getSelfbotHeaders(userToken),
    });
    return res.data;
}

async function fetchUserQuests(userToken) {
    const data = await selfbotGet(userToken, '/quests/@me');
    return data.quests || [];
}

async function enrollQuest(userToken, questId) {
    return selfbotPost(userToken, `/quests/${questId}/enroll`, {
        location: 11,
        is_targeted: false,
        metadata_raw: null,
    });
}

async function postVideoProgress(userToken, questId, timestamp) {
    return selfbotPost(userToken, `/quests/${questId}/video-progress`, {
        timestamp: timestamp,
    });
}

async function postHeartbeat(userToken, questId, applicationId, terminal = false) {
    return selfbotPost(userToken, `/quests/${questId}/heartbeat`, {
        application_id: applicationId,
        terminal: terminal,
    });
}

module.exports = {
    getSelfbotHeaders,
    selfbotGet,
    selfbotPost,
    fetchUserQuests,
    enrollQuest,
    postVideoProgress,
    postHeartbeat,
};
