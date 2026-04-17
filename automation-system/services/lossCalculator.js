const { parseWorkingHours, getOverlapHours, buildDisruptionWindow } = require('../utils/timeParser');

const getDurationFactor = (durationHours) => {
  const duration = Number(durationHours || 0);
  if (duration <= 2) return 0.5;
  if (duration <= 5) return 1.0;
  return 1.5;
};

const calculateOverlapHours = ({ workingHours, disruptionStartHour, disruptionEndHour, disruptionHours }) => {
  const parsedShift = parseWorkingHours(workingHours || '');
  if (!parsedShift) {
    return Math.max(Number(disruptionHours || 0), 0);
  }

  const disruptionWindow = buildDisruptionWindow({
    startHour: disruptionStartHour,
    endHour: disruptionEndHour,
    durationHours: disruptionHours,
  });

  return getOverlapHours(parsedShift, disruptionWindow);
};

const calculateLoss = (weeklyIncome, weeklyHours, disruptionHours, options = {}) => {
  const safeWeeklyHours = Math.max(Number(weeklyHours || 0), 1);
  const safeDurationHours = Math.max(Number(disruptionHours || 0), 0);
  const effectiveDurationHours = calculateOverlapHours({
    workingHours: options.workingHours,
    disruptionStartHour: options.disruptionStartHour,
    disruptionEndHour: options.disruptionEndHour,
    disruptionHours: safeDurationHours,
  });

  if (effectiveDurationHours <= 0) {
    return {
      loss: 0,
      overlapHours: 0,
      disruptionHours: safeDurationHours,
      durationFactor: 0,
      overlapApplied: true,
    };
  }

  // Existing payout base logic remains unchanged.
  const hourlyIncome = Number(weeklyIncome || 0) / safeWeeklyHours;
  const baseLoss = hourlyIncome * effectiveDurationHours;

  // Duration is an additive scaling factor on top of existing logic.
  const durationFactor = getDurationFactor(effectiveDurationHours);
  const loss = baseLoss * durationFactor;

  return {
    loss: Math.round(loss * 100) / 100,
    overlapHours: Math.round(effectiveDurationHours * 100) / 100,
    disruptionHours: Math.round(safeDurationHours * 100) / 100,
    durationFactor,
    overlapApplied: true,
  };
};

module.exports = { calculateLoss, getDurationFactor, calculateOverlapHours };
