class WeatherServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const conditions = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail"
};

function createWeatherService({ fetchImpl = fetch } = {}) {
  const cache = new Map();
  const userAgent = process.env.WEATHER_USER_AGENT || "MANGAN/1.0";

  return {
    async current(latitude, longitude) {
      const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
      const now = Date.now();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) return cached.weather;

      try {
        const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
        endpoint.searchParams.set("latitude", String(latitude));
        endpoint.searchParams.set("longitude", String(longitude));
        endpoint.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m");
        endpoint.searchParams.set("forecast_days", "1");
        endpoint.searchParams.set("timezone", "auto");
        endpoint.searchParams.set("temperature_unit", "celsius");

        const result = await fetchJson(fetchImpl, endpoint, {}, 6_000);
        const current = result.current;
        if (!current || !Number.isFinite(current.temperature_2m) ||
            !Number.isFinite(current.apparent_temperature) ||
            !Number.isFinite(current.weather_code)) {
          throw new WeatherServiceError(502, "The weather service did not return current conditions.");
        }

        const weather = buildWeather({
          temperature: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          windKph: current.wind_speed_10m,
          condition: conditions[current.weather_code] || "Current conditions",
          observedAt: current.time,
          source: "Open-Meteo",
          sourceUrl: "https://open-meteo.com/",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
        });
        return cacheWeather(cache, key, weather, now);
      } catch (error) {
        if (!(error instanceof WeatherServiceError)) throw error;
      }

      const endpoint = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
      endpoint.searchParams.set("lat", String(latitude));
      endpoint.searchParams.set("lon", String(longitude));
      const result = await fetchJson(fetchImpl, endpoint, {
        headers: { "User-Agent": userAgent }
      }, 8_000);
      const point = nearestForecastPoint(result.properties && result.properties.timeseries, now);
      const details = point && point.data && point.data.instant && point.data.instant.details;
      if (!details || !Number.isFinite(details.air_temperature)) {
        throw new WeatherServiceError(502, "The weather service did not return current conditions.");
      }

      const humidity = details.relative_humidity;
      const windKph = Number.isFinite(details.wind_speed) ? details.wind_speed * 3.6 : null;
      const temperature = details.air_temperature;
      const symbolCode = point.data.next_1_hours && point.data.next_1_hours.summary &&
        point.data.next_1_hours.summary.symbol_code ||
        point.data.next_6_hours && point.data.next_6_hours.summary &&
        point.data.next_6_hours.summary.symbol_code;
      const weather = buildWeather({
        temperature,
        feelsLike: estimateFeelsLike(temperature, humidity, windKph),
        humidity,
        windKph,
        condition: conditionFromMetSymbol(symbolCode),
        observedAt: point.time,
        source: "MET Norway",
        sourceUrl: "https://api.met.no/weatherapi/locationforecast/2.0/documentation",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        feelsLikeEstimated: true
      });
      return cacheWeather(cache, key, weather, now);
    }
  };
}

async function fetchJson(fetchImpl, endpoint, options, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new WeatherServiceError(504, "Weather is taking longer than expected. Please try again.");
    }
    throw new WeatherServiceError(502, "Weather is temporarily unavailable.");
  }
  if (!response.ok) throw new WeatherServiceError(502, "Weather is temporarily unavailable.");

  try {
    return await response.json();
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new WeatherServiceError(504, "Weather is taking longer than expected. Please try again.");
    }
    throw new WeatherServiceError(502, "The weather service returned an unreadable response.");
  }
}

function nearestForecastPoint(timeseries, now) {
  if (!Array.isArray(timeseries) || timeseries.length === 0) return null;
  return timeseries.reduce((nearest, point) => {
    const time = Date.parse(point.time);
    if (!Number.isFinite(time)) return nearest;
    return !nearest || Math.abs(time - now) < Math.abs(Date.parse(nearest.time) - now)
      ? point
      : nearest;
  }, null);
}

function conditionFromMetSymbol(symbolCode) {
  const symbol = typeof symbolCode === "string" ? symbolCode.split("_")[0] : "";
  if (symbol.includes("thunder")) return "Thunderstorm";
  if (symbol.includes("fog")) return "Foggy";
  if (symbol.includes("sleet")) return "Sleet";
  if (symbol.includes("snow")) return symbol.includes("heavy") ? "Heavy snow" : "Snow";
  if (symbol.includes("drizzle")) return "Drizzle";
  if (symbol.includes("rain")) {
    return symbol.includes("heavy") ? "Heavy rain" : symbol.includes("showers") ? "Rain showers" : "Rain";
  }
  if (symbol.includes("cloudy")) return symbol === "cloudy" ? "Overcast" : "Partly cloudy";
  if (symbol.includes("clearsky")) return "Clear sky";
  if (symbol.includes("fair")) return "Mostly clear";
  return "Current conditions";
}

function estimateFeelsLike(temperature, humidity, windKph) {
  const fahrenheit = temperature * 9 / 5 + 32;
  if (fahrenheit >= 80 && Number.isFinite(humidity)) {
    let heatIndex = -42.379 + 2.04901523 * fahrenheit + 10.14333127 * humidity -
      0.22475541 * fahrenheit * humidity - 0.00683783 * fahrenheit ** 2 -
      0.05481717 * humidity ** 2 + 0.00122874 * fahrenheit ** 2 * humidity +
      0.00085282 * fahrenheit * humidity ** 2 - 0.00000199 * fahrenheit ** 2 * humidity ** 2;
    if (humidity < 13 && fahrenheit <= 112) {
      heatIndex -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(fahrenheit - 95)) / 17);
    } else if (humidity > 85 && fahrenheit <= 87) {
      heatIndex += ((humidity - 85) / 10) * ((87 - fahrenheit) / 5);
    }
    return (heatIndex - 32) * 5 / 9;
  }
  if (temperature <= 10 && Number.isFinite(windKph) && windKph >= 4.8) {
    const windPower = windKph ** 0.16;
    return 13.12 + 0.6215 * temperature - 11.37 * windPower +
      0.3965 * temperature * windPower;
  }
  return temperature;
}

function buildWeather({
  temperature,
  feelsLike,
  humidity,
  windKph,
  condition,
  observedAt,
  source,
  sourceUrl,
  licenseUrl,
  feelsLikeEstimated = false
}) {
  const roundedFeelsLike = Math.round(feelsLike);
  return {
    temperatureC: Math.round(temperature),
    feelsLikeC: roundedFeelsLike,
    feelsLikeEstimated,
    humidityPercent: Number.isFinite(humidity) ? Math.round(humidity) : null,
    windKph: Number.isFinite(windKph) ? Math.round(windKph) : null,
    condition,
    comfort: roundedFeelsLike >= 32 ? "hot" : roundedFeelsLike >= 27 ? "warm" : roundedFeelsLike <= 10 ? "cold" : roundedFeelsLike <= 18 ? "cool" : "comfortable",
    advice: roundedFeelsLike >= 32
      ? "It feels hot—drink water and take breaks in the shade."
      : roundedFeelsLike >= 27
        ? "It feels warm—light clothing and water may help."
        : roundedFeelsLike <= 10
          ? "It feels cold—bring a warm layer before heading out."
          : roundedFeelsLike <= 18
            ? "It feels cool—consider bringing a light layer."
            : "Conditions feel comfortable for heading out.",
    observedAt: typeof observedAt === "string" ? observedAt : null,
    source,
    sourceUrl,
    licenseUrl
  };
}

function cacheWeather(cache, key, weather, now) {
  if (cache.size >= 200) {
    for (const [cacheKey, entry] of cache) {
      if (entry.expiresAt <= now || cache.size >= 150) cache.delete(cacheKey);
    }
  }
  cache.set(key, { weather, expiresAt: now + 5 * 60_000 });
  return weather;
}

module.exports = { WeatherServiceError, createWeatherService };
