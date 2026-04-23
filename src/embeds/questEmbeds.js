const { EmbedBuilder } = require('discord.js');
const { normalizeQuest, qName, qGame, qReward, qStatus, qDesc } = require('../utils/questHelpers');

function buildQuestEmbed(questRaw, type = 'default') {
    const quest = normalizeQuest(questRaw);
    const embed = new EmbedBuilder();
    const colors = { default: 0x5865F2, new: 0x00FF00, updated: 0xFFA500, ending: 0xFF4444, started: 0x44FF44, reminder: 0xFFD700 };
    embed.setColor(colors[type] || colors.default);

    const title = qName(quest) || 'Unknown Quest';
    const prefixes = { new: '🆕 New Quest - ', updated: '🔄 Updated - ', ending: '⏰ Ending Soon - ', started: '🚀 Started - ', reminder: '🔔 Reminder - ', default: '' };
    embed.setTitle(`${prefixes[type] || ''}${title}`);

    if (quest.media?.[0]) embed.setImage(quest.media[0]);
    else if (quest.banner) embed.setImage(quest.banner);
    if (quest.description) embed.setDescription(quest.description);

    const infoFields = [];
    if (quest.starts_at && quest.ends_at) {
        const start = new Date(quest.starts_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const end = new Date(quest.ends_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        infoFields.push(`**Duration:** ${start} - ${end}`);
    }
    const platforms = quest.platforms || quest.platform;
    if (platforms) infoFields.push(`**Redeemable Platforms:** ${Array.isArray(platforms) ? platforms.join(', ') : platforms}`);
    if (quest.game || quest.game_name) {
        const game = quest.game || quest.game_name;
        const dev = quest.developer || quest.publisher || '';
        infoFields.push(`**Game:** ${dev ? `${game} (${dev})` : game}`);
    }
    if (quest.application_id || quest.app_id) {
        const appId = quest.application_id || quest.app_id;
        const appName = quest.application_name || 'Discord';
        infoFields.push(`**Application:** [${appName}](https://discord.com/application-directory/${appId}) (${appId})`);
    }
    const features = quest.features;
    if (features !== undefined) infoFields.push(`**Features:** ${Array.isArray(features) && features.length > 0 ? features.join(', ') : 'NONE'}`);

    if (infoFields.length > 0) embed.addFields({ name: '📋 Quest Info', value: infoFields.join('\n'), inline: false });

    if (quest.tasks?.length > 0) {
        const taskList = quest.tasks.map(task => {
            const t = (task.type || '').toLowerCase();
            if (t.includes('watch_video') || t.includes('watch video')) return `• Watch video (${task.duration || '50'} seconds)`;
            if (t.includes('play_on_desktop') || t.includes('play game')) return `• Play game for ${Math.ceil((task.duration || 1800) / 60)} minutes`;
            if (t.includes('stream')) return `• Stream game for ${Math.ceil((task.duration || 900) / 60)} minutes`;
            return `• ${task.description || task.type || 'Complete task'}`;
        }).join('\n');
        embed.addFields({ name: '📝 Tasks', value: `User must complete any of the following tasks\n${taskList}`, inline: false });
    }

    if (quest.rewards?.length > 0) {
        quest.rewards.forEach(reward => {
            const lines = [];
            lines.push(`**Reward Type:** ${reward.type || 'Orbs'}`);
            if (reward.amount) lines.push(`**Amount:** ${reward.amount}`);
            if (reward.sku_id) lines.push(`**SKU ID:** ${reward.sku_id}`);
            lines.push(`**Name:** ${reward.name || reward.item_name || 'Unknown'}`);
            embed.addFields({ name: '🎁 Rewards', value: lines.join('\n'), inline: false });
            if (reward.icon || reward.image) embed.setThumbnail(reward.icon || reward.image);
        });
    }

    if (quest.ends_at) {
        const end = new Date(quest.ends_at);
        const now = new Date();
        const hoursLeft = Math.floor((end - now) / (1000 * 60 * 60));
        if (hoursLeft > 0) embed.addFields({ name: '⏳ Time Remaining', value: `${hoursLeft} hours`, inline: true });
    }

    embed.setFooter({ text: `Quest ID: ${quest.id || quest.quest_id || 'N/A'} | discordquest.com`, iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' });
    embed.setTimestamp();
    return embed;
}

function buildCollectibleEmbed(item) {
    const embed = new EmbedBuilder().setColor(0xFF6B9D).setTitle(`✨ ${item.name || 'New Collectible'}`).setTimestamp();
    if (item.description) embed.setDescription(item.description);
    if (item.image) embed.setImage(item.image);
    const fields = [];
    if (item.price !== undefined) fields.push({ name: '💰 Price', value: `${item.price} Orbs`, inline: true });
    if (item.sku_id) fields.push({ name: '📦 SKU', value: item.sku_id, inline: true });
    if (item.type) fields.push({ name: '🏷️ Type', value: item.type, inline: true });
    if (fields.length) embed.addFields(fields);
    return embed;
}

function buildEffectEmbed(effect) {
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle(`🌟 ${effect.name || 'New Profile Effect'}`).setTimestamp();
    if (effect.description) embed.setDescription(effect.description);
    if (effect.animation || effect.image) embed.setImage(effect.animation || effect.image);
    const fields = [];
    if (effect.price !== undefined) fields.push({ name: '💰 Price', value: `${effect.price} Orbs`, inline: true });
    if (effect.sku_id) fields.push({ name: '📦 SKU', value: effect.sku_id, inline: true });
    if (fields.length) embed.addFields(fields);
    return embed;
}

module.exports = {
    buildQuestEmbed,
    buildCollectibleEmbed,
    buildEffectEmbed,
};
