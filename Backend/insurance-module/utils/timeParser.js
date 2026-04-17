function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeToken(token = '') {
    return String(token)
        .trim()
        .toUpperCase()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ');
}

function parseTimeToken(token = '') {
    const normalized = normalizeToken(token);
    const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3] || null;

    if (!Number.isInteger(hour) || hour < 0 || hour > 24) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        if (meridiem === 'PM' && hour < 12) hour += 12;
        if (meridiem === 'AM' && hour === 12) hour = 0;
    } else if (hour === 24 && minute === 0) {
        hour = 0;
    }

    if (hour > 23) return null;
    return hour + minute / 60;
}

function parseWorkingHours(input) {
    if (!input || typeof input !== 'string') return null;

    const normalized = input
        .replace(/[–—]/g, '-')
        .replace(/\bTO\b/gi, '-')
        .trim();

    const parts = normalized.split('-').map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) return null;

    const start = parseTimeToken(parts[0]);
    const end = parseTimeToken(parts[1]);
    if (start == null || end == null) return null;

    const startHour = Math.floor(start);
    const endHour = Math.floor(end);
    const isOvernight = end <= start;
    const durationHours = getShiftDurationHours({ start, end, isOvernight });
    const intervals = isOvernight
        ? [
            { start: start, end: 24 },
            { start: 0, end: end }
        ]
        : [{ start, end }];

    return {
        start,
        end,
        startHour,
        endHour,
        isOvernight,
        durationHours: Number(durationHours.toFixed(2)),
        intervals,
        raw: input,
    };
}

function getShiftDurationHours(parsedShift) {
    if (!parsedShift) return 0;
    const start = Number(parsedShift.start);
    const end = Number(parsedShift.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

    let duration = end - start;
    if (duration <= 0) duration += 24;
    return clamp(duration, 0, 24);
}

function getShiftType(parsedShift) {
    if (!parsedShift) return 'UNKNOWN';
    const start = Number(parsedShift.start);
    const end = Number(parsedShift.end);
    const overnight = Boolean(parsedShift.isOvernight);

    const nightOverlap = getOverlapHours({ startHour: start, endHour: end, isOvernight: overnight }, { startHour: 20, endHour: 6, isOvernight: true });

    return nightOverlap >= 3 ? 'NIGHT_SHIFT' : overnight ? 'MIXED_SHIFT' : 'DAY_SHIFT';
}

function getShiftRiskMultiplier(parsedShift) {
    if (!parsedShift) return 1;

    const duration = getShiftDurationHours(parsedShift);
    const shiftType = getShiftType(parsedShift);
    const baseMultiplier = shiftType === 'NIGHT_SHIFT' ? 1.3 : shiftType === 'MIXED_SHIFT' ? 1.15 : 1.0;

    let exposureBoost = 1;
    if (duration >= 12) exposureBoost = 1.2;
    else if (duration >= 10) exposureBoost = 1.12;
    else if (duration >= 8) exposureBoost = 1.05;

    return Number(clamp(baseMultiplier * exposureBoost, 0.9, 1.6).toFixed(3));
}

function toRanges(window) {
    if (Array.isArray(window?.intervals) && window.intervals.length > 0) {
        return window.intervals
            .map((interval) => [Number(interval.start), Number(interval.end)])
            .filter((interval) => Number.isFinite(interval[0]) && Number.isFinite(interval[1]));
    }

    const start = Number(window.startHour);
    const end = Number(window.endHour);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

    if (window.isOvernight || end <= start) {
        return [
            [start, 24],
            [0, end],
        ];
    }

    return [[start, end]];
}

function rangeOverlapHours(rangeA, rangeB) {
    const start = Math.max(rangeA[0], rangeB[0]);
    const end = Math.min(rangeA[1], rangeB[1]);
    return Math.max(0, end - start);
}

function getPeakHoursOverlapHours(parsedShift) {
    if (!parsedShift) return 0;
    const morningPeak = getOverlapHours(parsedShift, { startHour: 8, endHour: 10, isOvernight: false });
    const eveningPeak = getOverlapHours(parsedShift, { startHour: 18, endHour: 21, isOvernight: false });
    return Number(clamp(morningPeak + eveningPeak, 0, 24).toFixed(3));
}

function getOverlapHours(workingWindow, disruptionWindow) {
    const aRanges = toRanges(workingWindow);
    const bRanges = toRanges(disruptionWindow);

    let total = 0;
    for (const rangeA of aRanges) {
        for (const rangeB of bRanges) {
            total += rangeOverlapHours(rangeA, rangeB);
        }
    }

    return Number(clamp(total, 0, 24).toFixed(3));
}

function buildDisruptionWindow({ start, end, durationHours }) {
    if (Number.isFinite(Number(start)) && Number.isFinite(Number(end))) {
        const startHour = clamp(Number(start), 0, 24);
        const endHour = clamp(Number(end), 0, 24);
        return {
            startHour,
            endHour,
            isOvernight: endHour <= startHour,
        };
    }

    const now = new Date();
    const endHour = now.getHours() + now.getMinutes() / 60;
    const duration = clamp(Number(durationHours) || 0, 0, 24);
    let startHour = endHour - duration;
    while (startHour < 0) startHour += 24;

    return {
        startHour: Number(startHour.toFixed(3)),
        endHour: Number(endHour.toFixed(3)),
        isOvernight: duration > 0 && endHour <= startHour,
    };
}

module.exports = {
    parseTimeToken,
    parseWorkingHours,
    getShiftDurationHours,
    getShiftType,
    getShiftRiskMultiplier,
    getOverlapHours,
    getPeakHoursOverlapHours,
    buildDisruptionWindow,
};
