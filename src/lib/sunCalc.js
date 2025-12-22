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
  const validLat = Number(lat);
  const validLng = Number(lng);

  if (isNaN(validLat) || isNaN(validLng)) {
    return { azimuth: 0, altitude: 0 };
  }

  return SunCalc.getPosition(dateTime, validLat, validLng);
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
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return [];
  }

  if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return [];
  }

  try {
    const cleanDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const times = getSunTimes(cleanDate, lat, lng);
    const sunrise = times.sunrise;
    const sunset = times.sunset;

    // Handle polar day/night
    if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
      const noonDate = new Date(cleanDate.getFullYear(), cleanDate.getMonth(), cleanDate.getDate(), 12, 0, 0, 0);
      const noonPosition = getSunPosition(noonDate, lat, lng);

      if (noonPosition.altitude > 0) {
        return calculateTrajectoryPoints(cleanDate, lat, lng, 0, 24, steps);
      } else {
        return [];
      }
    }

    const sunriseHour = sunrise.getHours() + sunrise.getMinutes() / 60;
    const sunsetHour = sunset.getHours() + sunset.getMinutes() / 60;
    const adjustedSunsetHour = sunsetHour < sunriseHour ? sunsetHour + 24 : sunsetHour;

    return calculateTrajectoryPoints(cleanDate, lat, lng, sunriseHour, adjustedSunsetHour, steps);
  } catch (error) {
    return [];
  }
}

/**
 * Calculate sun position points for a time range
 * @private
 */
function calculateTrajectoryPoints(date, lat, lng, startHour, endHour, steps) {
  try {
    if (!date || isNaN(date.getTime()) || isNaN(startHour) || isNaN(endHour) || isNaN(steps)) {
      return [];
    }

    const trajectory = [];
    const baseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const hourRange = endHour - startHour;

    if (hourRange <= 0) {
      return [];
    }

    const stepSize = hourRange / steps;

    for (let i = 0; i <= steps; i++) {
      const hour = startHour + i * stepSize;
      const adjustedHour = hour % 24;
      const dayOffset = Math.floor(hour / 24);

      const pointTime = new Date(baseDate);
      pointTime.setHours(Math.floor(adjustedHour), Math.round((adjustedHour % 1) * 60), 0, 0);

      if (dayOffset > 0) {
        pointTime.setDate(pointTime.getDate() + dayOffset);
      }

      try {
        const position = getSunPosition(pointTime, lat, lng);

        trajectory.push({
          time: pointTime,
          azimuth: position.azimuth,
          altitude: position.altitude
        });
      } catch (positionError) {
        // Skip this point
      }
    }

    return trajectory;
  } catch (error) {
    return [];
  }
}

/**
 * Format time to local time string
 * @param {Date} date - Date object to format
 * @param {number} lng - Longitude for timezone calculation (optional)
 * @returns {string} Formatted time string (e.g., "14:30")
 */
export function formatTime(date, lng) {
  if (!date || isNaN(date.getTime())) return '—';

  if (lng !== undefined) {
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const timezoneOffset = lng / 15;

    let localHours = utcHours + timezoneOffset;

    // Handle overflow
    if (localHours >= 24) localHours -= 24;
    if (localHours < 0) localHours += 24;

    const hours = Math.floor(localHours).toString().padStart(2, '0');
    const minutes = utcMinutes.toString().padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Calculate the shadow length for an object of given height
 * @param {number} altitude - Sun altitude in radians
 * @param {number} height - Object height in meters (default: 1)
 * @returns {number} Shadow length in meters
 */
export function calculateShadowLength(altitude, height = 1) {
  if (altitude <= 0) return Infinity;
  return height / Math.tan(altitude);
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

/**
 * Calculate optimal house orientation for a given location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {number} Optimal orientation in degrees (clockwise from north)
 */
export function calculateOptimalHouseOrientation(lat, lng) {
  const sampleDates = [
    new Date(new Date().getFullYear(), 0, 21),  // Winter solstice
    new Date(new Date().getFullYear(), 2, 21),  // Spring equinox
    new Date(new Date().getFullYear(), 4, 21),  // Late spring
    new Date(new Date().getFullYear(), 6, 21),  // Summer solstice
    new Date(new Date().getFullYear(), 8, 21),  // Fall equinox
    new Date(new Date().getFullYear(), 10, 21), // Late fall
  ];

  const isNorthernHemisphere = lat > 0;
  const baseOrientation = isNorthernHemisphere ? 180 : 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const date of sampleDates) {
    const isSummer = (date.getMonth() >= 4 && date.getMonth() <= 8);
    let seasonWeight;

    if (isNorthernHemisphere) {
      seasonWeight = isSummer ? 0.7 : 1.3;
    } else {
      seasonWeight = isSummer ? 1.3 : 0.7;
    }

    const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

    for (const hour of hours) {
      const dateTime = new Date(date);
      dateTime.setHours(hour, 0, 0, 0);

      const position = getSunPosition(dateTime, lat, lng);

      if (position.altitude > 0.1) {
        const altitudeWeight = Math.sin(position.altitude);
        const timeWeight = 1 - Math.abs(hour - 12) / 8;
        const weight = seasonWeight * altitudeWeight * timeWeight;

        let azimuthDegrees = (position.azimuth * 180 / Math.PI) % 360;
        if (azimuthDegrees < 0) azimuthDegrees += 360;

        let orientationForThisSample = (azimuthDegrees + 180) % 360;

        weightedSum += orientationForThisSample * weight;
        totalWeight += weight;
      }
    }
  }

  let optimalOrientation = totalWeight > 0 ? weightedSum / totalWeight : baseOrientation;

  // Slight adjustment for morning sun preference
  const absLat = Math.abs(lat);
  const morningAdjustment = 15 - (absLat / 90) * 10;

  if (isNorthernHemisphere) {
    optimalOrientation -= morningAdjustment;
  } else {
    optimalOrientation += morningAdjustment;
  }

  optimalOrientation = (optimalOrientation + 360) % 360;

  return optimalOrientation;
}

/**
 * Get trajectories for key dates (solstices and equinoxes)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} year - Year to calculate for
 * @param {number} steps - Number of points per trajectory
 * @returns {Object} Object with trajectories for key dates
 */
export function getSeasonalTrajectories(lat, lng, year = new Date().getFullYear(), steps = 24) {
  if (isNaN(lat) || isNaN(lng) || isNaN(year) || isNaN(steps)) {
    return null;
  }

  try {
    const summerSolstice = new Date(year, 5, 21);
    const winterSolstice = new Date(year, 11, 21);
    const springEquinox = new Date(year, 2, 20);
    const fallEquinox = new Date(year, 8, 22);

    const safeGetTrajectory = (date, label) => {
      try {
        const points = getSunTrajectory(date, lat, lng, steps);
        return {
          date,
          label,
          points: points || []
        };
      } catch (error) {
        return {
          date,
          label,
          points: []
        };
      }
    };

    return {
      summerSolstice: {
        date: summerSolstice,
        label: 'Summer Solstice',
        color: '#ef4444', // Red
        ...safeGetTrajectory(summerSolstice, 'Summer Solstice'),
      },
      winterSolstice: {
        date: winterSolstice,
        label: 'Winter Solstice',
        color: '#3b82f6', // Blue
        ...safeGetTrajectory(winterSolstice, 'Winter Solstice'),
      },
      springEquinox: {
        date: springEquinox,
        label: 'Spring Equinox',
        color: '#22c55e', // Green
        ...safeGetTrajectory(springEquinox, 'Spring Equinox'),
      },
      fallEquinox: {
        date: fallEquinox,
        label: 'Fall Equinox',
        color: '#f97316', // Orange
        ...safeGetTrajectory(fallEquinox, 'Fall Equinox'),
      }
    };
  } catch (error) {
    return null;
  }
}
