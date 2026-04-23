require('dotenv').config();

const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    NOTIF_CHANNEL_ID: process.env.NOTIF_CHANNEL_ID,
    NOTIF_ROLE_ID: process.env.NOTIF_ROLE_ID,
    API_BASE: 'https://api.discordquest.com',

    POLL_QUESTS: 30000,
    POLL_COLLECTIBLES: 60000,
    POLL_EFFECTS: 60000,
    MAX_RETRIES: 5,
    RETRY_DELAY: 5000,
    DATA_FILE: './bot_data.json',
};

const SPEED_CONFIG = {
    normal: { videoSpeed: 7, playInterval: 60 },
    fast: { videoSpeed: 14, playInterval: 30 },
};

const DISCORD_API = 'https://discord.com/api/v10';

const CLIENT_PROPERTIES = Buffer.from(JSON.stringify({
    os: 'Windows',
    browser: 'Discord Client',
    release_channel: 'stable',
    client_version: '1.0.9215',
    os_version: '10.0.19045',
    os_arch: 'x64',
    app_arch: 'x64',
    system_locale: 'en-US',
    has_client_mods: false,
    browser_version: '37.6.0',
    client_build_number: 471091,
    native_build_number: 72186,
    client_event_source: null,
})).toString('base64');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9215 Chrome/138.0.7204.251 Electron/37.6.0 Safari/537.36';

const COLOR_PALETTE = {
    primary: 0x5865F2,
    success: 0x22c55e,
    warning: 0xf97316,
    error: 0xED4245,
    info: 0x06b6d4,
    gold: 0xFFD700,
    purple: 0x8b5cf6,
    pink: 0xec4899,
};

const CANVAS_DIMS = {
    width: 900,
    height: 340,
    bannerHeight: 160,
    infoHeight: 100,
};

if (!CONFIG.TOKEN) {
    console.error('ERROR: BOT_TOKEN tidak ditemukan di .env!');
    console.error('   Pastikan file .env ada dan isi BOT_TOKEN=token_anda');
    process.exit(1);
}

module.exports = {
    CONFIG,
    SPEED_CONFIG,
    DISCORD_API,
    CLIENT_PROPERTIES,
    USER_AGENT,
    COLOR_PALETTE,
    CANVAS_DIMS,
};
