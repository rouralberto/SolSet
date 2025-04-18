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
  // Validate inputs
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.error("Invalid date for getSunTrajectory:", date);
    return [];
  }

  if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    console.error("Invalid coordinates for getSunTrajectory:", { lat, lng });
    return [];
  }

  try {
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
  } catch (error) {
    console.error("Error in getSunTrajectory:", error, { date, lat, lng, steps });
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
      console.error("Invalid parameters in calculateTrajectoryPoints:", {
        date, lat, lng, startHour, endHour, steps
      });
      return [];
    }
    
    const trajectory = [];
    const dayMs = 24 * 60 * 60 * 1000; // milliseconds in a day
    const baseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // Calculate step size
    const hourRange = endHour - startHour;
    if (hourRange <= 0) {
      console.warn("Invalid hour range in calculateTrajectoryPoints:", { startHour, endHour });
      return [];
    }
    
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
      
      try {
        const position = getSunPosition(pointTime, lat, lng);
        
        trajectory.push({
          time: pointTime,
          azimuth: position.azimuth,
          altitude: position.altitude
        });
      } catch (positionError) {
        console.error("Error calculating sun position:", positionError, { 
          pointTime, lat, lng, hour, adjustedHour
        });
        // Skip this point but continue with the rest
      }
    }
    
    return trajectory;
  } catch (error) {
    console.error("Error in calculateTrajectoryPoints:", error);
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

/**
 * Calculate optimal house orientation for a given location
 * by analyzing sun paths throughout the year
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {number} Optimal orientation in degrees (clockwise from north)
 */
export function calculateOptimalHouseOrientation(lat, lng) {
  // Sample key dates through the year: solstices, equinoxes, and midpoints
  const sampleDates = [
    new Date(new Date().getFullYear(), 0, 21),  // Winter solstice (Northern hemisphere)
    new Date(new Date().getFullYear(), 2, 21),  // Spring equinox
    new Date(new Date().getFullYear(), 4, 21),  // Midpoint Spring-Summer
    new Date(new Date().getFullYear(), 6, 21),  // Summer solstice (Northern hemisphere)
    new Date(new Date().getFullYear(), 8, 21),  // Fall equinox
    new Date(new Date().getFullYear(), 10, 21), // Midpoint Fall-Winter
  ];
  
  // Determine if we're in Northern or Southern hemisphere
  const isNorthernHemisphere = lat > 0;
  
  // Base orientation to use as fallback if calculations fail
  const baseOrientation = isNorthernHemisphere ? 180 : 0;
  
  // For mid-latitudes, analyze sun paths on sample dates
  let totalWeight = 0;
  let weightedSum = 0;
  
  // Analyze peak sun hours for each sample date
  for (const date of sampleDates) {
    // Different weights for different seasons
    const isSummer = (date.getMonth() >= 4 && date.getMonth() <= 8);
    let seasonWeight;
    
    if (isNorthernHemisphere) {
      // In northern hemisphere, winter sun is more valuable (harder to get)
      seasonWeight = isSummer ? 0.7 : 1.3;
    } else {
      // In southern hemisphere, seasons are reversed
      seasonWeight = isSummer ? 1.3 : 0.7;
    }
    
    // Sample times throughout the day (expanded to include more hours)
    const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    
    for (const hour of hours) {
      // Create datetime for the calculation
      const dateTime = new Date(date);
      dateTime.setHours(hour, 0, 0, 0);
      
      // Get sun position at this time
      const position = getSunPosition(dateTime, lat, lng);
      
      // Only consider when sun is reasonably above horizon
      if (position.altitude > 0.1) { // ~6 degrees
        // Weight by altitude - higher sun has more energy
        const altitudeWeight = Math.sin(position.altitude);
        
        // Weight by time of day - mid-day gets higher weight but we still value morning hours
        const timeWeight = 1 - Math.abs(hour - 12) / 8;
        
        // Calculate total sample weight
        const weight = seasonWeight * altitudeWeight * timeWeight;
        
        // Get azimuth in degrees (0-360) instead of radians
        let azimuthDegrees = (position.azimuth * 180 / Math.PI) % 360;
        if (azimuthDegrees < 0) azimuthDegrees += 360;
        
        // For house orientation, we want to face the "day" area toward the sun
        // So the optimal orientation is opposite to the sun azimuth
        let orientationForThisSample = (azimuthDegrees + 180) % 360;
        
        // Add to weighted sum
        weightedSum += orientationForThisSample * weight;
        totalWeight += weight;
      }
    }
  }
  
  // Calculate weighted average orientation
  let optimalOrientation = totalWeight > 0 ? weightedSum / totalWeight : baseOrientation;
  
  // Apply small adjustment to favor morning sun slightly
  // This avoids the harshest afternoon sun and captures more morning sun
  // Adjust based on latitude - stronger adjustment near equator, less near poles
  const absLat = Math.abs(lat);
  // Scale from 15 degrees at equator to 5 degrees near poles
  const morningAdjustment = 15 - (absLat / 90) * 10;
  
  if (isNorthernHemisphere) {
    // In Northern hemisphere, subtract to rotate eastward
    optimalOrientation -= morningAdjustment;
  } else {
    // In Southern hemisphere, add to rotate eastward
    optimalOrientation += morningAdjustment;
  }
  
  // Ensure orientation is between 0-360
  optimalOrientation = (optimalOrientation + 360) % 360;
  
  return optimalOrientation;
}

/**
 * Get trajectories for key dates (solstices and equinoxes)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} year - Year to calculate for (defaults to current year)
 * @param {number} steps - Number of points to calculate per trajectory (default: 24)
 * @returns {Object} Object with trajectories for key dates
 */
export function getSeasonalTrajectories(lat, lng, year = new Date().getFullYear(), steps = 24) {
  // Validate inputs
  if (isNaN(lat) || isNaN(lng) || isNaN(year) || isNaN(steps)) {
    console.error("Invalid parameters for getSeasonalTrajectories:", { lat, lng, year, steps });
    return null;
  }

  try {
    // Define key dates: summer solstice, winter solstice, spring/fall equinoxes
    const summerSolstice = new Date(year, 5, 21); // June 21
    const winterSolstice = new Date(year, 11, 21); // December 21
    const springEquinox = new Date(year, 2, 20); // March 20
    const fallEquinox = new Date(year, 8, 22); // September 22

    // Helper function to safely get trajectory
    const safeGetTrajectory = (date, label) => {
      try {
        const points = getSunTrajectory(date, lat, lng, steps);
        return {
          date,
          label,
          points: points || []  // Ensure we always return an array
        };
      } catch (error) {
        console.error(`Error calculating ${label} trajectory:`, error);
        return {
          date,
          label,
          points: []  // Return empty array on error
        };
      }
    };

    return {
      summerSolstice: {
        date: summerSolstice,
        label: 'Summer Solstice',
        color: '#FF5722', // Orange-red
        ...safeGetTrajectory(summerSolstice, 'Summer Solstice'),
      },
      winterSolstice: {
        date: winterSolstice,
        label: 'Winter Solstice',
        color: '#2196F3', // Blue
        ...safeGetTrajectory(winterSolstice, 'Winter Solstice'),
      },
      springEquinox: {
        date: springEquinox,
        label: 'Spring Equinox',
        color: '#4CAF50', // Green
        ...safeGetTrajectory(springEquinox, 'Spring Equinox'),
      },
      fallEquinox: {
        date: fallEquinox,
        label: 'Fall Equinox',
        color: '#FF9800', // Orange
        ...safeGetTrajectory(fallEquinox, 'Fall Equinox'),
      }
    };
  } catch (error) {
    console.error("Error in getSeasonalTrajectories:", error);
    return null;
  }
} 
