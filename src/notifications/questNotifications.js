const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const { CONFIG } = require('../config');
const { buildQuestEmbed } = require('../embeds');
const { normalizeQuest } = require('../utils/questHelpers');

async function getGuildChannel(client, guildId) {
    const { state } = require('../core/state');
    const settings = state.guildSettings.get(guildId);
    if (settings?.channelId) {
        return client.channels.fetch(settings.channelId).catch(() => null);
    }
    return null;
}

async function sendQuestNotification(client, quest, type = 'new', guildId = null) {
    const { state } = require('../core/state');
    const channelId = guildId ? null : (CONFIG.NOTIF_CHANNEL_ID || process.env.NOTIF_CHANNEL_ID);
    const channel = guildId ? await getGuildChannel(client, guildId) : (channelId ? client.channels.cache.get(channelId) : null);
    if (!channel) return;

    const embed = buildQuestEmbed(quest, type);
    const components = [];
    
    if (type === 'new' || type === 'started') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('View in Discord').setStyle(ButtonStyle.Link).setURL('https://discord.com/quests'),
            new ButtonBuilder().setLabel('More Info').setStyle(ButtonStyle.Link).setURL(`https://discordquest.com/quest/${quest.id || ''}`).setDisabled(!quest.id),
            new ButtonBuilder().setCustomId(`remind_${quest.id}`).setLabel('🔔 Remind Me').setStyle(ButtonStyle.Secondary)
        );
        components.push(row);
    }

    const settings = guildId ? state.guildSettings.get(guildId) : null;
    const roleMention = settings?.roleId ? `<@&${settings.roleId}>` : (CONFIG.NOTIF_ROLE_ID ? `<@&${CONFIG.NOTIF_ROLE_ID}>` : null);
    const content = (roleMention && (type === 'new' || type === 'started')) ? `${roleMention} 🆕 **New Quest Available!**` : undefined;

    const message = await channel.send({ content, embeds: [embed], components: components.length ? components : undefined });
    if (quest.id) state.messageMap.set(`${guildId || 'global'}_${quest.id}`, message.id);
    
    state.stats.notificationsSent++;
    const n = normalizeQuest(quest);
    console.log(`📢 ${type} notification: ${n.title || n.name || quest.id}`);
    return message;
}

async function sendGameAlertDMs(client, quest) {
    const { state } = require('../core/state');
    const n = normalizeQuest(quest);
    const gameName = (n.game || n.game_name || '').toLowerCase();
    if (!gameName) return;

    for (const [userId, games] of state.gameAlerts) {
        for (const watchedGame of games) {
            if (gameName.includes(watchedGame)) {
                try {
                    const user = await client.users.fetch(userId);
                    const alertEmbed = new EmbedBuilder()
                        .setColor(0x8b5cf6)
                        .setTitle('🎮 Game Alert!')
                        .setDescription('A new quest for a game you\'re watching is available!')
                        .setTimestamp();
                    await user.send({ embeds: [alertEmbed, buildQuestEmbed(quest, 'new')] });
                } catch (e) {}
                break;
            }
        }
    }
}

module.exports = {
    getGuildChannel,
    sendQuestNotification,
    sendGameAlertDMs,
};
