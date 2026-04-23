/**
 * Normalize quest dari dua kemungkinan struktur API:
 * 1. Flat  — dari api.discordquest.com
 * 2. Nested — dari Discord API /quests/@me
 */
function normalizeQuest(quest) {
    const cfg = quest.config;

    if (cfg) {
        const taskConfig = cfg.task_config?.tasks || {};
        const taskKeys = Object.keys(taskConfig);
        const tasks = taskKeys.map(k => {
            const t = taskConfig[k];
            return { type: k.toLowerCase(), duration: t.target, description: k };
        });

        const rawRewards = cfg.rewards_config?.rewards || [];
        const rewards = rawRewards.map(r => ({
            type: r.orb_quantity ? 'Orbs' : (r.messages?.name || 'Unknown'),
            amount: r.orb_quantity || null,
            name: r.messages?.name || 'Unknown',
            sku_id: r.sku_id || null,
            icon: r.asset
                ? `https://cdn.discordapp.com/${r.asset.replace(/\.mp4$/, '.png')}`
                : null,
        }));

        return {
            id: quest.id,
            title: cfg.messages?.quest_name || cfg.messages?.game_title || quest.id,
            game: cfg.messages?.game_title || cfg.application?.name || null,
            developer: cfg.messages?.game_publisher || null,
            starts_at: cfg.starts_at || null,
            ends_at: cfg.expires_at || null,
            description: null,
            tasks,
            rewards,
            application_id: cfg.application?.id || null,
            application_name: cfg.application?.name || null,
            banner: cfg.assets?.hero
                ? `https://cdn.discordapp.com/${cfg.assets.hero}`
                : cfg.assets?.quest_bar_hero
                    ? `https://cdn.discordapp.com/${cfg.assets.quest_bar_hero}`
                    : null,
        };
    }

    return quest;
}

function qName(quest) {
    const n = normalizeQuest(quest);
    return n.title || n.name || quest.id || 'Unknown Quest';
}

function qGame(quest) {
    const n = normalizeQuest(quest);
    return n.game || n.game_name || '';
}

function qReward(quest) {
    const n = normalizeQuest(quest);
    return n.rewards?.[0]?.name || 'Unknown Reward';
}

function qStatus(quest) {
    if (quest.user_status?.completed_at) return 'completed';
    if (quest.user_status?.enrolled_at) return 'enrolled';
    return 'idle';
}

function qDesc(quest) {
    return quest.description || normalizeQuest(quest).description || '';
}

function detectTaskType(quest) {
    const tasks = quest.config?.task_config?.tasks || {};
    const priority = ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY'];
    return priority.find(t => tasks[t] != null) || null;
}

function getFlagEmoji(countryCode) {
    const codePoints = countryCode
        .toUpperCase()
        .slice(0, 2)
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

function filterValidQuests(quests) {
    const now = new Date();
    return quests.filter(q => {
        if (!q.config) return false;
        const expired = now.getTime() > new Date(q.config.expires_at).getTime();
        const completed = Boolean(q.user_status?.completed_at);
        return !expired && !completed;
    });
}

function filterActiveQuests(rawQuests) {
    const now = new Date();
    return rawQuests.filter(q => {
        const completed = Boolean(q.user_status?.completed_at);
        const expired = q.config?.expires_at
            ? now.getTime() > new Date(q.config.expires_at).getTime()
            : false;
        return !completed && !expired;
    });
}

module.exports = {
    normalizeQuest,
    qName,
    qGame,
    qReward,
    qStatus,
    qDesc,
    detectTaskType,
    getFlagEmoji,
    filterValidQuests,
    filterActiveQuests,
};
