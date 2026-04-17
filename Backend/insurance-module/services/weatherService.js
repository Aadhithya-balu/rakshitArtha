const axios = require('axios');
const logger = require('../utils/logger');

class WeatherService {
  constructor() {
    // Real API keys - should be in .env
    this.OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY || 'demo';
    this.OPENMETEO_BASE = 'https://api.open-meteo.com/v1/forecast';
    this.AQIIN_BASE = 'https://api.waqi.info/feed';
    this.IMD_BASE = process.env.IMD_API_URL || null;
  }

  /**
   * Fetch real weather data from multiple sources
   * Uses fallback chain: OpenMeteo (free) → OpenWeather → Manual cache
   */
  async getWeatherData(latitude, longitude, location) {
    try {
      // Primary: Open-Meteo (free, no API key needed)
      const openMeteoData = await this._fetchOpenMeteo(latitude, longitude);
      if (openMeteoData) {
        logger.info('Weather data from Open-Meteo', { location, source: 'open-meteo' });
        return {
          source: 'OPEN_METEO',
          ...openMeteoData,
          fetchedAt: new Date()
        };
      }

      // Secondary: OpenWeather API
      if (this.OPENWEATHER_KEY !== 'demo') {
        const owData = await this._fetchOpenWeather(latitude, longitude);
        if (owData) {
          logger.info('Weather data from OpenWeather', { location, source: 'openweather' });
          return {
            source: 'OPENWEATHER',
            ...owData,
            fetchedAt: new Date()
          };
        }
      }

      // Fallback: Return null (use cached data or manual entry)
      logger.warn('No real weather data available', { location, lat: latitude, lon: longitude });
      return null;
    } catch (error) {
      logger.error('Weather fetch error', { location, error: error.message });
      return null; // Use cache/manual
    }
  }

  /**
   * Fetch AQI from real sources
   */
  async getAQIData(latitude, longitude, location) {
    try {
      // Try aqi.in (India's official AQI data)
      const aqiData = await this._fetchAQIIn(latitude, longitude, location);
      if (aqiData) {
        logger.info('AQI from aqi.in', { location, aqi: aqiData.aqi, source: 'aqiin' });
        return {
          source: 'AQI_IN',
          ...aqiData,
          fetchedAt: new Date()
        };
      }

      // Fallback to OpenWeather AQI
      if (this.OPENWEATHER_KEY !== 'demo') {
        const owAqi = await this._fetchOpenWeatherAQI(latitude, longitude);
        if (owAqi) {
          logger.info('AQI from OpenWeather', { location, aqi: owAqi.aqi, source: 'openweather' });
          return {
            source: 'OPENWEATHER',
            ...owAqi,
            fetchedAt: new Date()
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('AQI fetch error', { location, error: error.message });
      return null;
    }
  }

  // ====== REAL API IMPLEMENTATIONS ======

  async _fetchOpenMeteo(latitude, longitude) {
    try {
      const response = await axios.get(this.OPENMETEO_BASE, {
        params: {
          latitude: latitude,
          longitude: longitude,
          current: 'temperature_2m,wind_speed_10m,precipitation,weather_code,relative_humidity_2m',
          current_weather: 'true',
          timezone: 'auto',
          forecast_days: 1
        },
        timeout: 5000
      });

      const current = response.data?.current;
      if (!current) return null;

      return {
        temperature: Number(current.temperature_2m) || null,
        windSpeed: Number(current.wind_speed_10m) || null,
        precipitation: Number(current.precipitation) || 0,
        humidity: Number(current.relative_humidity_2m) || null,
        weatherCode: current.weather_code || null,
        description: this._getWeatherCodeDescription(current.weather_code)
      };
    } catch (error) {
      logger.debug('Open-Meteo fetch failed', { error: error.message });
      return null;
    }
  }

  async _fetchOpenWeather(latitude, longitude) {
    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat: latitude,
          lon: longitude,
          appid: this.OPENWEATHER_KEY,
          units: 'metric'
        },
        timeout: 5000
      });

      const main = response.data?.main;
      const weather = response.data?.weather?.[0];
      const wind = response.data?.wind;
      const rain = response.data?.rain;

      if (!main) return null;

      return {
        temperature: Number(main.temp) || null,
        windSpeed: Number(wind?.speed) || null,
        precipitation: Number(rain?.['1h']) || 0,
        humidity: Number(main.humidity) || null,
        description: weather?.main || 'Unknown'
      };
    } catch (error) {
      logger.debug('OpenWeather fetch failed', { error: error.message });
      return null;
    }
  }

  async _fetchAQIIn(latitude, longitude, location) {
    try {
      // Try by coordinates first
      const response = await axios.get(`${this.AQIIN_BASE}/geo:${latitude};${longitude}`, {
        params: {
          token: process.env.AQI_IN_TOKEN || 'demo'
        },
        timeout: 5000
      });

      const data = response.data?.data;
      if (!data) return null;

      return {
        aqi: Number(data.aqi) || null,
        city: data.city || location || 'Unknown',
        url: data.url || null,
        pm25: Number(data.iaqi?.pm25?.v) || null,
        pm10: Number(data.iaqi?.pm10?.v) || null,
        o3: Number(data.iaqi?.o3?.v) || null,
        no2: Number(data.iaqi?.no2?.v) || null,
        so2: Number(data.iaqi?.so2?.v) || null
      };
    } catch (error) {
      logger.debug('aqi.in fetch failed', { error: error.message });
      return null;
    }
  }

  async _fetchOpenWeatherAQI(latitude, longitude) {
    try {
      const response = await axios.get('https://api.openweathermap.org/data/3.0/stations/airpollution', {
        params: {
          lat: latitude,
          lon: longitude,
          appid: this.OPENWEATHER_KEY
        },
        timeout: 5000
      });

      const list = response.data?.list?.[0];
      if (!list) return null;

      // Convert OpenWeather AQI to standard 0-500 scale
      const components = list.components || {};
      const aqi = Math.min(500, Math.round(
        (Number(components.pm10) || 0) * 0.1 +
        (Number(components.pm2_5) || 0) * 0.15
      ));

      return {
        aqi: aqi,
        pm25: Number(components.pm2_5) || null,
        pm10: Number(components.pm10) || null
      };
    } catch (error) {
      logger.debug('OpenWeather AQI fetch failed', { error: error.message });
      return null;
    }
  }

  // ====== HELPER METHODS ======

  _getWeatherCodeDescription(code) {
    const codeMap = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      71: 'Slight snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm'
    };
    return codeMap[code] || 'Unknown';
  }

  /**
   * Calculate AQI health category
   * Reference: aqi.in standards
   */
  getAQICategory(aqi) {
    if (aqi <= 50) return { category: 'Good', riskLevel: 'LOW' };
    if (aqi <= 100) return { category: 'Moderate', riskLevel: 'LOW' };
    if (aqi <= 150) return { category: 'Poor', riskLevel: 'MEDIUM' };
    if (aqi <= 200) return { category: 'Unhealthy', riskLevel: 'MEDIUM' };
    if (aqi <= 300) return { category: 'Severe', riskLevel: 'HIGH' };
    return { category: 'Hazardous', riskLevel: 'CRITICAL' };
  }

  /**
   * Check if worker can work in current conditions
   * Considers health status, medications, chronic conditions
   */
  canWorkerOperateInConditions(worker, weatherData, aqiData) {
    const workerHealth = worker?.healthProfile || {};
    const hasAsthma = workerHealth.hasAsthma || false;
    const hasHeartCondition = workerHealth.hasHeartCondition || false;
    const hasAllergies = workerHealth.hasAllergies || false;
    const isPregnant = workerHealth.isPregnant || false;
    const isAged = (worker?.age || 0) > 60;
    const isYoung = (worker?.age || 0) < 18;

    const issues = [];

    // AQI checks
    if (aqiData?.aqi) {
      const aqiCategory = this.getAQICategory(aqiData.aqi);
      
      // Anyone: AQI >= 300 is hazardous
      if (aqiData.aqi >= 300) {
        issues.push('AQI Hazardous (300+) - No work recommended for anyone');
        return { canWork: false, issues, severity: 'CRITICAL' };
      }

      // Vulnerable groups: AQI >= 200 (Severe)
      if (aqiData.aqi >= 200 && (hasAsthma || hasHeartCondition || isAged || isYoung || isPregnant)) {
        issues.push(`AQI Severe (200+) - Not safe for worker with health condition: ${workerHealth.medicalConditions?.join(', ')}`);
        return { canWork: false, issues, severity: 'HIGH' };
      }

      // General: AQI >= 150 (Poor)
      if (aqiData.aqi >= 150 && hasAsthma) {
        issues.push('AQI Poor (150+) - Asthma patients should avoid outdoor work');
      }

      // Caution: AQI >= 100 with conditions
      if (aqiData.aqi >= 100) {
        if (hasAllergies) issues.push('AQI Moderate/Above - Allergy alerts active');
        if (hasHeartCondition) issues.push('AQI Moderate/Above - Heart patients should monitor');
      }
    }

    // Rain checks
    if (weatherData?.precipitation && weatherData.precipitation > 50) {
      issues.push('Heavy rainfall detected - Delivery risk high');
    }

    // Temperature checks
    const temp = weatherData?.temperature || null;
    if (temp) {
      if (temp > 45 && (isAged || hasHeartCondition)) {
        issues.push(`Extreme heat (${temp}°C) - Not safe for vulnerable workers`);
        return { canWork: false, issues, severity: 'HIGH' };
      }
      if (temp < 5 && isYoung) {
        issues.push(`Extreme cold (${temp}°C) - Not safe for young workers`);
        return { canWork: false, issues, severity: 'HIGH' };
      }
    }

    return {
      canWork: issues.length === 0,
      issues: issues.length > 0 ? issues : ['All conditions normal - Safe to work'],
      severity: issues.length === 0 ? 'INFO' : 'MEDIUM'
    };
  }
}

module.exports = { weatherService: new WeatherService() };
