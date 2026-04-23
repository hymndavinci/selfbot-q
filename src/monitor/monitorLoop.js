const { doVideoQuest, doPlayQuest } = require('../selfbot');
const { detectTaskType } = require('../utils/questHelpers');
const { SPEED_CONFIG } = require('../config');

async function runMonitorLoop(userId, quest, session, userToken) {
    const { state } = require('../core/state');
    const key = userId + '_' + quest.id;
    const taskType = detectTaskType(quest);
    const cfg = SPEED_CONFIG[session.speed] || SPEED_CONFIG.normal;

    try {
        if (taskType === 'WATCH_VIDEO' || taskType === 'WATCH_VIDEO_ON_MOBILE') {
            await doVideoQuest(userToken, quest, (done, total) => {
                // Update session progress
                session.progress = { done, total };
                state.monitorSessions.set(key, session);
            });
        } else if (taskType === 'PLAY_ON_DESKTOP') {
            await doPlayQuest(userToken, quest, (done, total) => {
                // Update session progress
                session.progress = { done, total };
                state.monitorSessions.set(key, session);
            });
        }

        // Mark as completed
        session.completed = true;
        session.stopped = true;
        state.monitorSessions.set(key, session);
        
    } catch (error) {
        console.error(`Monitor loop error for ${quest.id}:`, error.message);
        session.stopped = true;
        session.error = error.message;
        state.monitorSessions.set(key, session);
    }
}

module.exports = {
    runMonitorLoop,
};
