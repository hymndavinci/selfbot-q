const { fetchUserQuests, enrollQuest, getSelfbotHeaders, selfbotGet, selfbotPost, postVideoProgress, postHeartbeat } = require('./discordAPI');
const { doVideoQuest, doPlayQuest, runAutoComplete } = require('./autoComplete');

module.exports = {
    // Discord API functions
    fetchUserQuests,
    enrollQuest,
    getSelfbotHeaders,
    selfbotGet,
    selfbotPost,
    postVideoProgress,
    postHeartbeat,
    
    // Auto-complete functions
    doVideoQuest,
    doPlayQuest,
    runAutoComplete,
};
