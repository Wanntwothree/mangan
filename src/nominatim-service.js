class GeocodingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createNominatimService({ fetchImpl = fetch, userAgent = "MANGAN/1.0" } = {}) {
  const cache = new Map();
  let nextRequestAt = 0;
  let requestQueue = Promise.resolve();

  async function fetchSearch(endpoint) {
    const request = requestQueue.then(async () => {
      const delay = Math.max(0, nextRequestAt - Date.now());
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      nextRequestAt = Date.now() + 1000;
      return fetchImpl(endpoint, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(8000)
      });
    });
    requestQueue = request.then(() => undefined, () => undefined);
    return request;
  }

  return {
    isConfigured: true,
    async geocode(address) {
      const normalizedAddress = address.trim().replace(/\s+/g, " ").toLowerCase();
      const cached = cache.get(normalizedAddress);
      if (cached && cached.expiresAt > Date.now()) return cached.location;

      const endpoint = new URL("https://nominatim.openstreetmap.org/search");
      endpoint.searchParams.set("q", address);
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("limit", "1");
      endpoint.searchParams.set("countrycodes", "ph");

      let response;
      try {
        response = await fetchSearch(endpoint);
      } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          throw new GeocodingError(504, "Address lookup took too long. Please try again.");
        }
        throw new GeocodingError(502, "Address lookup is temporarily unavailable.");
      }
      if (response.status === 429) {
        throw new GeocodingError(429, "Address lookup is rate limited. Please try again shortly.");
      }
      if (!response.ok) {
        throw new GeocodingError(502, "Address lookup is temporarily unavailable.");
      }

      let result;
      try {
        result = await response.json();
      } catch {
        throw new GeocodingError(502, "The address service returned an unreadable response.");
      }

      const place = Array.isArray(result) ? result[0] : null;
      const latitude = Number(place?.lat);
      const longitude = Number(place?.lon);
      if (!place) throw new GeocodingError(404, "The address service could not find that address.");
      if (typeof place.display_name !== "string" ||
          !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new GeocodingError(502, "The address service returned an invalid location.");
      }

      const location = {
        formattedAddress: place.display_name,
        latitude,
        longitude,
        placeId: place.place_id
      };
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(normalizedAddress, { location, expiresAt: Date.now() + 24 * 60 * 60_000 });
      return location;
    }
  };
}

module.exports = { GeocodingError, createNominatimService };
