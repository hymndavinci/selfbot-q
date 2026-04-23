const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { CANVAS_DIMS, COLOR_PALETTE } = require('../config');
const { detectTaskType } = require('../utils/questHelpers');
const { roundRect, drawModernBadge, drawProgressBar } = require('./utils');

const CW = CANVAS_DIMS.width;
const CH = CANVAS_DIMS.height;

const colors = {
    bg: '#18181b',
    bgCard: '#1e1e24',
    bgElevated: '#27272a',
    accentPurple: COLOR_PALETTE.purple.toString(16).padStart(6, '0'),
    accentPink: COLOR_PALETTE.pink.toString(16).padStart(6, '0'),
    accentGreen: COLOR_PALETTE.success.toString(16).padStart(6, '0'),
    accentOrange: COLOR_PALETTE.warning.toString(16).padStart(6, '0'),
    accentRed: COLOR_PALETTE.error.toString(16).padStart(6, '0'),
    accentCyan: COLOR_PALETTE.info.toString(16).padStart(6, '0'),
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    border: '#3f3f46',
};

async function generateQuestCardImage(quest, session = null, allQuests = []) {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');

    const cfg = quest.config;
    const taskType = detectTaskType(quest);
    const isRunning = Boolean(session);
    const enrolled = Boolean(quest.user_status?.enrolled_at);
    const completed = Boolean(quest.user_status?.completed_at);

    let prog = 0, target = 0, pct = 0;
    if (taskType && quest.user_status?.progress?.[taskType]) {
        prog = quest.user_status.progress[taskType].value ?? 0;
        target = cfg?.task_config?.tasks?.[taskType]?.target ?? 0;
        pct = target > 0 ? Math.min(100, Math.floor((prog / target) * 100)) : 0;
    }
    const targetMin = Math.ceil(target / 60);
    const progMin = Math.floor(prog / 60);

    const reward = cfg?.rewards_config?.rewards?.[0];
    const orbQty = reward?.orb_quantity || 0;
    const rewardText = orbQty > 0 ? `${orbQty} Orbs` : (reward?.messages?.name || 'Unknown');
    const questName = cfg?.messages?.quest_name || quest.id;
    const gameName = cfg?.messages?.game_title || cfg?.application?.name || 'Unknown Game';

    const expiresAt = cfg?.expires_at ? new Date(cfg.expires_at) : null;
    let timeText = '';
    if (expiresAt) {
        const h = Math.round((expiresAt - Date.now()) / 3600000);
        if (h > 48) timeText = `Expires in ${Math.round(h / 24)} days`;
        else if (h > 0) timeText = `Expires in ${h} hours`;
        else timeText = 'Expired';
    }

    // Status colors
    let statusColor = colors.accentOrange;
    let statusLabel = 'IDLE';
    let statusBg = 'rgba(249, 115, 22, 0.15)';
    if (completed) {
        statusColor = colors.accentGreen;
        statusLabel = 'COMPLETED';
        statusBg = 'rgba(34, 197, 94, 0.15)';
    } else if (isRunning) {
        statusColor = colors.accentGreen;
        statusLabel = 'RUNNING';
        statusBg = 'rgba(34, 197, 94, 0.15)';
    } else if (enrolled) {
        statusColor = colors.accentCyan;
        statusLabel = 'ENROLLED';
        statusBg = 'rgba(6, 182, 212, 0.15)';
    }

    // Left border indicator
    ctx.fillStyle = statusColor;
    ctx.fillRect(0, 0, 4, CH);

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(4, 0, CW - 4, CH);

    // Subtle gradient overlay
    const bgGrad = ctx.createLinearGradient(0, 0, CW, CH);
    bgGrad.addColorStop(0, 'rgba(139, 92, 246, 0.03)');
    bgGrad.addColorStop(1, 'rgba(236, 72, 153, 0.03)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(4, 0, CW - 4, CH);

    // HERO BANNER SECTION (y: 0-160)
    const bannerHeight = 160;

    let bannerLoaded = false;
    try {
        const asset = cfg?.assets?.hero || cfg?.assets?.quest_bar_hero;
        if (asset) {
            const img = await loadImage(`https://cdn.discordapp.com/${asset}`);
            ctx.save();
            ctx.beginPath();
            ctx.rect(4, 0, CW - 4, bannerHeight);
            ctx.clip();
            const scale = CW / img.width;
            const drawHeight = img.height * scale;
            const yOffset = (bannerHeight - drawHeight) / 2;
            ctx.drawImage(img, 4, yOffset, CW - 4, drawHeight);
            ctx.restore();
            bannerLoaded = true;
        }
    } catch (_) {}

    if (!bannerLoaded) {
        const fallbackGrad = ctx.createLinearGradient(4, 0, CW, bannerHeight);
        fallbackGrad.addColorStop(0, '#3b1f6e');
        fallbackGrad.addColorStop(0.5, '#1e1040');
        fallbackGrad.addColorStop(1, '#0f0820');
        ctx.fillStyle = fallbackGrad;
        ctx.fillRect(4, 0, CW - 4, bannerHeight);
    }

    // Dark overlay
    const overlayGrad = ctx.createLinearGradient(4, 0, 4, bannerHeight);
    overlayGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
    overlayGrad.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    overlayGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(4, 0, CW - 4, bannerHeight);

    // Text shadow helper
    function drawTextWithShadow(text, x, y, font, color) {
        ctx.font = font;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
    }

    // Badges
    drawModernBadge(ctx, 'ORB QUEST', 24, 16, {
        colors,
        bg: 'rgba(249, 115, 22, 0.9)',
        glow: true,
    });
    drawModernBadge(ctx, statusLabel, CW - 20, 16, {
        colors,
        align: 'right',
        bg: statusColor,
        glow: isRunning || completed,
    });

    // Game name
    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(gameName.toUpperCase(), 24, bannerHeight - 50);

    // Quest name
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#ffffff';
    let displayName = questName;
    while (ctx.measureText(displayName).width > CW - 48 && displayName.length > 10) {
        displayName = displayName.slice(0, -4) + '...';
    }
    drawTextWithShadow(displayName, 24, bannerHeight - 22, 'bold 28px sans-serif', '#ffffff');

    // INFO SECTION
    const infoY = bannerHeight;
    const infoH = 100;

    ctx.fillStyle = colors.bgCard;
    ctx.fillRect(4, infoY, CW - 4, infoH);

    // Left: Reward icon circle
    const iconR = 32;
    const iconX = 34 + iconR;
    const iconY = infoY + infoH / 2;

    const ringGrad = ctx.createRadialGradient(iconX, iconY, iconR - 4, iconX, iconY, iconR + 2);
    ringGrad.addColorStop(0, colors.bgElevated);
    ringGrad.addColorStop(1, `#${colors.accentPurple}`);
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.fill();

    let iconLoaded = false;
    try {
        const ra = reward?.asset;
        if (ra) {
            const img = await loadImage(`https://cdn.discordapp.com/${ra.replace(/\.mp4$/, '.png')}`);
            ctx.save();
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR - 4, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, iconX - iconR + 4, iconY - iconR + 4, (iconR - 4) * 2, (iconR - 4) * 2);
            ctx.restore();
            iconLoaded = true;
        }
    } catch (_) {}

    if (!iconLoaded) {
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = `#${colors.accentPurple}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(orbQty > 0 ? '◉' : '?', iconX, iconY);
    }

    // Middle: Quest details
    const textX = iconX + iconR + 20;

    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `#${colors.accentGreen}`;
    ctx.fillText(rewardText, textX, infoY + 30);

    const taskLabel = taskType ? taskType.replace(/_/g, ' ').toUpperCase() : 'MANUAL';
    ctx.font = 'bold 11px sans-serif';
    const taskW = ctx.measureText(taskLabel).width + 16;
    const taskH = 22;
    ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
    ctx.strokeStyle = `#${colors.accentPurple}`;
    ctx.lineWidth = 1;
    roundRect(ctx, textX, infoY + 48, taskW, taskH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `#${colors.accentPurple}`;
    ctx.textAlign = 'center';
    ctx.fillText(taskLabel, textX + taskW / 2, infoY + 48 + taskH / 2);

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.textMuted;
    ctx.fillText(timeText, textX, infoY + 85);

    // Right: Progress circle
    const circleX = CW - 80;
    const circleY = infoY + infoH / 2;
    const circleR = 35;
    const lineW = 6;

    ctx.beginPath();
    ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
    ctx.strokeStyle = colors.bgElevated;
    ctx.lineWidth = lineW;
    ctx.stroke();

    if (pct > 0) {
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (pct / 100) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(circleX, circleY, circleR, startAngle, endAngle);
        ctx.strokeStyle = completed ? `#${colors.accentGreen}` : `#${colors.accentPurple}`;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = colors.textPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, circleX, circleY);

    // PROGRESS BAR SECTION
    const progressY = infoY + infoH;
    const progressH = CH - progressY;

    ctx.fillStyle = colors.bgElevated;
    ctx.fillRect(4, progressY, CW - 4, progressH);

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, progressY);
    ctx.lineTo(CW, progressY);
    ctx.stroke();

    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.textSecondary;
    ctx.fillText('Progress', 24, progressY + 25);

    ctx.textAlign = 'right';
    ctx.fillStyle = pct === 100 ? `#${colors.accentGreen}` : `#${colors.accentPurple}`;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${pct}%`, CW - 20, progressY + 25);

    // Draw progress bar
    drawProgressBar(ctx, 24, progressY + 42, CW - 48, 10, pct, {
        trackColor: colors.bg,
        fillStart: `#${colors.accentPurple}`,
        fillEnd: `#${colors.accentPink}`,
        glow: true,
    });

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.textMuted;
    const timeStr = targetMin > 0 ? `${progMin} / ${targetMin} min` : `${prog} / ${target} sec`;
    ctx.fillText(timeStr, 24, progressY + 42 + 10 + 16);

    if (allQuests.length > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(`Quest ${allQuests.indexOf(quest) + 1} of ${allQuests.length}`, CW - 20, progressY + 42 + 10 + 16);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateQuestCardImage };
