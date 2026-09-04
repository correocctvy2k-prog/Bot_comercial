const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(value, fallback = null) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function observedTimeToMinutes(value, timeZone = 'America/Bogota') {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value)).split(':').map(Number);
  return Number.isFinite(parts[0]) && Number.isFinite(parts[1]) ? parts[0] * 60 + parts[1] : null;
}

export function evaluateOperationalSchedule({
  expectedOpen = '07:00',
  expectedClose = '21:00',
  tolerance = 15,
  firstPingAt = null,
  cctvOpeningAt = null,
  cctvClosingAt = null,
  lastPingAt = null,
  isToday = false,
  timeZone = 'America/Bogota'
}) {
  const open = timeToMinutes(expectedOpen, 420);
  const close = timeToMinutes(expectedClose, 1260);
  const safeTolerance = Math.max(0, Number(tolerance) || 15);
  const pingMinutes = observedTimeToMinutes(firstPingAt, timeZone);
  const cctvMinutes = observedTimeToMinutes(cctvOpeningAt, timeZone);
  const arrivalAt = firstPingAt || cctvOpeningAt || null;
  const arrivalSource = firstPingAt && cctvOpeningAt
    ? 'Ping SIIS + CCTV'
    : firstPingAt ? 'Ping SIIS' : cctvOpeningAt ? 'CCTV' : 'Sin señal';
  const arrivalMinutes = pingMinutes ?? cctvMinutes;
  const alerts = [];
  let status = 'NO_ENTRY';
  if (arrivalMinutes != null) {
    if (arrivalMinutes < open - safeTolerance) {
      status = 'EARLY';
      alerts.push('OPENING_BEFORE_SCHEDULE');
    } else if (arrivalMinutes > open + safeTolerance) {
      status = 'LATE';
      alerts.push('OPENING_AFTER_SCHEDULE');
    } else {
      status = 'ON_TIME';
    }
  } else if (isToday) {
    status = 'NO_ENTRY';
  }

  if (cctvMinutes != null && cctvMinutes < open - safeTolerance && cctvMinutes !== arrivalMinutes) {
    alerts.push('CCTV_OPENING_BEFORE_PING');
  }

  const lastPingMinutes = observedTimeToMinutes(lastPingAt, timeZone);
  if (lastPingMinutes != null && (lastPingMinutes < open - safeTolerance || lastPingMinutes > close + safeTolerance)) {
    alerts.push('PING_OUTSIDE_SCHEDULE');
  }

  return {
    status,
    arrivalAt,
    arrivalSource,
    firstPingAt,
    cctvOpeningAt,
    cctvClosingAt,
    lastPingAt,
    expectedOpen: String(expectedOpen).slice(0, 5),
    expectedClose: String(expectedClose).slice(0, 5),
    tolerance: safeTolerance,
    delay: arrivalMinutes == null ? null : arrivalMinutes - open,
    alerts: [...new Set(alerts)],
    lunchCloseAt: cctvClosingAt || null,
    lunchCloseSource: cctvClosingAt ? 'CCTV' : 'Sin señal de cierre de almuerzo'
  };
}

export const SCHEDULE_STATUS_LABELS = {
  NO_ENTRY: 'No ingresó',
  ON_TIME: 'A tiempo',
  LATE: 'Llegó tarde',
  EARLY: 'Llegó temprano'
};