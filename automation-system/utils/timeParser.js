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

  const isOvernight = end <= start;
  return {
    startHour: start,
    endHour: end,
    isOvernight,
  };
}

function toRanges(window) {
  const start = Number(window.startHour);
  const end = Number(window.endHour);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  if (window.isOvernight || end <= start) {
    return [[start, 24], [0, end]];
  }

  return [[start, end]];
}

function rangeOverlapHours(rangeA, rangeB) {
  const start = Math.max(rangeA[0], rangeB[0]);
  const end = Math.min(rangeA[1], rangeB[1]);
  return Math.max(0, end - start);
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

function buildDisruptionWindow({ startHour, endHour, durationHours }) {
  if (Number.isFinite(Number(startHour)) && Number.isFinite(Number(endHour))) {
    const start = clamp(Number(startHour), 0, 24);
    const end = clamp(Number(endHour), 0, 24);
    return {
      startHour: start,
      endHour: end,
      isOvernight: end <= start,
    };
  }

  const now = new Date();
  const end = now.getHours() + now.getMinutes() / 60;
  const duration = clamp(Number(durationHours) || 0, 0, 24);
  let start = end - duration;
  while (start < 0) start += 24;

  return {
    startHour: Number(start.toFixed(3)),
    endHour: Number(end.toFixed(3)),
    isOvernight: duration > 0 && end <= start,
  };
}

module.exports = {
  parseTimeToken,
  parseWorkingHours,
  getOverlapHours,
  buildDisruptionWindow,
};
