const { EmbedBuilder } = require('discord.js');
const { generateQuestCardImage } = require('../canvas/renderer');
const { detectTaskType } = require('../utils/questHelpers');
const { enrollQuest } = require('../selfbot');
const { SPEED_CONFIG } = require('../config');

async function buildQuestEmbedMonitor(quest, userId, page = 0, total = 1, allQuests = []) {
    const { state } = require('../core/state');
    const cfg = quest.config;
    const taskType = detectTaskType(quest);
    const session = state.monitorSessions.get(userId + '_' + quest.id);
    const isRunning = Boolean(session);
    const enrolled = Boolean(quest.user_status?.enrolled_at);
    const completed = Boolean(quest.user_status?.completed_at);

    // Progress
    let prog = 0, target = 0, pct = 0;
    if (taskType && quest.user_status?.progress?.[taskType]) {
        prog = quest.user_status.progress[taskType].value ?? 0;
        target = cfg?.task_config?.tasks?.[taskType]?.target ?? 0;
        pct = target > 0 ? Math.floor((prog / target) * 100) : 0;
    }

    // Generate quest card image with allQuests for counter display
    let questCardBuffer = null;
    try {
        questCardBuffer = await generateQuestCardImage(quest, session, allQuests);
    } catch (e) {
        console.error('Failed to generate quest card:', e.message);
    }

    // Color based on status
    let embedColor = 0x8b5cf6; // Purple default
    if (completed) embedColor = 0x22c55e; // Green
    else if (isRunning) embedColor = 0x22c55e; // Green
    else if (enrolled) embedColor = 0x06b6d4; // Cyan

    // Build minimal embed
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setFooter({ text: `Quest ${page + 1}/${total}` });

    // If we have quest card image, attach it
    if (questCardBuffer) {
        embed.setImage('attachment://quest_card.png');
    } else {
        // Fallback to text description
        const reward = cfg?.rewards_config?.rewards?.[0];
        const orbQty = reward?.orb_quantity || 0;
        const rewardText = orbQty > 0 ? `${orbQty} Orbs` : (reward?.messages?.name || 'Unknown');
        
        let statusBadge;
        if (completed) statusBadge = '✅ Completed';
        else if (isRunning) statusBadge = `🟢 Running (${session.speed.toUpperCase()})`;
        else if (enrolled) statusBadge = '⚪ Enrolled';
        else statusBadge = '🔴 Not Enrolled';

        const barLength = 10;
        const filled = Math.round(pct / (100 / barLength));
        const empty = barLength - filled;
        const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
        const progMin = Math.floor(prog / 60);
        const targetMin = Math.ceil(target / 60);

        const description = `${statusBadge}\n` +
            `🎁 ${rewardText} • 📋 ${taskType?.replace(/_/g, ' ') || 'Manual'}\n\n` +
            `${progressBar} **${pct}%** (${progMin}/${targetMin} min)`;

        embed.setTitle(cfg?.messages?.quest_name || quest.id)
             .setDescription(description);
    }

    return { embed, questCardBuffer };
}

async function startMonitor(userId, quest, speed = 'normal') {
    const { state } = require('../core/state');
    const key = userId + '_' + quest.id;
    if (state.monitorSessions.has(key)) return; // sudah running

    const userToken = state.userTokens.get(userId);
    if (!userToken) return;

    const taskType = detectTaskType(quest);
    if (!taskType || taskType === 'STREAM_ON_DESKTOP' || taskType === 'PLAY_ACTIVITY') return;

    const cfg = SPEED_CONFIG[speed] || SPEED_CONFIG.normal;
    const session = { questId: quest.id, speed, stopped: false, quest };
    state.monitorSessions.set(key, session);

    // Enroll kalau belum
    if (!quest.user_status?.enrolled_at) {
        try {
            const res = await enrollQuest(userToken, quest.id);
            quest.user_status = res;
        } catch (e) {
            state.monitorSessions.delete(key);
            return;
        }
    }

    // Start monitoring loop
    const { runMonitorLoop } = require('./monitorLoop');
    runMonitorLoop(userId, quest, session, userToken);
}

module.exports = {
    buildQuestEmbedMonitor,
    startMonitor,
};
