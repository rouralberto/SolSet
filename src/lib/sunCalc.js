import SunCalc from 'suncalc';

/**
 * Get sun times for a specific date and location
 * @param {Date} date - The date to calculate for
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Times object with sunrise, sunset, etc.
 */
export function getSunTimes(date, lat, lng) {
  return SunCalc.getTimes(date, lat, lng);
}

/**
 * Get sun position (azimuth, altitude) for a specific date, time, and location
 * @param {Date} dateTime - The date and time to calculate for
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Position object with azimuth and altitude
 */
export function getSunPosition(dateTime, lat, lng) {
  // Ensure lat and lng are numbers and within valid ranges
  const validLat = Number(lat);
  const validLng = Number(lng);
  
  if (isNaN(validLat) || isNaN(validLng)) {
    console.error('Invalid coordinates:', {lat, lng, validLat, validLng});
    return {azimuth: 0, altitude: 0};
  }
  
  const result = SunCalc.getPosition(dateTime, validLat, validLng);
  
  return result;
}

/**
 * Calculate sun trajectory points for a specific date and location
 * @param {Date} date - The date to calculate for
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} steps - Number of points to calculate (default: 24)
 * @returns {Array} Array of points with time, azimuth, altitude
 */
export function getSunTrajectory(date, lat, lng, steps = 24) {
  // Create a clean date object with just the date portion to avoid timezone issues
  const cleanDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const times = getSunTimes(cleanDate, lat, lng);
  const sunrise = times.sunrise;
  const sunset = times.sunset;

  // Handle polar day/night or invalid times
  if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
    // Check if it's polar day or night
    const noonDate = new Date(cleanDate.getFullYear(), cleanDate.getMonth(), cleanDate.getDate(), 12, 0, 0, 0);
    const noonPosition = getSunPosition(noonDate, lat, lng);
    
    if (noonPosition.altitude > 0) {
      // Polar day: simulate 24 hours of daylight
      return calculateTrajectoryPoints(cleanDate, lat, lng, 0, 24, steps);
    } else {
      // Polar night: no trajectory to calculate
      return [];
    }
  }
  
  // Get hours for sunrise and sunset in local time
  const sunriseHour = sunrise.getHours() + sunrise.getMinutes() / 60;
  const sunsetHour = sunset.getHours() + sunset.getMinutes() / 60;
  
  // Handle cases where sunset is before sunrise (crossing midnight)
  const adjustedSunsetHour = sunsetHour < sunriseHour ? sunsetHour + 24 : sunsetHour;
  
  return calculateTrajectoryPoints(cleanDate, lat, lng, sunriseHour, adjustedSunsetHour, steps);
}

/**
 * Calculate sun position points for a time range
 * @private
 */
function calculateTrajectoryPoints(date, lat, lng, startHour, endHour, steps) {
  const trajectory = [];
  const dayMs = 24 * 60 * 60 * 1000; // milliseconds in a day
  const baseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  // Calculate step size
  const hourRange = endHour - startHour;
  const stepSize = hourRange / steps;

  // Create points for the trajectory
  for (let i = 0; i <= steps; i++) {
    const hour = startHour + i * stepSize;
    
    // Handle hours that cross into the next day
    const adjustedHour = hour % 24;
    const dayOffset = Math.floor(hour / 24);
    
    // Create a new date for this point
    const pointTime = new Date(baseDate);
    pointTime.setHours(Math.floor(adjustedHour), Math.round((adjustedHour % 1) * 60), 0, 0);
    
    // Add day offset if we cross midnight
    if (dayOffset > 0) {
      pointTime.setDate(pointTime.getDate() + dayOffset);
    }
    
    const position = getSunPosition(pointTime, lat, lng);
    
    trajectory.push({
      time: pointTime,
      azimuth: position.azimuth,
      altitude: position.altitude
    });
  }
  
  return trajectory;
}

/**
 * Format time to local time string
 * @param {Date} date - Date object to format
 * @param {number} lng - Longitude for timezone calculation (optional)
 * @returns {string} Formatted time string (e.g., "14:30")
 */
export function formatTime(date, lng) {
  if (!date || isNaN(date.getTime())) return 'N/A';
  
  // If longitude is provided, adjust the time to the location's timezone
  if (lng !== undefined) {
    // Get UTC time
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth();
    const utcDay = date.getUTCDate();
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    
    // Calculate timezone offset based on longitude (each 15 degrees is roughly 1 hour)
    const timezoneOffset = lng / 15;
    
    // Create a new date with the local time at the specified longitude
    const localHours = utcHours + timezoneOffset;
    
    // Create a new date object with the adjusted time
    const localDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, localHours, utcMinutes));
    
    // Format as HH:MM (24-hour)
    const hours = localDate.getUTCHours().toString().padStart(2, '0');
    const minutes = localDate.getUTCMinutes().toString().padStart(2, '0');
    
    return `${hours}:${minutes}`;
  }
  
  // If no longitude provided, use local time
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Calculate the shadow length for a 1-meter object
 * @param {number} altitude - Sun altitude in radians
 * @returns {number} Shadow length in meters
 */
export function calculateShadowLength(altitude) {
  // When sun is below horizon, no shadow is cast
  if (altitude <= 0) return Infinity;
  
  // Shadow length = object height / tan(altitude)
  return 1 / Math.tan(altitude);
}

/**
 * Convert day of year (1-365/366) to Date object
 * @param {number} dayOfYear - Day of year (1-365/366)
 * @param {number} year - The year (defaults to current year)
 * @returns {Date} Date object for that day
 */
export function dayOfYearToDate(dayOfYear, year = new Date().getFullYear()) {
  const date = new Date(year, 0);
  date.setDate(dayOfYear);
  return date;
}

/**
 * Convert Date to day of year (1-365/366)
 * @param {Date} date - Date object
 * @returns {number} Day of year
 */
export function dateToDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
} 
