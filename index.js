// ============================================
// DISCORD QUEST BOT - ULTIMATE FEATURES v4.0
// REFACTORED - Modular Architecture
// ============================================
require('dotenv').config();

const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ActivityType,
    PermissionFlagsBits,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const https = require('https');

const { CONFIG, SPEED_CONFIG, DISCORD_API, CLIENT_PROPERTIES, USER_AGENT, COLOR_PALETTE, CANVAS_DIMS } = require('./src/config');
const { client } = require('./src/core/client');
const { state, QuestState } = require('./src/core/state');
const { api } = require('./src/api/APIClient');
const { normalizeQuest, qName, qGame, qReward, qStatus, qDesc, detectTaskType, getFlagEmoji, filterValidQuests, filterActiveQuests } = require('./src/utils/questHelpers');
const { timeAgo, formatDuration, parseDate } = require('./src/utils/timeHelpers');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, createWarningEmbed, safeReply, makeProgressBar } = require('./src/utils/discordHelpers');
const { roundRect, drawModernBadge, drawProgressBar } = require('./src/canvas/utils');
const { generateQuestCardImage } = require('./src/canvas/renderer');

// Modularized components
const { buildQuestEmbed, buildCollectibleEmbed, buildEffectEmbed } = require('./src/embeds');
const { getGuildChannel, sendQuestNotification, sendGameAlertDMs } = require('./src/notifications');
const { fetchUserQuests, enrollQuest, runAutoComplete, doVideoQuest, doPlayQuest, selfbotGet } = require('./src/selfbot');
const { buildQuestEmbedMonitor, buildQuestActionRow, buildPaginationRow, buildQuestSelectMenu, startMonitor } = require('./src/monitor');

function stopMonitor(userId, questId) {
    const key = userId + '_' + questId;
    const session = state.monitorSessions.get(key);
    if (session) {
        session.stopped = true;
        state.monitorSessions.delete(key);
    }
}

// Handler ;q
async function handleQCommand(message) {
    const userId = message.author.id;
    const userToken = state.userTokens.get(userId);

    if (!userToken) {
        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('❌ Token Belum Terhubung')
                    .setDescription('Ketik `;link` untuk menghubungkan akun Discord kamu.')
                    .setFooter({ text: 'Bot Quest Monitor' })
            ]
        });
    }

    const loadMsg = await message.channel.send('⏳ Mengambil data quest...');

    try {
        const rawQuests = await fetchUserQuests(userToken);
        const activeQuests = filterActiveQuests(rawQuests);
        const completedCount = rawQuests.filter(q => q.user_status?.completed_at).length;

        // Simpan cache
        state.userTokens.set(userId + '_questcache', rawQuests);
        state.userTokens.set(userId + '_activecache', activeQuests);
        state.userTokens.set(userId + '_monitorpage', 0);

        if (activeQuests.length === 0) {
            const completeEmbed = new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle('✅ Semua Quest Selesai!')
                .setDescription(`**${completedCount}** completed quests`)
                .setTimestamp();
            return loadMsg.edit({ embeds: [completeEmbed], components: [] });
        }

        const page = 0;
        const quest = activeQuests[page];
        const { embed, questCardBuffer } = await buildQuestEmbedMonitor(quest, userId, page, activeQuests.length, activeQuests);
        const actionRow = buildQuestActionRow(quest, userId);
        const paginationRow = activeQuests.length > 1 ? buildPaginationRow(userId, page, activeQuests.length) : null;

        // Build components: Select Menu first, then buttons, then pagination
        const components = [];
        
        // Quest selection dropdown (always show if 2+ quests)
        if (activeQuests.length > 1) {
            const selectRow = buildQuestSelectMenu(activeQuests, userId, quest.id);
            components.push(selectRow);
        }
        
        // Action buttons row
        components.push(actionRow);
        
        // Pagination row (if multiple quests)
        if (paginationRow) components.push(paginationRow);

        const messagePayload = {
            embeds: [embed],
            components: components,
        };

        // Attach quest card image if generated
        if (questCardBuffer) {
            messagePayload.files = [{ attachment: questCardBuffer, name: 'quest_card.png' }];
        }

        await loadMsg.edit(messagePayload);

    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message;
        const errorEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Gagal Mengambil Quest')
            .setDescription(errMsg)
            .setTimestamp();
        await loadMsg.edit({ embeds: [errorEmbed], components: [] });
    }
}

// Handler ;link
async function handleLinkCommand(message) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('open_link_modal')
            .setLabel('🔑 Masukkan Token')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('open_unlink_confirm')
            .setLabel('🗑 Unlink')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!state.userTokens.has(message.author.id)),
    );

    const linked = state.userTokens.has(message.author.id);
    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(linked ? 0x57F287 : 0x5865F2)
                .setTitle('🔐 Link Discord Token')
                .setDescription(
                    linked
                        ? '> ✅ Token sudah terhubung. Klik **Masukkan Token** untuk ganti, atau **Unlink** untuk hapus.'
                        : '> Klik **Masukkan Token** di bawah lalu paste token Discord kamu di popup.\n> ⚠️ Token **tidak disimpan ke disk**, hanya ada di memory selama bot nyala.'
                )
                .setFooter({ text: 'Token kamu hanya terlihat oleh kamu saja via popup modal' })
        ],
        components: [row],
    });
}

// ============================================
// SLASH COMMANDS - ALL FEATURES
// ============================================

const commands = [
    { name: 'quests', description: '🎯 Show all active quests', options: [{ name: 'filter', description: 'Filter quests', type: 3, required: false, choices: [{ name: 'Active', value: 'active' }, { name: 'Upcoming', value: 'upcoming' }, { name: 'Ending Soon', value: 'ending' }, { name: 'All', value: 'all' }] }] },
    { name: 'quest', description: '🔍 Search quest by name', options: [{ name: 'name', description: 'Quest name', type: 3, required: true }] },
    { name: 'questinfo', description: '📋 Get quest details by ID', options: [{ name: 'id', description: 'Quest ID', type: 3, required: true }] },
    { name: 'questbygame', description: '🎮 Find quests by game', options: [{ name: 'game', description: 'Game name', type: 3, required: true }] },
    { name: 'questbyregion', description: '🌍 Find quests by region', options: [{ name: 'region', description: 'Region code (US, EU, JP, etc)', type: 3, required: true }] },
    { name: 'questbyreward', description: '🎁 Find quests by reward type', options: [{ name: 'type', description: 'Reward type', type: 3, required: true, choices: [{ name: 'Orbs', value: 'orbs' }, { name: 'Avatar Decoration', value: 'avatar_decoration' }, { name: 'Profile Effect', value: 'profile_effect' }, { name: 'Nitro', value: 'nitro' }] }] },
    { name: 'track', description: '🔔 Track a quest and get reminders', options: [{ name: 'quest_id', description: 'Quest ID to track', type: 3, required: true }] },
    { name: 'untrack', description: '🔕 Stop tracking a quest', options: [{ name: 'quest_id', description: 'Quest ID to untrack', type: 3, required: true }] },
    { name: 'mytracks', description: '📋 List your tracked quests' },
    { name: 'remindme', description: '⏰ Set reminder before quest ends', options: [{ name: 'quest_id', description: 'Quest ID', type: 3, required: true }, { name: 'hours', description: 'Hours before end', type: 4, required: true }] },
    { name: 'endingsoon', description: '⏰ Show quests ending in 24h' },
    { name: 'upcoming', description: '📅 Show upcoming quests' },
    { name: 'crossplatform', description: '🌐 Show cross-platform quests' },
    { name: 'mobileonly', description: '📱 Show mobile-only quests' },
    { name: 'pconly', description: '💻 Show PC-only quests' },
    { name: 'collectibles', description: '💎 Show available collectibles' },
    { name: 'profileeffects', description: '✨ Show profile effects' },
    { name: 'shop', description: '🛒 Show all shop items' },
    { name: 'iteminfo', description: '🔍 Get item details by SKU', options: [{ name: 'sku', description: 'SKU ID', type: 3, required: true }] },
    { name: 'regions', description: '🌍 Show available regions' },
    { name: 'myregion', description: '📍 Set your region for filtering', options: [{ name: 'region', description: 'Your region code', type: 3, required: true }] },
    { name: 'checkavailability', description: '✅ Check if quest available in your region', options: [{ name: 'quest_id', description: 'Quest ID', type: 3, required: true }] },
    { name: 'history', description: '📜 Show recently added quests' },
    { name: 'queststats', description: '📊 Show quest statistics' },
    { name: 'botstats', description: '🤖 Show bot statistics' },
    { name: 'compare', description: '⚖️ Compare two quests', options: [{ name: 'quest1', description: 'First quest ID', type: 3, required: true }, { name: 'quest2', description: 'Second quest ID', type: 3, required: true }] },
    { name: 'randomquest', description: '🎲 Get a random active quest' },
    { name: 'questoftheday', description: '⭐ Get featured quest' },
    { name: 'notifychannel', description: '🔧 Set notification channel (Admin)', options: [{ name: 'channel', description: 'Channel', type: 7, required: true }] },
    { name: 'notifyrole', description: '🔧 Set notification role (Admin)', options: [{ name: 'role', description: 'Role', type: 8, required: true }] },
    { name: 'help', description: '❓ Show all commands and help' },
    { name: 'ping', description: '🏓 Check bot latency' },
    { name: 'settings', description: '⚙️ Show your settings' },
    { name: 'subscribe', description: '✅ Subscribe to DM notifications' },
    { name: 'unsubscribe', description: '❌ Unsubscribe from DM notifications' },
    // NEW COMMANDS
    { name: 'leaderboard', description: '🏆 Top users by quests tracked' },
    { name: 'questalert', description: '🔔 Get DM when a quest for a specific game appears', options: [{ name: 'game', description: 'Game name to watch', type: 3, required: true }] },
    { name: 'myalerts', description: '📋 List your game alerts' },
    { name: 'removealert', description: '🔕 Remove a game alert', options: [{ name: 'game', description: 'Game name to remove', type: 3, required: true }] },
    { name: 'clearalerts', description: '🗑️ Clear all your game alerts' },
    { name: 'forcepoll', description: '🔄 Force refresh quest data (Admin)' },
    // AUTO-COMPLETE COMMANDS (selfbot)
    { name: 'autocomplete', description: '⚡ Auto-complete all your valid Discord quests', options: [{ name: 'token', description: 'Your Discord user token', type: 3, required: true }] },
    { name: 'myquestprogress', description: '📊 Lihat progress quest kamu saat ini', options: [{ name: 'token', description: 'Your Discord user token', type: 3, required: true }] },
];

// ============================================
// COMMAND HANDLERS
// ============================================

async function handleQuests(interaction) {
    await interaction.deferReply();
    const filter = interaction.options.getString('filter') || 'active';
    let quests = [];
    switch (filter) {
        case 'active': quests = state.getActiveQuests(); break;
        case 'upcoming': quests = state.getUpcomingQuests(); break;
        case 'ending': quests = state.getEndingSoon(24); break;
        case 'all': quests = Array.from(state.quests.values()); break;
    }
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Quests Found')
            .setDescription(`No ${filter} quests available at this time.`)
            .setFooter({ text: 'Try a different filter or check back later' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.slice(0, 5).map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`🎯 ${quests.length} ${filter.charAt(0).toUpperCase() + filter.slice(1)} Quest(s)`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < Math.min(embeds.length, 4); i++) {
        await interaction.followUp({ embeds: [embeds[i]] });
    }
}

async function handleQuestSearch(interaction) {
    await interaction.deferReply();
    const search = interaction.options.getString('name').toLowerCase();
    const matches = Array.from(state.quests.values()).filter(q => 
        (qName(q) || '').toLowerCase().includes(search) ||
        qGame(q).toLowerCase().includes(search) ||
        (q.description || '').toLowerCase().includes(search)
    );
    if (matches.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ No Matches Found')
            .setDescription(`No quests matching "${search}" were found.`)
            .setFooter({ text: 'Try a different search term' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = buildQuestEmbed(matches[0]);
    embed.setTitle(`🔍 Found ${matches.length} match(es), showing first:`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open in Discord').setStyle(ButtonStyle.Link).setURL('https://discord.com/quests'),
        new ButtonBuilder().setLabel(`Found ${matches.length} matches`).setStyle(ButtonStyle.Secondary).setCustomId('dummy').setDisabled(true)
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleQuestById(interaction) {
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const quest = state.quests.get(id);
    if (!quest) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Quest Not Found')
            .setDescription(`Quest ID "${id}" was not found.`)
            .setFooter({ text: 'Verify the quest ID and try again' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    await interaction.editReply({ embeds: [buildQuestEmbed(quest)] });
}

async function handleQuestByGame(interaction) {
    await interaction.deferReply();
    const game = interaction.options.getString('game');
    const quests = state.getQuestsByGame(game);
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ No Game Quests Found')
            .setDescription(`No quests for **${game}** were found.`)
            .setFooter({ text: 'Try a different game name' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`🎮 ${quests.length} Quest(s) for ${game}`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleQuestByRegion(interaction) {
    await interaction.deferReply();
    const region = interaction.options.getString('region');
    const quests = state.getQuestsByRegion(region);
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ No Regional Quests Found')
            .setDescription(`No quests available in region **${region}**.`)
            .setFooter({ text: 'Check available regions with /regions' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`🌍 ${quests.length} Quest(s) in ${region}`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleQuestByReward(interaction) {
    await interaction.deferReply();
    const type = interaction.options.getString('type');
    const quests = state.getQuestsByRewardType(type);
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ No Reward Type Quests Found')
            .setDescription(`No quests with reward type **${type}** were found.`)
            .setFooter({ text: 'Try a different reward type' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`🎁 ${quests.length} Quest(s) with ${type} reward`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleTrack(interaction) {
    const questId = interaction.options.getString('quest_id');
    const quest = state.quests.get(questId);
    if (!quest) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Quest Not Found')
            .setDescription(`Quest "${questId}" was not found.`)
            .setFooter({ text: 'Verify the quest ID' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId) || { tracked: [], dmEnabled: false, region: null };
    if (!prefs.tracked.includes(questId)) {
        prefs.tracked.push(questId);
        state.userPrefs.set(userId, prefs);
        await state.save();
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Now Tracking Quest')
        .setDescription(`You're now tracking **${qName(quest)}**!`)
        .addFields(
            { name: '🔔 Notifications', value: 'You will be notified of updates.', inline: false }
        )
        .setFooter({ text: `Quest ID: ${questId}` })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleUntrack(interaction) {
    const questId = interaction.options.getString('quest_id');
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId);
    if (prefs) {
        prefs.tracked = prefs.tracked.filter(id => id !== questId);
        state.userPrefs.set(userId, prefs);
        await state.save();
    }
    const embed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle('🔕 Stopped Tracking')
        .setDescription(`Stopped tracking quest **${questId}**.`)
        .setFooter({ text: 'You will no longer receive updates for this quest' })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleMyTracks(interaction) {
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId);
    if (!prefs || prefs.tracked.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Tracked Quests')
            .setDescription('You are not tracking any quests.')
            .addFields(
                { name: '💡 How to start', value: 'Use `/track <quest_id>` to track a quest!', inline: false }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    
    const tracked = prefs.tracked.map(id => state.quests.get(id)).filter(Boolean);
    if (tracked.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 Tracked Quests Unavailable')
            .setDescription('Your tracked quests are no longer available.')
            .setFooter({ text: 'They may have expired or been removed' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    
    const embeds = tracked.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`📋 Your ${tracked.length} Tracked Quest(s)`);
    await interaction.reply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleRemindMe(interaction) {
    const questId = interaction.options.getString('quest_id');
    const hours = interaction.options.getInteger('hours');
    const quest = state.quests.get(questId);
    if (!quest) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Quest Not Found')
            .setDescription('The specified quest was not found.')
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    
    const reminders = state.reminders.get(questId) || new Set();
    reminders.add(interaction.user.id);
    state.reminders.set(questId, reminders);
    await state.save();
    
    const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle('⏰ Reminder Set')
        .setDescription(`I'll remind you **${hours} hours** before **${qName(quest)}** ends!`)
        .setFooter({ text: 'You will receive a DM notification' })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleEndingSoon(interaction) {
    await interaction.deferReply();
    const quests = state.getEndingSoon(24);
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0x06b6d4)
            .setTitle('📭 No Ending Quests')
            .setDescription('No quests are ending within the next 24 hours.')
            .setFooter({ text: 'Check back later for ending quests' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q, 'ending'));
    embeds[0].setTitle(`⏰ ${quests.length} Quest(s) Ending Soon!`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleUpcoming(interaction) {
    await interaction.deferReply();
    const quests = state.getUpcomingQuests();
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0x06b6d4)
            .setTitle('📭 No Upcoming Quests')
            .setDescription('No upcoming quests at this time.')
            .setFooter({ text: 'Check back later' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📅 Upcoming Quests').setTimestamp();
    quests.slice(0, 15).forEach((q, idx) => {
        const start = new Date(q.starts_at);
        const game = qGame(q) || 'Unknown';
        embed.addFields({ name: `${idx + 1}. ${qName(q)}`, value: `**Game:** ${game}\n**Starts:** <t:${Math.floor(start.getTime() / 1000)}:R>`, inline: false });
    });
    await interaction.editReply({ embeds: [embed] });
}

async function handleCrossPlatform(interaction) {
    await interaction.deferReply();
    const quests = state.getActiveQuests().filter(q => {
        const p = q.platforms || q.platform;
        return Array.isArray(p) ? p.includes('Cross Platform') || p.length > 1 : (p || '').toLowerCase().includes('cross');
    });
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Cross-Platform Quests')
            .setDescription('No cross-platform quests available at this time.')
            .setFooter({ text: 'Check back later' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`🌐 ${quests.length} Cross-Platform Quest(s)`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleMobileOnly(interaction) {
    await interaction.deferReply();
    const quests = state.getActiveQuests().filter(q => {
        const p = q.platforms || q.platform;
        const pStr = Array.isArray(p) ? p.join(', ') : (p || '');
        return pStr.toLowerCase().includes('mobile') && !pStr.toLowerCase().includes('pc') && !pStr.toLowerCase().includes('cross');
    });
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Mobile-Only Quests')
            .setDescription('No mobile-only quests available at this time.')
            .setFooter({ text: 'Check /crossplatform for mobile-compatible quests' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`📱 ${quests.length} Mobile-Only Quest(s)`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handlePCOnly(interaction) {
    await interaction.deferReply();
    const quests = state.getActiveQuests().filter(q => {
        const p = q.platforms || q.platform;
        const pStr = Array.isArray(p) ? p.join(', ') : (p || '');
        return (pStr.toLowerCase().includes('pc') || pStr.toLowerCase().includes('desktop')) && !pStr.toLowerCase().includes('mobile');
    });
    if (quests.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No PC-Only Quests')
            .setDescription('No PC-only quests available at this time.')
            .setFooter({ text: 'Check /crossplatform for PC-compatible quests' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = quests.map(q => buildQuestEmbed(q));
    embeds[0].setTitle(`💻 ${quests.length} PC-Only Quest(s)`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleCollectibles(interaction) {
    await interaction.deferReply();
    const items = Array.from(state.collectibles.values());
    if (items.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Collectibles Data')
            .setDescription('No collectibles data available at this time.')
            .setFooter({ text: 'Try again later' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = items.slice(0, 5).map(i => buildCollectibleEmbed(i));
    embeds[0].setTitle(`💎 ${items.length} Collectible(s)`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleProfileEffects(interaction) {
    await interaction.deferReply();
    const effects = Array.from(state.effects.values());
    if (effects.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Profile Effects Data')
            .setDescription('No profile effects data available at this time.')
            .setFooter({ text: 'Try again later' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embeds = effects.slice(0, 5).map(e => buildEffectEmbed(e));
    embeds[0].setTitle(`🌟 ${effects.length} Profile Effect(s)`);
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) await interaction.followUp({ embeds: [embeds[i]] });
}

async function handleShop(interaction) {
    await interaction.deferReply();
    const items = [...Array.from(state.collectibles.values()), ...Array.from(state.effects.values())];
    if (items.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 Shop Empty')
            .setDescription('The shop is currently empty.')
            .setFooter({ text: 'Try again later' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('🛒 Quest Shop').setDescription(`**${state.collectibles.size} Collectibles** | **${state.effects.size} Profile Effects**`).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}

async function handleItemInfo(interaction) {
    await interaction.deferReply();
    const sku = interaction.options.getString('sku');
    const item = Array.from(state.collectibles.values()).find(i => i.sku_id === sku) || 
                 Array.from(state.effects.values()).find(e => e.sku_id === sku);
    if (!item) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Item Not Found')
            .setDescription(`Item with SKU "${sku}" was not found.`)
            .setFooter({ text: 'Verify the SKU ID' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = item.name ? buildCollectibleEmbed(item) : buildEffectEmbed(item);
    await interaction.editReply({ embeds: [embed] });
}

async function handleRegions(interaction) {
    await interaction.deferReply();
    try {
        const regions = await api.getRegions();
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🌍 Available Regions').setTimestamp();
        Object.entries(regions).forEach(([code, data]) => {
            embed.addFields({ name: `${getFlagEmoji(code)} ${data.name || code}`, value: `Code: \`${code}\``, inline: true });
        });
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Error')
            .setDescription('Failed to fetch regions. Please try again later.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleMyRegion(interaction) {
    const region = interaction.options.getString('region').toUpperCase();
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId) || { tracked: [], dmEnabled: false, region: null };
    prefs.region = region;
    state.userPrefs.set(userId, prefs);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('📍 Region Set')
        .setDescription(`Your region has been set to **${region}**!`)
        .addFields(
            { name: '🌍 Auto-Filter', value: 'Quests will now be filtered automatically.', inline: false }
        )
        .setFooter({ text: 'Use /checkavailability to verify quest access' })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleCheckAvailability(interaction) {
    await interaction.deferReply();
    const questId = interaction.options.getString('quest_id');
    const quest = state.quests.get(questId);
    if (!quest) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Quest Not Found')
            .setDescription('The specified quest was not found.')
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId);
    const userRegion = prefs?.region;
    
    const availableRegions = quest.regions || [];
    const isAvailable = !userRegion || availableRegions.includes(userRegion) || availableRegions.length === 0;
    
    const embed = new EmbedBuilder()
        .setColor(isAvailable ? 0x00FF00 : 0xFF4444)
        .setTitle(`✅ Availability Check: ${qName(quest)}`)
        .addFields(
            { name: '🌍 Available In', value: availableRegions.length > 0 ? availableRegions.map(r => `${getFlagEmoji(r)} ${r}`).join(' ') : 'All Regions', inline: false },
            { name: '📍 Your Region', value: userRegion || 'Not set (use `/myregion`)', inline: true },
            { name: '🔓 Status', value: isAvailable ? '✅ **Available for you!**' : '❌ **Not available in your region**', inline: true }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleHistory(interaction) {
    await interaction.deferReply();
    const history = state.getQuestHistory().slice(0, 20);
    if (history.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0x06b6d4)
            .setTitle('📭 No Quest History')
            .setDescription('No quest history available at this time.')
            .setFooter({ text: 'New quests will appear here as they are discovered' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📜 Recently Added Quests').setTimestamp();
    history.forEach((q, idx) => {
        const tracked = new Date(q._trackedAt || Date.now());
        embed.addFields({ name: `${idx + 1}. ${qName(q)}`, value: `**Game:** ${qGame(q) || 'N/A'}\n**Tracked:** <t:${Math.floor(tracked.getTime() / 1000)}:R>`, inline: false });
    });
    await interaction.editReply({ embeds: [embed] });
}

async function handleQuestStats(interaction) {
    await interaction.deferReply();
    const all = Array.from(state.quests.values());
    const active = state.getActiveQuests();
    const upcoming = state.getUpcomingQuests();
    const ending = state.getEndingSoon(24);
    
    const games = {};
    const rewards = {};
    all.forEach(q => {
        const game = qGame(q) || 'Unknown';
        games[game] = (games[game] || 0) + 1;
        q.rewards?.forEach(r => {
            const type = r.type || 'Unknown';
            rewards[type] = (rewards[type] || 0) + 1;
        });
    });
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Quest Statistics')
        .addFields(
            { name: '📊 Total Tracked', value: `${all.length}`, inline: true },
            { name: '🟢 Active', value: `${active.length}`, inline: true },
            { name: '⏰ Ending Soon', value: `${ending.length}`, inline: true },
            { name: '📅 Upcoming', value: `${upcoming.length}`, inline: true },
            { name: '🎮 Top Games', value: Object.entries(games).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, c]) => `${g}: ${c}`).join('\n') || 'N/A', inline: false },
            { name: '🎁 Reward Types', value: Object.entries(rewards).map(([r, c]) => `${r}: ${c}`).join('\n') || 'N/A', inline: false }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleBotStats(interaction) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const memory = process.memoryUsage();
    
    const embed = new EmbedBuilder()
        .setColor(state.lastError ? 0xFFA500 : 0x00FF00)
        .setTitle('🤖 Bot Statistics')
        .addFields(
            { name: '🟢 Status', value: state.lastError ? '⚠️ Degraded' : 'Healthy', inline: true },
            { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
            { name: '📡 Quests', value: `${state.quests.size}`, inline: true },
            { name: '💎 Collectibles', value: `${state.collectibles.size}`, inline: true },
            { name: '🌟 Effects', value: `${state.effects.size}`, inline: true },
            { name: '🔔 Notifications', value: `${state.stats.notificationsSent}`, inline: true },
            { name: '⌨️ Commands Used', value: `${state.stats.commandsUsed}`, inline: true },
            { name: '👥 Users', value: `${state.userPrefs.size}`, inline: true },
            { name: '🏠 Guilds', value: `${client.guilds.cache.size}`, inline: true },
            { name: '💾 Memory', value: `${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
            { name: '🔧 API', value: CONFIG.API_BASE, inline: false },
            { name: '❌ Last Error', value: state.lastError || 'None', inline: false }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleCompare(interaction) {
    await interaction.deferReply();
    const id1 = interaction.options.getString('quest1');
    const id2 = interaction.options.getString('quest2');
    const q1 = state.quests.get(id1);
    const q2 = state.quests.get(id2);
    
    if (!q1 || !q2) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Quests Not Found')
            .setDescription('One or both quests were not found.')
            .setFooter({ text: 'Verify both quest IDs and try again' })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('⚖️ Quest Comparison').setTimestamp();
    
    const fields = [
        { name: '', value: `**${q1.title || q1.name}**`, inline: true },
        { name: '', value: 'VS', inline: true },
        { name: '', value: `**${q2.title || q2.name}**`, inline: true },
    ];
    
    const game1 = q1.game || q1.game_name || 'N/A';
    const game2 = q2.game || q2.game_name || 'N/A';
    fields.push({ name: '🎮 Game', value: game1, inline: true }, { name: '', value: '', inline: true }, { name: '', value: game2, inline: true });
    
    const end1 = q1.ends_at ? new Date(q1.ends_at) : null;
    const end2 = q2.ends_at ? new Date(q2.ends_at) : null;
    const time1 = end1 ? `<t:${Math.floor(end1.getTime() / 1000)}:R>` : 'N/A';
    const time2 = end2 ? `<t:${Math.floor(end2.getTime() / 1000)}:R>` : 'N/A';
    fields.push({ name: '⏰ Ends', value: time1, inline: true }, { name: '', value: '', inline: true }, { name: '', value: time2, inline: true });
    
    const reward1 = q1.rewards?.map(r => r.name || r.type).join(', ') || 'N/A';
    const reward2 = q2.rewards?.map(r => r.name || r.type).join(', ') || 'N/A';
    fields.push({ name: '🎁 Rewards', value: reward1, inline: true }, { name: '', value: '', inline: true }, { name: '', value: reward2, inline: true });
    
    embed.addFields(fields);
    await interaction.editReply({ embeds: [embed] });
}

async function handleRandomQuest(interaction) {
    const active = state.getActiveQuests();
    if (active.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Active Quests')
            .setDescription('No active quests available at this time.')
            .setFooter({ text: 'Check /upcoming for future quests' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    
    const random = active[Math.floor(Math.random() * active.length)];
    await interaction.reply({ embeds: [buildQuestEmbed(random, 'default')] });
}

async function handleQuestOfTheDay(interaction) {
    const active = state.getActiveQuests();
    if (active.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Active Quests')
            .setDescription('No active quests available at this time.')
            .setFooter({ text: 'Check back later' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }
    
    const featured = active.sort((a, b) => {
        const aEnding = a.ends_at ? new Date(a.ends_at).getTime() : Infinity;
        const bEnding = b.ends_at ? new Date(b.ends_at).getTime() : Infinity;
        return aEnding - bEnding;
    })[0];
    
    const embed = buildQuestEmbed(featured, 'default');
    embed.setTitle(`⭐ Featured Quest - ${featured.title || featured.name}`);
    await interaction.reply({ embeds: [embed] });
}

async function handleNotifyChannel(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Access Denied')
            .setDescription('This command requires **Administrator** permissions.')
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;
    const settings = state.guildSettings.get(guildId) || {};
    settings.channelId = channel.id;
    state.guildSettings.set(guildId, settings);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Channel Set')
        .setDescription(`Notification channel set to ${channel}`)
        .addFields(
            { name: '📢 Notifications', value: 'New quest alerts will be posted here.', inline: false }
        )
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleNotifyRole(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Access Denied')
            .setDescription('This command requires **Administrator** permissions.')
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const role = interaction.options.getRole('role');
    const guildId = interaction.guildId;
    const settings = state.guildSettings.get(guildId) || {};
    settings.roleId = role.id;
    state.guildSettings.set(guildId, settings);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Role Set')
        .setDescription(`Notification role set to ${role}`)
        .addFields(
            { name: '🔔 Mentions', value: 'This role will be mentioned for new quest alerts.', inline: false }
        )
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('❓ Discord Quest Bot - Help')
        .setDescription('Your ultimate Discord Quest companion!')
        .addFields(
            { name: '🎯 Quest Info', value: '`/quests` - Active quests\n`/quest <n>` - Search by name\n`/questinfo <id>` - Details by ID\n`/questbygame <game>` - By game\n`/questbyregion <region>` - By region\n`/questbyreward <type>` - By reward', inline: true },
            { name: '🔔 Tracking', value: '`/track <id>` - Track quest\n`/untrack <id>` - Stop tracking\n`/mytracks` - Your tracked quests\n`/remindme <id> <hours>` - Set reminder', inline: true },
            { name: '⏰ Time Filters', value: '`/endingsoon` - 24h left\n`/upcoming` - Future quests\n`/crossplatform` - Cross-platform\n`/mobileonly` - Mobile only\n`/pconly` - PC only', inline: true },
            { name: '💎 Shop', value: '`/collectibles` - Collectibles\n`/profileeffects` - Profile effects\n`/shop` - All shop items\n`/iteminfo <sku>` - Item details', inline: true },
            { name: '🌍 Region', value: '`/regions` - Available regions\n`/myregion <code>` - Set your region\n`/checkavailability <id>` - Check quest', inline: true },
            { name: '📊 Stats', value: '`/history` - Recent quests\n`/queststats` - Quest stats\n`/botstats` - Bot stats\n`/compare <id1> <id2>` - Compare\n`/leaderboard` - Top trackers', inline: true },
            { name: '🎲 Fun', value: '`/randomquest` - Random quest\n`/questoftheday` - Featured quest', inline: true },
            { name: '🎮 Game Alerts', value: '`/questalert <game>` - Alert for game\n`/myalerts` - Your alerts\n`/removealert <game>` - Remove alert\n`/clearalerts` - Clear all alerts', inline: true },
            { name: '⚙️ Settings', value: '`/notifychannel <ch>` - Set channel (Admin)\n`/notifyrole <role>` - Set role (Admin)\n`/forcepoll` - Force refresh (Admin)\n`/subscribe` - DM notifications\n`/unsubscribe` - Stop DM\n`/settings` - Your settings\n`/ping` - Check latency', inline: true },
            { name: '⚡ Auto-Complete', value: '`/autocomplete <token>` - Auto-complete semua quest\n`/myquestprogress <token>` - Lihat progress quest\n⚠️ *Gunakan di DM, token kamu tidak disimpan*', inline: false }
        )
        .setFooter({ text: 'Bot updates every 30s automatically' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handlePing(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);
    
    const embed = new EmbedBuilder()
        .setColor(latency < 200 ? 0x22c55e : latency < 500 ? 0xf97316 : 0xED4245)
        .setTitle('🏓 Pong!')
        .addFields(
            { name: '🔧 Bot Latency', value: `${latency}ms`, inline: true },
            { name: '📡 API Latency', value: `${apiLatency}ms`, inline: true }
        )
        .setFooter({ text: 'Discord Gateway latency' })
        .setTimestamp();
    await interaction.editReply({ content: '', embeds: [embed] });
}

async function handleSettings(interaction) {
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId) || { tracked: [], dmEnabled: false, region: null };
    const alerts = state.getGameAlertsForUser(userId);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Your Settings')
        .addFields(
            { name: '📍 Region', value: prefs.region || 'Not set', inline: true },
            { name: '🔔 DM Notifications', value: prefs.dmEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '📋 Tracked Quests', value: `${prefs.tracked.length}`, inline: true },
            { name: '📝 Tracked IDs', value: prefs.tracked.join(', ') || 'None', inline: false },
            { name: '🎮 Game Alerts', value: alerts.size > 0 ? Array.from(alerts).join(', ') : 'None', inline: false }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function handleSubscribe(interaction) {
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId) || { tracked: [], dmEnabled: false, region: null };
    prefs.dmEnabled = true;
    state.userPrefs.set(userId, prefs);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Subscribed to DM Notifications')
        .setDescription('You will receive DM notifications for new quests!')
        .addFields(
            { name: '🔔 What you will receive', value: 'Notifications for new quests, endings, and updates.', inline: false }
        )
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleUnsubscribe(interaction) {
    const userId = interaction.user.id;
    const prefs = state.userPrefs.get(userId);
    if (prefs) {
        prefs.dmEnabled = false;
        state.userPrefs.set(userId, prefs);
        await state.save();
    }
    const embed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle('🔕 Unsubscribed')
        .setDescription('You have unsubscribed from DM notifications.')
        .setFooter({ text: 'You will no longer receive quest notifications' })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

// ============================================
// NEW COMMAND HANDLERS
// ============================================

async function handleLeaderboard(interaction) {
    const board = state.getLeaderboard();
    if (board.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0x06b6d4)
            .setTitle('📭 No Leaderboard Data')
            .setDescription('No one is tracking quests yet!')
            .addFields(
                { name: '💡 How to participate', value: 'Use `/track <quest_id>` to start tracking quests!', inline: false }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Quest Tracker Leaderboard')
        .setDescription('Top users by number of tracked quests')
        .setTimestamp();

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(board.map(async (entry, idx) => {
        let username = entry.userId;
        try {
            const user = await client.users.fetch(entry.userId);
            username = user.username;
        } catch {}
        const medal = medals[idx] || `**${idx + 1}.**`;
        return `${medal} ${username} — **${entry.count}** quest(s)`;
    }));

    embed.setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed] });
}

async function handleQuestAlert(interaction) {
    const game = interaction.options.getString('game');
    const userId = interaction.user.id;
    state.addGameAlert(userId, game);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('🔔 Game Alert Set')
        .setDescription(`Alert set for **${game}**!`)
        .addFields(
            { name: '🎮 Notification', value: 'You will receive a DM when a new quest for this game appears.', inline: false }
        )
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleMyAlerts(interaction) {
    const userId = interaction.user.id;
    const alerts = state.getGameAlertsForUser(userId);
    if (alerts.size === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('📭 No Game Alerts')
            .setDescription('You have no game alerts set.')
            .addFields(
                { name: '💡 How to set alerts', value: 'Use `/questalert <game>` to add one!', inline: false }
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎮 Your Game Alerts')
        .setDescription(Array.from(alerts).map((g, i) => `${i + 1}. ${g}`).join('\n'))
        .setFooter({ text: 'Use /removealert <game> to remove one, or /clearalerts to remove all' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleRemoveAlert(interaction) {
    const game = interaction.options.getString('game');
    const userId = interaction.user.id;
    state.removeGameAlert(userId, game);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0x06b6d4)
        .setTitle('🔕 Alert Removed')
        .setDescription(`Removed game alert for **${game}**.`)
        .setFooter({ text: 'You will no longer receive alerts for this game' })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleClearAlerts(interaction) {
    const userId = interaction.user.id;
    state.clearGameAlerts(userId);
    await state.save();
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🗑️ All Alerts Cleared')
        .setDescription('All your game alerts have been cleared.')
        .setFooter({ text: 'You will no longer receive any game alerts' })
        .setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleForcePoll(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Access Denied')
            .setDescription('This command requires **Administrator** permissions.')
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const loadingEmbed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle('🔄 Force Polling')
        .setDescription('Refreshing quest data from API...')
        .setTimestamp();
    await interaction.reply({ embeds: [loadingEmbed] });
    await pollQuests();
    await pollCollectibles();
    await pollEffects();
    const successEmbed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('✅ Polling Complete')
        .setDescription(`Now tracking **${state.quests.size}** quests.`)
        .addFields(
            { name: '📊 Data Refreshed', value: 'Quests, collectibles, and effects updated.', inline: false }
        )
        .setTimestamp();
    await interaction.editReply({ embeds: [successEmbed] });
}

// ============================================
// AUTO-COMPLETE HANDLERS
// ============================================

async function handleAutoComplete(interaction) {
    const userToken = interaction.options.getString('token');
    const startEmbed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle('⚡ Auto-Complete Starting')
        .setDescription('Starting auto-complete process...')
        .addFields(
            { name: '⏱️ Duration', value: 'This may take a few minutes depending on quest count.', inline: false }
        )
        .setTimestamp();
    await interaction.reply({ embeds: [startEmbed], ephemeral: true });

    let lastStatus = '';
    const statusUpdates = [];

    try {
        const results = await runAutoComplete(userToken, (questName, status) => {
            const msg = `🔄 **${questName}** — ${status}`;
            statusUpdates.push(msg);
            lastStatus = msg;
        });

        const embed = new EmbedBuilder()
            .setColor(results.failed.length === 0 ? 0x00FF00 : 0xFFA500)
            .setTitle('⚡ Auto-Complete Selesai!')
            .setTimestamp();

        if (results.success.length > 0) {
            embed.addFields({
                name: `✅ Berhasil (${results.success.length})`,
                value: results.success.map(r => `• **${r.name}** → 🎁 ${r.reward}`).join('\n').slice(0, 1024),
                inline: false
            });
        }

        if (results.failed.length > 0) {
            embed.addFields({
                name: `❌ Gagal (${results.failed.length})`,
                value: results.failed.map(r => `• **${r.name}** — ${r.reason}`).join('\n').slice(0, 1024),
                inline: false
            });
        }

        if (results.skipped.length > 0) {
            embed.addFields({
                name: `⏭️ Skip (${results.skipped.length})`,
                value: results.skipped.map(r => `• **${r.name}** — ${r.reason}`).join('\n').slice(0, 1024),
                inline: false
            });
        }

        if (results.success.length === 0 && results.failed.length === 0 && results.skipped.length === 0) {
            embed.setDescription('📭 Tidak ada quest valid yang ditemukan untuk token ini.');
        }

        await interaction.editReply({ content: '', embeds: [embed] });

    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message || 'Unknown error';
        const errorEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Auto-Complete Failed')
            .setDescription(`**${errMsg}**`)
            .addFields(
                { name: '💡 Troubleshooting', value: 'Pastikan token kamu valid dan belum expired.', inline: false }
            )
            .setTimestamp();
        await interaction.editReply({ content: '', embeds: [errorEmbed] });
    }
}

async function handleMyQuestProgress(interaction) {
    const userToken = interaction.options.getString('token');
    await interaction.deferReply({ ephemeral: true });

    try {
        const quests = await fetchUserQuests(userToken);

        if (quests.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('📭 No Quests Found')
                .setDescription('Tidak ada quest yang ditemukan untuk token ini.')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 Quest Progress Kamu')
            .setTimestamp();

        const now = new Date();

        for (const quest of quests.slice(0, 15)) {
            const name = quest.config?.messages?.quest_name || quest.id;
            const expired = now.getTime() > new Date(quest.config?.expires_at).getTime();
            const completed = Boolean(quest.user_status?.completed_at);
            const enrolled = Boolean(quest.user_status?.enrolled_at);
            const taskType = detectTaskType(quest);

            let progressStr = '';
            if (completed) {
                progressStr = '✅ Selesai';
            } else if (expired) {
                progressStr = '💀 Expired';
            } else if (!enrolled) {
                progressStr = '⭕ Belum dimulai';
            } else if (taskType && quest.user_status?.progress?.[taskType]) {
                const prog = quest.user_status.progress[taskType];
                const target = quest.config?.task_config?.tasks?.[taskType]?.target || 0;
                const pct = target > 0 ? Math.floor((prog.value / target) * 100) : 0;
                progressStr = `🔄 ${prog.value}/${target} (${pct}%)`;
            } else {
                progressStr = '🔄 In Progress';
            }

            const reward = quest.config?.rewards_config?.rewards?.[0];
            const rewardStr = reward?.messages?.name || (reward?.orb_quantity ? `${reward.orb_quantity} Orbs` : 'Unknown');
            const expiresAt = quest.config?.expires_at ? `<t:${Math.floor(new Date(quest.config.expires_at).getTime() / 1000)}:R>` : 'N/A';

            embed.addFields({
                name: name,
                value: `**Status:** ${progressStr}\n**Reward:** ${rewardStr}\n**Expires:** ${expiresAt}`,
                inline: false
            });
        }

        if (quests.length > 15) {
            embed.setFooter({ text: `Menampilkan 15 dari ${quests.length} quest` });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message || 'Unknown error';
        const errorEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Failed to Fetch Progress')
            .setDescription(`**${errMsg}**`)
            .addFields(
                { name: '💡 Troubleshooting', value: 'Pastikan token kamu valid.', inline: false }
            )
            .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// ============================================
// POLLING & REALTIME
// ============================================

async function pollQuests() {
    try {
        const data = await api.getQuests();
        const changes = state.updateQuests(data);

        // FIX: skip all notifications during initial load
        if (!state.isReady) {
            console.log(`✅ Initial load: ${state.quests.size} quests (notifications suppressed)`);
            state.isReady = true;
            // Save after initial load so quests are persisted immediately
            await state.save();
            return;
        }
        
        for (const quest of changes.added) {
            await sendQuestNotification(quest, 'new');

            // DM subscribers
            for (const [userId, prefs] of state.userPrefs) {
                if (prefs.dmEnabled) {
                    try {
                        const user = await client.users.fetch(userId);
                        await user.send({ embeds: [buildQuestEmbed(quest, 'new')] });
                    } catch (e) {}
                }
            }

            // NEW: send game alert DMs
            await sendGameAlertDMs(quest);
        }
        
        for (const quest of changes.started) await sendQuestNotification(quest, 'started');
        for (const quest of changes.endingSoon) {
            await sendQuestNotification(quest, 'ending');
            const reminders = state.reminders.get(quest.id || quest.quest_id);
            if (reminders) {
                for (const userId of reminders) {
                    try {
                        const user = await client.users.fetch(userId);
                        const reminderEmbed = new EmbedBuilder()
                            .setColor(0x8b5cf6)
                            .setTitle('⏰ Quest Reminder')
                            .setDescription(`**${qName(quest)}** ends in less than 24 hours!`)
                            .setTimestamp();
                        await user.send({ embeds: [reminderEmbed, buildQuestEmbed(quest, 'reminder')] });
                    } catch (e) {}
                }
            }
        }

        // Auto-save after each poll to keep disk state fresh
        if (changes.added.length > 0 || changes.removed.length > 0) {
            await state.save();
        }

    } catch (error) {
        console.error('❌ Quest poll error:', error.message);
    }
}

async function pollCollectibles() {
    try {
        const data = await api.getCollectibles();
        state.updateCollectibles(data);
    } catch (error) {
        console.error('❌ Collectibles poll error:', error.message);
    }
}

async function pollEffects() {
    try {
        const data = await api.getProfileEffects();
        state.updateEffects(data);
    } catch (error) {
        console.error('❌ Effects poll error:', error.message);
    }
}

// ============================================
// BUTTON INTERACTION HANDLER
// ============================================

client.on('interactionCreate', async interaction => {
    // ── MODAL: link token ──
    if (interaction.isModalSubmit() && interaction.customId === 'link_token_modal') {
        const token  = interaction.fields.getTextInputValue('user_token_input').trim();
        const userId = interaction.user.id;

        try {
            const res = await selfbotGet(token, '/users/@me');
            state.userTokens.set(userId, token);
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Token Berhasil Ditautkan')
                        .setDescription(`Login sebagai **${res.username}** (\`${res.id}\`)\nKetik \`;q\` untuk melihat quest kamu.`)
                ],
            });
        } catch (e) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('❌ Token Tidak Valid')
                        .setDescription('Token yang kamu masukkan salah atau sudah expired.\nCoba ambil token yang baru.')
                ],
            });
        }
        return;
    }

    // ── BUTTON: buka modal token ──
    if (interaction.isButton() && interaction.customId === 'open_link_modal') {
        const modal = new ModalBuilder()
            .setCustomId('link_token_modal')
            .setTitle('🔑 Masukkan Discord Token');

        const tokenInput = new TextInputBuilder()
            .setCustomId('user_token_input')
            .setLabel('Discord User Token')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Paste token kamu di sini...')
            .setRequired(true)
            .setMinLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
        await interaction.showModal(modal);
        return;
    }

    // ── BUTTON: unlink ──
    if (interaction.isButton() && interaction.customId === 'open_unlink_confirm') {
        state.userTokens.delete(interaction.user.id);
        state.userTokens.delete(interaction.user.id + '_questcache');
        state.userTokens.delete(interaction.user.id + '_activecache');
        state.userTokens.delete(interaction.user.id + '_monitorpage');
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setDescription('🗑 Token berhasil dihapus dari memory.')
            ],
        });
        return;
    }

    // ── BUTTON: start quest (monitor) ──
    if (interaction.isButton() && interaction.customId.startsWith('qstart_')) {
        const questId = interaction.customId.replace('qstart_', '');
        const userId = interaction.user.id;
        const userToken = state.userTokens.get(userId);
        const cachedQuests = state.userTokens.get(userId + '_questcache') || [];
        const quest = cachedQuests.find(q => q.id === questId);

        if (!userToken) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Kamu belum link token. Ketik `;link` dulu!')],
                ephemeral: true
            });
        }
        if (!quest) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Quest tidak ditemukan. Ketik `;q` ulang.')],
                ephemeral: true
            });
        }

        const key = userId + '_' + questId;
        if (state.monitorSessions.has(key)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('▶️ Quest ini sudah sedang berjalan!')],
                ephemeral: true
            });
        }

        await startMonitor(userId, quest, 'normal');
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setDescription(`▶️ **${quest.config?.messages?.quest_name?.trim() || questId}** mulai dimonitor.`)
            ],
            ephemeral: true
        });
        setTimeout(() => refreshMonitorMessage(interaction.message, userId), 2000);
        return;
    }

    // ── BUTTON: stop quest ──
    if (interaction.isButton() && interaction.customId.startsWith('qstop_')) {
        const questId = interaction.customId.replace('qstop_', '');
        const userId = interaction.user.id;
        stopMonitor(userId, questId);
        await interaction.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹ Monitoring dihentikan.')],
            ephemeral: true
        });
        setTimeout(() => refreshMonitorMessage(interaction.message, userId), 1000);
        return;
    }

    // ── BUTTON: ganti speed ──
    if (interaction.isButton() && interaction.customId.startsWith('qspeed_')) {
        const parts   = interaction.customId.split('_');
        const speed   = parts[1];
        const questId = parts.slice(2).join('_');
        const userId  = interaction.user.id;
        const key     = userId + '_' + questId;
        const session = state.monitorSessions.get(key);

        if (session) {
            session.stopped = true;
            state.monitorSessions.delete(key);
            await new Promise(r => setTimeout(r, 400));
            const cachedQuests = state.userTokens.get(userId + '_questcache') || [];
            const quest = cachedQuests.find(q => q.id === questId);
            if (quest) await startMonitor(userId, quest, speed);
        }

        await interaction.reply({
            embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`⚡ Speed diubah ke **${speed.toUpperCase()}**.`)],
            ephemeral: true
        });
        setTimeout(() => refreshMonitorMessage(interaction.message, userId), 1200);
        return;
    }

    // ── BUTTON: enroll quest ──
    if (interaction.isButton() && interaction.customId.startsWith('qenroll_')) {
        const questId      = interaction.customId.replace('qenroll_', '');
        const userId       = interaction.user.id;
        const userToken    = state.userTokens.get(userId);
        const cachedQuests = state.userTokens.get(userId + '_questcache') || [];
        const quest        = cachedQuests.find(q => q.id === questId);

        if (!userToken || !quest) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Token atau quest tidak ditemukan.')],
                ephemeral: true
            });
        }

        try {
            const res = await enrollQuest(userToken, questId);
            quest.user_status = res;
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57F287)
                        .setDescription(`✅ Berhasil enroll ke **${quest.config?.messages?.quest_name?.trim() || questId}**!`)
                ],
                ephemeral: true
            });
            setTimeout(() => refreshMonitorMessage(interaction.message, userId), 1000);
        } catch (e) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xED4245)
                        .setDescription(`❌ Gagal enroll: ${e?.response?.data?.message || e.message}`)
                ],
                ephemeral: true
            });
        }
        return;
    }

    // ── BUTTON: pagination ──
    if (interaction.isButton() && interaction.customId.startsWith('qpage_')) {
        const parts = interaction.customId.split('_');
        const action = parts[1]; // prev, next, info, atau refresh
        const userId = parts[2];
        
        if (userId !== interaction.user.id) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Access Denied')
                .setDescription('Ini bukan monitor kamu!')
                .setFooter({ text: 'Kamu hanya bisa berinteraksi dengan monitor milikmu' })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const activeQuests = state.userTokens.get(userId + '_activecache') || [];
        let page = state.userTokens.get(userId + '_monitorpage') || 0;

        if (action === 'prev') page = Math.max(0, page - 1);
        else if (action === 'next') page = Math.min(activeQuests.length - 1, page + 1);
        else if (action === 'refresh') {
            await refreshMonitorMessage(interaction.message, userId);
            return interaction.deferUpdate();
        }

        state.userTokens.set(userId + '_monitorpage', page);
        await refreshMonitorMessage(interaction.message, userId);
        return interaction.deferUpdate();
    }

    // ═══════════════════════════════════════════════════════════════════
    // SELECT MENU: Quest Selection (like Questor's dropdown)
    // ═══════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('qselect_')) {
        const userId = interaction.customId.replace('qselect_', '');
        
        if (userId !== interaction.user.id) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Access Denied')
                .setDescription('Ini bukan monitor kamu!')
                .setFooter({ text: 'Kamu hanya bisa berinteraksi dengan monitor milikmu' })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const selectedQuestId = interaction.values[0];
        const activeQuests = state.userTokens.get(userId + '_activecache') || [];
        
        // Find the selected quest index
        const newPage = activeQuests.findIndex(q => q.id === selectedQuestId);
        if (newPage === -1) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Quest tidak ditemukan.')],
                ephemeral: true
            });
        }

        // Update page and refresh
        state.userTokens.set(userId + '_monitorpage', newPage);
        await refreshMonitorMessage(interaction.message, userId);
        return interaction.deferUpdate();
    }

    // ── SLASH COMMAND HANDLER ──
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('remind_')) {
            const questId = interaction.customId.replace('remind_', '');
            const quest = state.quests.get(questId);
            if (!quest) {
                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('❌ Quest Not Found')
                    .setDescription('Quest tidak ditemukan.')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const reminders = state.reminders.get(questId) || new Set();
            if (reminders.has(interaction.user.id)) {
                const embed = new EmbedBuilder()
                    .setColor(0x22c55e)
                    .setTitle('✅ Reminder Already Set')
                    .setDescription('You already have a reminder set for this quest!')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            reminders.add(interaction.user.id);
            state.reminders.set(questId, reminders);
            await state.save();
            const embed = new EmbedBuilder()
                .setColor(0x8b5cf6)
                .setTitle('⏰ Reminder Set')
                .setDescription(`I'll DM you when **${qName(quest)}** is ending soon.`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    state.stats.commandsUsed++;
    
    try {
        switch (interaction.commandName) {
            case 'quests': await handleQuests(interaction); break;
            case 'quest': await handleQuestSearch(interaction); break;
            case 'questinfo': await handleQuestById(interaction); break;
            case 'questbygame': await handleQuestByGame(interaction); break;
            case 'questbyregion': await handleQuestByRegion(interaction); break;
            case 'questbyreward': await handleQuestByReward(interaction); break;
            case 'track': await handleTrack(interaction); break;
            case 'untrack': await handleUntrack(interaction); break;
            case 'mytracks': await handleMyTracks(interaction); break;
            case 'remindme': await handleRemindMe(interaction); break;
            case 'endingsoon': await handleEndingSoon(interaction); break;
            case 'upcoming': await handleUpcoming(interaction); break;
            case 'crossplatform': await handleCrossPlatform(interaction); break;
            case 'mobileonly': await handleMobileOnly(interaction); break;
            case 'pconly': await handlePCOnly(interaction); break;
            case 'collectibles': await handleCollectibles(interaction); break;
            case 'profileeffects': await handleProfileEffects(interaction); break;
            case 'shop': await handleShop(interaction); break;
            case 'iteminfo': await handleItemInfo(interaction); break;
            case 'regions': await handleRegions(interaction); break;
            case 'myregion': await handleMyRegion(interaction); break;
            case 'checkavailability': await handleCheckAvailability(interaction); break;
            case 'history': await handleHistory(interaction); break;
            case 'queststats': await handleQuestStats(interaction); break;
            case 'botstats': await handleBotStats(interaction); break;
            case 'compare': await handleCompare(interaction); break;
            case 'randomquest': await handleRandomQuest(interaction); break;
            case 'questoftheday': await handleQuestOfTheDay(interaction); break;
            case 'notifychannel': await handleNotifyChannel(interaction); break;
            case 'notifyrole': await handleNotifyRole(interaction); break;
            case 'help': await handleHelp(interaction); break;
            case 'ping': await handlePing(interaction); break;
            case 'settings': await handleSettings(interaction); break;
            case 'subscribe': await handleSubscribe(interaction); break;
            case 'unsubscribe': await handleUnsubscribe(interaction); break;
            // NEW
            case 'leaderboard': await handleLeaderboard(interaction); break;
            case 'questalert': await handleQuestAlert(interaction); break;
            case 'myalerts': await handleMyAlerts(interaction); break;
            case 'removealert': await handleRemoveAlert(interaction); break;
            case 'clearalerts': await handleClearAlerts(interaction); break;
            case 'forcepoll': await handleForcePoll(interaction); break;
            case 'autocomplete': await handleAutoComplete(interaction); break;
            case 'myquestprogress': await handleMyQuestProgress(interaction); break;
            default: 
                const unknownEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('❓ Unknown Command')
                    .setDescription('That command is not recognized.')
                    .setFooter({ text: 'Use /help to see available commands' })
                    .setTimestamp();
                await interaction.reply({ embeds: [unknownEmbed] });
                break;
        }
    } catch (error) {
        console.error('❌ Command error:', error);
        const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
        const errorEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ An Error Occurred')
            .setDescription('Something went wrong while processing your command.')
            .setFooter({ text: 'Please try again later' })
            .setTimestamp();
        await interaction[method]({ embeds: [errorEmbed] }).catch(() => {});
    }
});

// ============================================
// MESSAGE CREATE (PREFIX COMMANDS)
// ============================================

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(';')) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (cmd === 'link') {
        await handleLinkCommand(message);
    } else if (cmd === 'q') {
        await handleQCommand(message);
    } else if (cmd === 'unlink') {
        const userId = message.author.id;
        state.userTokens.delete(userId);
        state.userTokens.delete(userId + '_questcache');
        state.userTokens.delete(userId + '_activecache');
        state.userTokens.delete(userId + '_monitorpage');
        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Token Dihapus')
                    .setDescription('Token kamu berhasil dihapus dari memory.')
                    .setFooter({ text: 'Bot Quest Monitor' })
            ]
        });
    }
});

// ============================================
// EVENT HANDLERS
// ============================================

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    await state.load();
    
    client.user.setPresence({
        activities: [{ name: `${state.quests.size} quests | /help`, type: ActivityType.Watching }],
        status: 'online'
    });
    
    try {
        await client.application.commands.set(commands);
        console.log(`📋 ${commands.length} slash commands registered`);
    } catch (error) {
        console.error('❌ Command registration failed:', error);
    }
    
    await pollQuests();
    await pollCollectibles();
    await pollEffects();
    
    setInterval(pollQuests, CONFIG.POLL_QUESTS);
    setInterval(pollCollectibles, CONFIG.POLL_COLLECTIBLES);
    setInterval(pollEffects, CONFIG.POLL_EFFECTS);
    
    setInterval(() => {
        client.user.setPresence({
            activities: [{ name: `${state.getActiveQuests().length} active | /help`, type: ActivityType.Watching }],
            status: 'online'
        });
    }, 60000);
    
    console.log('🚀 Realtime polling active!');
});

// ============================================
// ERROR HANDLING & SHUTDOWN
// ============================================
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
process.on('uncaughtException', async error => {
    console.error('Uncaught exception:', error);
    // Save state before crash
    try { await state.save(); } catch {}
    client.destroy();
    process.exit(1);
});

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await state.save();
    await client.destroy();
    process.exit(0);
});

client.login(CONFIG.TOKEN);