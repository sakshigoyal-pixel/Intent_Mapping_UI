// Converts seconds (e.g. 70.5) → "01:10"
export const secondsToMMSS = (secs) => {
    if (isNaN(secs) || secs == null) return '00:00';
    const total = Math.round(secs);
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// Converts "01:10" → 70
export const mmssToSeconds = (mmss) => {
    if (!mmss) return 0;
    const parts = String(mmss).trim().split(':');
    if (parts.length === 1) return parseFloat(parts[0]) || 0;
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
};
