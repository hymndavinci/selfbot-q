/**
 * Helper: roundRect path (canvas doesn't always have ctx.roundRect in older versions)
 */
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawModernBadge(ctx, text, x, y, opts = {}) {
    const colors = opts.colors || {};
    const { align = 'left', bg = colors.accentPurple || '#8b5cf6', color = '#fff', glow = false } = opts;
    ctx.font = 'bold 12px sans-serif';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const padX = 14, padY = 8;
    const bw = tw + padX * 2, bh = 28, br = 6;
    const bx = align === 'right' ? x - bw : x;
    const by = y;

    if (glow) {
        ctx.save();
        ctx.shadowColor = bg;
        ctx.shadowBlur = 6;
        ctx.fillStyle = bg;
        roundRect(ctx, bx, by, bw, bh, br);
        ctx.fill();
        ctx.restore();
    } else {
        ctx.fillStyle = bg;
        roundRect(ctx, bx, by, bw, bh, br);
        ctx.fill();
    }

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, bx + bw / 2, by + bh / 2);
}

function drawProgressBar(ctx, x, y, w, h, percent, opts = {}) {
    const { trackColor = '#27272a', fillStart = '#8b5cf6', fillEnd = '#ec4899', glow = true } = opts;
    const radius = h / 2;

    // Track
    ctx.fillStyle = trackColor;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // Fill
    if (percent > 0) {
        const fillW = Math.max(h, (percent / 100) * w);
        const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
        grad.addColorStop(0, fillStart);
        grad.addColorStop(1, fillEnd);
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, fillW, h, radius);
        ctx.fill();

        if (glow && percent < 100) {
            ctx.save();
            ctx.shadowColor = fillStart;
            ctx.shadowBlur = 6;
            ctx.fillStyle = fillStart;
            ctx.beginPath();
            ctx.arc(x + fillW - radius, y + h / 2, radius - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

module.exports = { roundRect, drawModernBadge, drawProgressBar };
