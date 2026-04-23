const axios = require('axios');
const { CONFIG } = require('../config');
const { state } = require('../core/state');

class APIClient {
    constructor() {
        this.client = axios.create({
            baseURL: CONFIG.API_BASE,
            timeout: 15000,
            headers: { 'Accept': 'application/json', 'User-Agent': 'DiscordQuestBot/4.0' },
        });
    }

    async fetch(endpoint, retries = 0) {
        try {
            const response = await this.client.get(endpoint);
            state.lastError = null;
            return response.data;
        } catch (error) {
            if (retries < CONFIG.MAX_RETRIES) {
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * (retries + 1)));
                return this.fetch(endpoint, retries + 1);
            }
            state.lastError = error.message;
            throw error;
        }
    }

    async getQuests() { return this.fetch('/api/quests'); }
    async getRegions() { return this.fetch('/api/regions'); }
    async getCollectibles() { return this.fetch('/api/collectibles'); }
    async getProfileEffects() { return this.fetch('/api/profile-effects'); }
    async getChangelogs() { return this.fetch('/api/changelogs'); }
}

const api = new APIClient();
module.exports = { api, APIClient };
