const { EmbedBuilder } = require('discord.js');
const { COLOR_PALETTE } = require('../config');

function createErrorEmbed(title, description, footer = null) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_PALETTE.error)
        .setTitle(title || 'Error')
        .setDescription(description || 'An error occurred.')
        .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    return embed;
}

function createSuccessEmbed(title, description, footer = null) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_PALETTE.success)
        .setTitle(title || 'Success')
        .setDescription(description || 'Operation completed.')
        .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    return embed;
}

function createInfoEmbed(title, description, footer = null) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_PALETTE.info)
        .setTitle(title || 'Info')
        .setDescription(description || '')
        .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    return embed;
}

function createWarningEmbed(title, description, footer = null) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_PALETTE.warning)
        .setTitle(title || 'Warning')
        .setDescription(description || '')
        .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    return embed;
}

async function safeReply(interaction, payload, ephemeral = false) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
        }
        if (ephemeral) {
            return await interaction.reply({ ...payload, ephemeral: true });
        }
        return await interaction.reply(payload);
    } catch (e) {
        console.error('safeReply failed:', e.message);
    }
}

function makeProgressBar(percent, length = 10) {
    const filled = Math.round(percent / (100 / length));
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createWarningEmbed,
    safeReply,
    makeProgressBar,
};
