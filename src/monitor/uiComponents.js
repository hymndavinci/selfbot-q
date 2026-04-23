const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { generateQuestCardImage } = require('../canvas/renderer');
const { detectTaskType, getFlagEmoji, filterActiveQuests } = require('../utils/questHelpers');
const { enrollQuest } = require('../selfbot');
const { SPEED_CONFIG } = require('../config');

function buildQuestActionRow(quest, userId, disabled = false) {
    const { state } = require('../core/state');
    const qid = quest.id;
    const session = state.monitorSessions.get(userId + '_' + qid);
    const isRunning = Boolean(session);
    const completed = Boolean(quest.user_status?.completed_at);
    const enrolled = Boolean(quest.user_status?.enrolled_at);
    const taskType = detectTaskType(quest);
    const unsupported = !taskType || taskType === 'STREAM_ON_DESKTOP' || taskType === 'PLAY_ACTIVITY';

    const row = new ActionRowBuilder();

    // Compact buttons - Start/Monitor
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`qstart_${qid}`)
            .setLabel(isRunning ? 'Monitor' : 'Start')
            .setStyle(isRunning ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(disabled || completed || isRunning || unsupported),
        new ButtonBuilder()
            .setCustomId(`qstop_${qid}`)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled || !isRunning),
        // Speed buttons - compact
        new ButtonBuilder()
            .setCustomId(`qspeed_normal_${qid}`)
            .setLabel('Normal')
            .setStyle(session?.speed === 'normal' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || completed || unsupported),
        new ButtonBuilder()
            .setCustomId(`qspeed_fast_${qid}`)
            .setLabel('Fast')
            .setStyle(session?.speed === 'fast' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || completed || unsupported),
        // Enroll button
        new ButtonBuilder()
            .setCustomId(`qenroll_${qid}`)
            .setLabel('Enroll')
            .setStyle(enrolled ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || enrolled || completed)
    );

    return row;
}

function buildPaginationRow(userId, currentPage, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`qpage_prev_${userId}`)
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`qpage_info_${userId}`)
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`qpage_next_${userId}`)
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`qrefresh_${userId}`)
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildQuestSelectMenu(quests, userId, currentQuestId) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`qselect_${userId}`)
        .setPlaceholder('🔽 Select Orb Quest')
        .setMinValues(1)
        .setMaxValues(1);

    // Build options from quests (limit to 25 due to Discord limit)
    const options = quests.slice(0, 25).map((quest, index) => {
        const cfg = quest.config;
        const reward = cfg?.rewards_config?.rewards?.[0];
        const orbQty = reward?.orb_quantity || 0;
        const rewardText = orbQty > 0 ? `${orbQty} Orbs` : 'Reward';
        const questName = cfg?.messages?.quest_name || quest.id;
        const gameName = cfg?.messages?.game_title || 'Unknown';

        // Determine status emoji
        let statusEmoji = '⚪';
        const { state } = require('../core/state');
        const completed = Boolean(quest.user_status?.completed_at);
        const enrolled = Boolean(quest.user_status?.enrolled_at);
        const session = state.monitorSessions.get(userId + '_' + quest.id);

        if (completed) statusEmoji = '✅';
        else if (session) statusEmoji = '🟢';
        else if (enrolled) statusEmoji = '🔵';

        return new StringSelectMenuOptionBuilder()
            .setLabel(`${statusEmoji} ${questName.slice(0, 50)}`)
            .setDescription(`${gameName.slice(0, 30)} • ${rewardText}`)
            .setValue(quest.id)
            .setDefault(quest.id === currentQuestId);
    });

    selectMenu.addOptions(options);
    return new ActionRowBuilder().addComponents(selectMenu);
}

module.exports = {
    buildQuestActionRow,
    buildPaginationRow,
    buildQuestSelectMenu,
};
