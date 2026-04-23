const { CONFIG } = require('../config');
const fs = require('fs').promises;

class QuestState {
    constructor() {
        this.quests = new Map();
        this.collectibles = new Map();
        this.effects = new Map();
        this.messageMap = new Map();
        this.userPrefs = new Map();
        this.guildSettings = new Map();
        this.reminders = new Map();
        this.gameAlerts = new Map();
        this.userTokens = new Map();
        this.monitorSessions = new Map();
        this.isReady = false;
        this.lastError = null;
        this.stats = {
            commandsUsed: 0,
            notificationsSent: 0,
            startTime: Date.now(),
        };
        this._savePromise = null;
    }

    async load() {
        try {
            const data = await fs.readFile(CONFIG.DATA_FILE, 'utf8');
            const parsed = JSON.parse(data);
            this.userPrefs = new Map(Object.entries(parsed.userPrefs || {}));
            this.guildSettings = new Map(Object.entries(parsed.guildSettings || {}));
            this.reminders = new Map(Object.entries(parsed.reminders || {}).map(([k, v]) => [k, new Set(v)]));
            this.gameAlerts = new Map(Object.entries(parsed.gameAlerts || {}).map(([k, v]) => [k, new Set(v)]));
            this.stats = parsed.stats || this.stats;
            this.quests = new Map(Object.entries(parsed.quests || {}));
            console.log(`Data loaded (${this.quests.size} quests cached)`);
        } catch {
            console.log('No previous data, starting fresh');
        }
    }

    async _performSave() {
        const data = {
            userPrefs: Object.fromEntries(this.userPrefs),
            guildSettings: Object.fromEntries(this.guildSettings),
            reminders: Object.fromEntries(Array.from(this.reminders).map(([k, v]) => [k, Array.from(v)])),
            gameAlerts: Object.fromEntries(Array.from(this.gameAlerts).map(([k, v]) => [k, Array.from(v)])),
            stats: this.stats,
            quests: Object.fromEntries(this.quests),
        };
        await fs.writeFile(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
    }

    async save() {
        if (this._savePromise) {
            return this._savePromise;
        }
        this._savePromise = this._performSave().finally(() => {
            this._savePromise = null;
        });
        return this._savePromise;
    }

    sanitize(obj) {
        const { _trackedAt, _endingNotified, ...clean } = obj;
        return clean;
    }

    updateQuests(newQuests) {
        const changes = { added: [], updated: [], removed: [], endingSoon: [], started: [] };
        const now = Date.now();
        const newIds = new Set();

        for (const quest of newQuests) {
            const id = quest.id || quest.quest_id;
            if (!id) continue;
            newIds.add(id);

            const old = this.quests.get(id);
            if (!old) {
                this.quests.set(id, { ...quest, _trackedAt: now });
                changes.added.push(quest);
                const startTime = quest.starts_at ? new Date(quest.starts_at).getTime() : 0;
                if (startTime <= now) changes.started.push(quest);
            } else {
                const oldStr = JSON.stringify(this.sanitize(old));
                const newStr = JSON.stringify(this.sanitize(quest));
                if (oldStr !== newStr) {
                    this.quests.set(id, { ...quest, _trackedAt: old._trackedAt || now });
                    changes.updated.push({ old, new: quest });
                }
                const endTime = quest.ends_at ? new Date(quest.ends_at).getTime() : Infinity;
                const hoursLeft = (endTime - now) / (1000 * 60 * 60);
                if (hoursLeft <= 24 && hoursLeft > 0 && !old._endingNotified) {
                    quest._endingNotified = true;
                    this.quests.set(id, { ...this.quests.get(id), _endingNotified: true });
                    changes.endingSoon.push(quest);
                }
            }
        }

        for (const [id, quest] of this.quests) {
            if (!newIds.has(id)) {
                changes.removed.push(quest);
                this.quests.delete(id);
                this.messageMap.delete(id);
                this.reminders.delete(id);
            }
        }

        return changes;
    }

    updateCollectibles(newItems) {
        const added = [];
        for (const item of newItems) {
            const id = item.id || item.sku_id;
            if (id && !this.collectibles.has(id)) {
                this.collectibles.set(id, item);
                added.push(item);
            }
        }
        return added;
    }

    updateEffects(newEffects) {
        const added = [];
        for (const effect of newEffects) {
            const id = effect.id || effect.sku_id;
            if (id && !this.effects.has(id)) {
                this.effects.set(id, effect);
                added.push(effect);
            }
        }
        return added;
    }

    getActiveQuests() {
        const now = Date.now();
        return Array.from(this.quests.values()).filter(q => {
            const start = q.starts_at ? new Date(q.starts_at).getTime() : 0;
            const end = q.ends_at ? new Date(q.ends_at).getTime() : Infinity;
            return start <= now && end >= now;
        });
    }

    getUpcomingQuests() {
        const now = Date.now();
        return Array.from(this.quests.values())
            .filter(q => (q.starts_at ? new Date(q.starts_at).getTime() : Infinity) > now)
            .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    }

    getEndingSoon(hours = 24) {
        const now = Date.now();
        return Array.from(this.quests.values()).filter(q => {
            const end = q.ends_at ? new Date(q.ends_at).getTime() : Infinity;
            const hoursLeft = (end - now) / (1000 * 60 * 60);
            return hoursLeft > 0 && hoursLeft <= hours;
        });
    }

    getQuestsByGame(gameName) {
        const { qGame } = require('../utils/questHelpers');
        return this.getActiveQuests().filter(q =>
            qGame(q).toLowerCase().includes(gameName.toLowerCase())
        );
    }

    getQuestsByRegion(region) {
        return this.getActiveQuests().filter(q =>
            q.regions?.includes(region.toUpperCase())
        );
    }

    getQuestsByRewardType(type) {
        return this.getActiveQuests().filter(q =>
            q.rewards?.some(r => (r.type || '').toLowerCase() === type.toLowerCase())
        );
    }

    getQuestHistory() {
        return Array.from(this.quests.values()).sort((a, b) => (b._trackedAt || 0) - (a._trackedAt || 0));
    }

    getLeaderboard() {
        const entries = [];
        for (const [userId, prefs] of this.userPrefs) {
            if (prefs.tracked?.length > 0) {
                entries.push({ userId, count: prefs.tracked.length });
            }
        }
        return entries.sort((a, b) => b.count - a.count).slice(0, 10);
    }

    addGameAlert(userId, gameName) {
        const alerts = this.gameAlerts.get(userId) || new Set();
        alerts.add(gameName.toLowerCase());
        this.gameAlerts.set(userId, alerts);
    }

    removeGameAlert(userId, gameName) {
        const alerts = this.gameAlerts.get(userId);
        if (alerts) alerts.delete(gameName.toLowerCase());
    }

    clearGameAlerts(userId) {
        this.gameAlerts.delete(userId);
    }

    getGameAlertsForUser(userId) {
        return this.gameAlerts.get(userId) || new Set();
    }

    getUsersAlertedForGame(gameName) {
        const users = [];
        for (const [userId, games] of this.gameAlerts) {
            if (games.has(gameName.toLowerCase())) {
                users.push(userId);
            }
        }
        return users;
    }
}

const state = new QuestState();
module.exports = { state, QuestState };
