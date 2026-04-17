const axios = require('axios');
const logger = require('../utils/logger');
require('dotenv').config();

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

function deriveDisruption(rain, temp) {
  if (rain > 50) {
    return { disruptionType: 'HEAVY_RAIN', duration: 4 };
  }
  if (temp > 45) {
    return { disruptionType: 'HEAT_WAVE', duration: 6 };
  }
  return { disruptionType: 'NONE', duration: 0 };
}

function estimateDurationHours(disruptionType, rain, temp, apiHintHours = null) {
  if (disruptionType === 'NONE') return 0;

  if (typeof apiHintHours === 'number' && Number.isFinite(apiHintHours) && apiHintHours > 0) {
    return Math.min(Math.max(apiHintHours, 0.5), 12);
  }

  if (disruptionType === 'HEAVY_RAIN') {
    if (rain >= 100) return 6;
    if (rain >= 70) return 5;
    if (rain >= 50) return 4;
    return 3;
  }

  if (disruptionType === 'HEAT_WAVE') {
    if (temp >= 48) return 8;
    if (temp >= 46) return 6;
    return 4;
  }

  return 3;
}

async function fetchOpenWeather(lat, lng) {
  if (!WEATHER_API_KEY || WEATHER_API_KEY === 'your_openweathermap_api_key_here') {
    return null;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=metric`;
  const response = await axios.get(url, { timeout: 10000 });
  const data = response.data;
  const rain1h = data.rain ? data.rain['1h'] : 0;
  const rain3h = data.rain ? data.rain['3h'] : 0;
  const rain = data.rain ? (rain1h || rain3h || 0) : 0;
  const temp = data.main?.temp ?? 30;
  const apiHintHours = rain3h ? 3 : (rain1h ? 1 : null);
  return { rain, temp, source: 'OPENWEATHER', apiHintHours };
}

async function fetchOpenMeteo(lat, lng) {
  const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lng,
      current: 'temperature_2m,precipitation',
      forecast_days: 1
    },
    timeout: 10000
  });

  const current = response.data?.current || {};
  const rain = current.precipitation ?? 0;
  const temp = current.temperature_2m ?? 30;
  return { rain, temp, source: 'OPEN_METEO', apiHintHours: 1 };
}

const getWeatherData = async (lat, lng, options = {}) => {
  const mode = options.mode || 'live';

  // Mock weather is strictly for explicit manual demo mode.
  if (mode === 'manual-demo') {
    const mockRain = Number(options.mockRain ?? 0);
    const mockTemp = Number(options.mockTemp ?? 30);
    const mockDuration = Number(options.mockDuration ?? 0);
    const disruption = deriveDisruption(mockRain, mockTemp);
    const durationHours = estimateDurationHours(disruption.disruptionType, mockRain, mockTemp, mockDuration > 0 ? mockDuration : null);
    logger.log(`Manual demo weather mode for location: ${lat}, ${lng}. rain=${mockRain}, temp=${mockTemp}`);
    return {
      ...disruption,
      duration: durationHours,
      durationHours,
      rain: mockRain,
      temp: mockTemp,
      source: 'MANUAL_DEMO'
    };
  }

  try {
    const live = await fetchOpenWeather(lat, lng);
    if (live) {
      const disruption = deriveDisruption(live.rain, live.temp);
      const durationHours = estimateDurationHours(disruption.disruptionType, live.rain, live.temp, live.apiHintHours);
      logger.log(`Live weather (${live.source}) for (${lat}, ${lng}): Temp=${live.temp}, Rain=${live.rain}`);
      return {
        ...disruption,
        duration: durationHours,
        durationHours,
        rain: live.rain,
        temp: live.temp,
        source: live.source
      };
    }

    logger.log('OpenWeather key unavailable or placeholder; falling back to Open-Meteo');
    const fallback = await fetchOpenMeteo(lat, lng);
    const disruption = deriveDisruption(fallback.rain, fallback.temp);
    const durationHours = estimateDurationHours(disruption.disruptionType, fallback.rain, fallback.temp, fallback.apiHintHours);
    logger.log(`Live weather (${fallback.source}) for (${lat}, ${lng}): Temp=${fallback.temp}, Rain=${fallback.rain}`);
    return {
      ...disruption,
      duration: durationHours,
      durationHours,
      rain: fallback.rain,
      temp: fallback.temp,
      source: fallback.source
    };
  } catch (error) {
    logger.log(`Weather provider error for (${lat}, ${lng}): ${error.message}`);
    return {
      disruptionType: 'NONE',
      rain: 0,
      temp: 0,
      duration: 0,
      durationHours: 0,
      source: 'LIVE_FALLBACK_NONE'
    };
  }
};

module.exports = { getWeatherData };
