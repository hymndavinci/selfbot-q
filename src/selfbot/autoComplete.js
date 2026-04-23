const { fetchUserQuests, enrollQuest, postVideoProgress, postHeartbeat } = require('./discordAPI');
const { detectTaskType, filterValidQuests } = require('../utils/questHelpers');

async function doVideoQuest(userToken, quest, onProgress) {
    const taskName = detectTaskType(quest);
    const secondsNeeded = quest.config.task_config.tasks[taskName].target;
    const enrolledAt = new Date(quest.user_status?.enrolled_at).getTime();

    let secondsDone = quest.user_status?.progress?.[taskName]?.value ?? 0;
    const maxFuture = 10, speed = 7, interval = 1;

    while (true) {
        const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
        const diff = maxAllowed - secondsDone;
        const timestamp = secondsDone + speed;

        if (diff >= speed) {
            const res = await postVideoProgress(userToken, quest.id, Math.min(secondsNeeded, timestamp + Math.random()));
            secondsDone = Math.min(secondsNeeded, timestamp);
            if (onProgress) onProgress(secondsDone, secondsNeeded);
            if (res.completed_at != null) break;
        }

        if (timestamp >= secondsNeeded) break;
        await new Promise(r => setTimeout(r, interval * 1000));
    }

    // Final progress post
    await postVideoProgress(userToken, quest.id, secondsNeeded);
}

async function doPlayQuest(userToken, quest, onProgress) {
    const taskName = 'PLAY_ON_DESKTOP';
    const secondsNeeded = quest.config.task_config.tasks[taskName].target;
    const interval = 60;
    const appId = quest.config.application.id;

    while (true) {
        const res = await postHeartbeat(userToken, quest.id, appId, false);
        // update local quest user_status
        quest.user_status = res;
        const secondsDone = res?.progress?.[taskName]?.value ?? 0;
        if (onProgress) onProgress(secondsDone, secondsNeeded);

        if (res?.completed_at != null) break;
        if (secondsDone >= secondsNeeded) break;
        await new Promise(r => setTimeout(r, interval * 1000));
    }

    // terminal heartbeat
    await postHeartbeat(userToken, quest.id, appId, true);
}

async function runAutoComplete(userToken, statusCallback) {
    const raw = await fetchUserQuests(userToken);
    const valid = filterValidQuests(raw);

    if (valid.length === 0) return { success: [], failed: [], skipped: [] };

    const results = { success: [], failed: [], skipped: [] };

    for (const quest of valid) {
        const questName = quest.config?.messages?.quest_name || quest.id;
        const taskType = detectTaskType(quest);

        if (!taskType) {
            results.skipped.push({ name: questName, reason: 'Unknown task type' });
            continue;
        }

        if (taskType === 'STREAM_ON_DESKTOP' || taskType === 'PLAY_ACTIVITY') {
            results.skipped.push({ name: questName, reason: `${taskType} not supported` });
            continue;
        }

        try {
            // Enroll kalau belum
            if (!quest.user_status?.enrolled_at) {
                if (statusCallback) statusCallback(questName, 'Enrolling...');
                const enrollRes = await enrollQuest(userToken, quest.id);
                quest.user_status = enrollRes;
            }

            const rewardName = quest.config?.rewards_config?.rewards?.[0]?.messages?.name ||
                               `${quest.config?.rewards_config?.rewards?.[0]?.orb_quantity || '?'} Orbs`;
            const secondsNeeded = quest.config.task_config.tasks[taskType].target;

            if (statusCallback) statusCallback(questName, `Running (${taskType})...`);

            if (taskType === 'WATCH_VIDEO' || taskType === 'WATCH_VIDEO_ON_MOBILE') {
                await doVideoQuest(userToken, quest, (done, total) => {
                    if (statusCallback) statusCallback(questName, `Video: ${done}/${total}s`);
                });
            } else if (taskType === 'PLAY_ON_DESKTOP') {
                await doPlayQuest(userToken, quest, (done, total) => {
                    if (statusCallback) statusCallback(questName, `Play: ${Math.floor(done/60)}/${Math.ceil(total/60)} min`);
                });
            }

            results.success.push({ name: questName, reward: rewardName, type: taskType });
        } catch (err) {
            results.failed.push({ name: questName, reason: err?.response?.data?.message || err.message });
        }
    }

    return results;
}

module.exports = {
    doVideoQuest,
    doPlayQuest,
    runAutoComplete,
};
