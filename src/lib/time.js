import tzlookup from '@photostructure/tz-lookup';

/**
 * All user-facing dates and times in SolSet are wall-clock values in the
 * *location's* time zone (not the browser's). Dates are 'YYYY-MM-DD' strings
 * and times are minutes since local midnight; these helpers convert between
 * those and real instants (Date objects).
 */

const MINUTES_PER_DAY = 1440;

/**
 * Resolve the IANA time zone for a coordinate (offline lookup).
 * Falls back to a fixed offset derived from longitude if the lookup fails.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} IANA time zone name
 */
export function getTimeZone(lat, lng) {
  try {
    return tzlookup(lat, lng);
  } catch {
    const offset = Math.max(-12, Math.min(14, Math.round(lng / 15)));
    if (offset === 0) return 'UTC';
    // Etc/GMT zones use inverted signs: Etc/GMT-2 is UTC+2
    return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  }
}

const partsFormatters = new Map();

function getPartsFormatter(timeZone) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Wall-clock components of an instant in a time zone
 * @param {Date} date - Instant
 * @param {string} timeZone - IANA time zone
 * @returns {Object} { year, month (1-12), day, hour, minute, second }
 */
export function getZonedParts(date, timeZone) {
  const parts = {};
  for (const { type, value } of getPartsFormatter(timeZone).formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second
  };
}

/**
 * Offset of a time zone from UTC at a given instant
 * @param {Date} date - Instant
 * @param {string} timeZone - IANA time zone
 * @returns {number} Offset in minutes (e.g. 120 for UTC+2)
 */
export function getTimeZoneOffset(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

/**
 * Convert a wall-clock date and time in a time zone to an instant
 * @param {string} dateString - 'YYYY-MM-DD'
 * @param {number} minutes - Minutes since local midnight
 * @param {string} timeZone - IANA time zone
 * @returns {Date} Instant
 */
export function zonedTimeToDate(dateString, minutes, timeZone) {
  const [year, month, day] = dateString.split('-').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, 0, minutes);
  const firstOffset = getTimeZoneOffset(new Date(wallClockAsUtc), timeZone);
  let result = wallClockAsUtc - firstOffset * 60000;
  // Re-check in case the guess crossed a DST transition
  const secondOffset = getTimeZoneOffset(new Date(result), timeZone);
  if (secondOffset !== firstOffset) {
    result = wallClockAsUtc - secondOffset * 60000;
  }
  return new Date(result);
}

/**
 * Wall-clock date of an instant in a time zone
 * @returns {string} 'YYYY-MM-DD'
 */
export function toZonedDateString(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return formatDateString(p.year, p.month, p.day);
}

/**
 * Wall-clock minutes since midnight of an instant in a time zone
 * @returns {number} 0-1439
 */
export function toZonedMinutes(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * Format an instant as HH:MM in a time zone
 * @returns {string} e.g. "06:28", or "—" for invalid dates
 */
export function formatZonedTime(date, timeZone) {
  if (!isValidDate(date)) return '—';
  return formatMinutes(toZonedMinutes(date, timeZone));
}

/**
 * Format minutes since midnight as HH:MM
 */
export function formatMinutes(minutes) {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Parse HH:MM into minutes since midnight
 * @returns {number|null}
 */
export function parseMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Format a UTC offset in minutes, e.g. "UTC+2", "UTC−3:30"
 */
export function formatUtcOffset(offsetMinutes) {
  if (offsetMinutes === 0) return 'UTC';
  const sign = offsetMinutes > 0 ? '+' : '−';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `UTC${sign}${hours}${mins ? ':' + String(mins).padStart(2, '0') : ''}`;
}

export function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}

/* Date-string helpers ('YYYY-MM-DD'), independent of any time zone */

export function formatDateString(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getYear(dateString) {
  return Number(dateString.slice(0, 4));
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateString(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * @returns {number} Day of year, 1-366
 */
export function dayOfYear(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

export function dateStringFromDayOfYear(year, day) {
  return addDays(formatDateString(year, 1, 1), day - 1);
}

/**
 * Human-readable date, e.g. "Sun, Jun 21, 2026"
 */
export function formatDisplayDate(dateString, options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}
