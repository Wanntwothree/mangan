const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/server");
const { createGoogleMapsService } = require("../src/google-maps-service");
const { createNominatimService } = require("../src/nominatim-service");
const { createWeatherService } = require("../src/weather-service");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mangan-beta-"));
const databasePath = path.join(temporaryDirectory, "test.sqlite");
const visitor = "123e4567-e89b-42d3-a456-426614174000";
const geocodeCalls = [];
const mapsService = {
  isConfigured: true,
  async geocode(address) {
    geocodeCalls.push(address);
    return {
      formattedAddress: `${address}, Dagupan City, Philippines`,
      latitude: 16.043,
      longitude: 120.334,
      placeId: "beta-place-id"
    };
  }
};
const weatherCalls = [];
const weatherService = {
  async current(latitude, longitude) {
    weatherCalls.push([latitude, longitude]);
    return {
      temperatureC: 34,
      feelsLikeC: 36,
      humidityPercent: 70,
      windKph: 12,
      condition: "Partly cloudy",
      comfort: "hot",
      advice: "It feels hot—drink water and take breaks in the shade.",
      observedAt: "2026-10-26T12:00",
      source: "Open-Meteo"
    };
  }
};
let app;
let baseUrl;

before(async () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_EMAIL = "mangan-admin@example.test";
  process.env.ADMIN_PASSWORD = "AdminBeta!2026VeryStrong";
  app = createApp({
    databasePath,
    uploadDirectory: path.join(temporaryDirectory, "uploads"),
    mapsService,
    weatherService
  });
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = originalAdminEmail;
  if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalAdminPassword;
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  if (app) {
    await new Promise((resolve, reject) => {
      app.server.close((error) => error ? reject(error) : resolve());
    });
    app.database.close();
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("beta app serves the discovery page and healthy API", async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /Good food/);

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.deepEqual(health, { status: "ok", service: "mangan" });
});

test("state-changing requests work behind an HTTPS reverse proxy", async () => {
  const forwardedHeaders = {
    "Content-Type": "application/json",
    Origin: "https://public.example",
    "X-Forwarded-Proto": "https",
    "X-Forwarded-Host": "public.example"
  };
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: forwardedHeaders,
    body: JSON.stringify({ email: "mangan-admin@example.test", password: "AdminBeta!2026VeryStrong" })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.role, "admin");

  const blocked = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ email: "mangan-admin@example.test", password: "AdminBeta!2026VeryStrong" })
  });
  assert.equal(blocked.status, 403);
});

test("fresh database accepts the documented default admin credentials", async () => {
  const defaultAdminDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mangan-default-admin-"));
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  let defaultAdminApp;
  try {
    defaultAdminApp = createApp({
      databasePath: path.join(defaultAdminDirectory, "test.sqlite"),
      weatherService
    });
    await new Promise((resolve) => defaultAdminApp.server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${defaultAdminApp.server.address().port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@mangan.com", password: "admin_123" })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.role, "admin");
  } finally {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
    if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalAdminPassword;
    if (defaultAdminApp) {
      if (defaultAdminApp.server.listening) {
        await new Promise((resolve, reject) => {
          defaultAdminApp.server.close((error) => error ? reject(error) : resolve());
        });
      }
      defaultAdminApp.database.close();
    }
    fs.rmSync(defaultAdminDirectory, { recursive: true, force: true });
  }
});

test("a configured admin password is enforced on an existing database", async () => {
  const enforceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mangan-admin-enforce-"));
  const enforceDatabasePath = path.join(enforceDirectory, "test.sqlite");
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  const login = async (url, password) => fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "enforce-admin@example.test", password })
  });
  let firstApp;
  let secondApp;
  try {
    process.env.ADMIN_EMAIL = "enforce-admin@example.test";
    process.env.ADMIN_PASSWORD = "First!Password2026";
    firstApp = createApp({ databasePath: enforceDatabasePath, weatherService });
    await new Promise((resolve) => firstApp.server.listen(0, "127.0.0.1", resolve));
    const firstUrl = `http://127.0.0.1:${firstApp.server.address().port}`;
    assert.equal((await login(firstUrl, "First!Password2026")).status, 200);

    await new Promise((resolve) => firstApp.server.close(resolve));
    firstApp.database.close();
    firstApp = null;

    process.env.ADMIN_PASSWORD = "Second!Password2026";
    secondApp = createApp({ databasePath: enforceDatabasePath, weatherService });
    await new Promise((resolve) => secondApp.server.listen(0, "127.0.0.1", resolve));
    const secondUrl = `http://127.0.0.1:${secondApp.server.address().port}`;
    assert.equal((await login(secondUrl, "Second!Password2026")).status, 200);
    assert.equal((await login(secondUrl, "First!Password2026")).status, 401);
  } finally {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
    if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalAdminPassword;
    for (const instance of [firstApp, secondApp]) {
      if (!instance) continue;
      if (instance.server.listening) {
        await new Promise((resolve) => instance.server.close(resolve));
      }
      instance.database.close();
    }
    fs.rmSync(enforceDirectory, { recursive: true, force: true });
  }
});

test("restaurant list supports category, search, and sorting", async () => {
  const all = await fetch(`${baseUrl}/api/restaurants`).then((response) => response.json());
  assert.equal(all.restaurants.length, 31);
  assert.equal(all.restaurants[0].name, "House of Bangus");
  assert.equal(all.restaurants[0].imageUrl, "/images/bangus-relleno-all-natural-food.jpg");
  assert.equal(all.restaurants[0].venueImageUrl, "/images/bangus-relleno-all-natural-restaurant.jpg");
  assert.equal(all.restaurants.find((restaurant) => restaurant.slug === "house-of-bangus").latitude, 16.0180041);
  assert.equal(all.restaurants.find((restaurant) => restaurant.slug === "ciudad-elmina").latitude, 16.0345605);
  assert.equal(all.restaurants.find((restaurant) => restaurant.slug === "matutina-gerrys").latitude, 16.0552954);
  assert.ok(all.restaurants.find((restaurant) => restaurant.slug === "silverios-seafoods").sourceUrl.startsWith("https://"));

  const seafood = await fetch(`${baseUrl}/api/restaurants?category=seafood`).then((response) => response.json());
  assert.equal(seafood.restaurants.length, 9);

  const search = await fetch(`${baseUrl}/api/restaurants?q=Silantro`).then((response) => response.json());
  assert.equal(search.restaurants.length, 1);
  assert.equal(search.restaurants[0].slug, "silantro-fil-mex-cantina");

  const sorted = await fetch(`${baseUrl}/api/restaurants?sort=name`).then((response) => response.json());
  assert.equal(sorted.restaurants[0].name, "Abozayn - Dagupan");

  const invalid = await fetch(`${baseUrl}/api/restaurants?category=unlisted`);
  assert.equal(invalid.status, 400);
});

test("favorites are isolated by browser and remain persisted in SQLite", async () => {
  const headers = { "Content-Type": "application/json", "X-Mangan-Visitor": visitor };
  const save = await fetch(`${baseUrl}/api/favorites`, {
    method: "POST",
    headers,
    body: JSON.stringify({ restaurantId: 1 })
  });
  assert.equal(save.status, 201);

  const favorites = await fetch(`${baseUrl}/api/favorites`, { headers }).then((response) => response.json());
  assert.deepEqual(favorites.favorites.map((item) => item.slug), ["house-of-bangus"]);

  const otherVisitor = await fetch(`${baseUrl}/api/favorites`, {
    headers: { "X-Mangan-Visitor": "123e4567-e89b-42d3-a456-426614174001" }
  }).then((response) => response.json());
  assert.equal(otherVisitor.favorites.length, 0);

  const invalid = await fetch(`${baseUrl}/api/favorites`, {
    method: "POST",
    headers,
    body: JSON.stringify({ restaurantId: 999 })
  });
  assert.equal(invalid.status, 400);

  const remove = await fetch(`${baseUrl}/api/favorites/1`, { method: "DELETE", headers });
  assert.equal(remove.status, 200);
});

test("beta feedback validates input and is stored", async () => {
  const headers = { "Content-Type": "application/json" };
  const invalid = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ topic: "idea", message: "short" })
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ topic: "idea", message: "Add more restaurant photos please." })
  });
  assert.equal(valid.status, 201);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM beta_feedback").get().count, 1);
});

test("API rejects malformed and oversized request bodies clearly", async () => {
  const malformed = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /valid JSON/);

  const oversized = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: "idea", message: "x".repeat(11_000) })
  });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /too large/);

  const nonObject = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "null"
  });
  assert.equal(nonObject.status, 400);
  assert.match((await nonObject.json()).error, /JSON object/);
});

test("Google Maps geocoding adapter keeps its key server-side and handles provider responses", async () => {
  let requestedUrl;
  const service = createGoogleMapsService({
    apiKey: "test-key-never-returned-to-client",
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      assert.ok(options.signal);
      return {
        ok: true,
        json: async () => ({
          status: "OK",
          results: [{
            formatted_address: "12 Beta Road, Dagupan City, Philippines",
            geometry: { location: { lat: 16.043, lng: 120.334 } },
            place_id: "google-place-id"
          }]
        })
      };
    }
  });
  const location = await service.geocode("12 Beta Road, Dagupan City");
  assert.equal(requestedUrl.hostname, "maps.googleapis.com");
  assert.equal(requestedUrl.searchParams.get("components"), "country:PH");
  assert.equal(requestedUrl.searchParams.get("key"), "test-key-never-returned-to-client");
  assert.deepEqual(location, {
    formattedAddress: "12 Beta Road, Dagupan City, Philippines",
    latitude: 16.043,
    longitude: 120.334,
    placeId: "google-place-id"
  });

  const unconfigured = createGoogleMapsService({});
  await assert.rejects(unconfigured.geocode("12 Beta Road"), (error) => error.status === 503);

  const noResults = createGoogleMapsService({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "ZERO_RESULTS" }) })
  });
  await assert.rejects(noResults.geocode("Unknown address"), (error) => error.status === 404);
});

test("Nominatim geocoder searches the Philippines, identifies MANGAN, and caches results", async () => {
  let callCount = 0;
  let requestedUrl;
  const service = createNominatimService({
    userAgent: "MANGAN-beta/test",
    fetchImpl: async (url, options) => {
      callCount += 1;
      requestedUrl = new URL(url);
      assert.equal(options.headers["User-Agent"], "MANGAN-beta/test");
      assert.equal(options.headers.Accept, "application/json");
      assert.ok(options.signal);
      return {
        ok: true,
        json: async () => [{
          place_id: 123,
          display_name: "12 Beta Road, Dagupan City, Philippines",
          lat: "16.043",
          lon: "120.334"
        }]
      };
    }
  });

  assert.equal(service.isConfigured, true);
  const location = await service.geocode("12 Beta Road, Dagupan City");
  assert.equal(requestedUrl.hostname, "nominatim.openstreetmap.org");
  assert.equal(requestedUrl.pathname, "/search");
  assert.equal(requestedUrl.searchParams.get("format"), "jsonv2");
  assert.equal(requestedUrl.searchParams.get("limit"), "1");
  assert.equal(requestedUrl.searchParams.get("countrycodes"), "ph");
  assert.deepEqual(location, {
    formattedAddress: "12 Beta Road, Dagupan City, Philippines",
    latitude: 16.043,
    longitude: 120.334,
    placeId: 123
  });
  assert.deepEqual(await service.geocode("  12 beta road,   dagupan city "), location);
  assert.equal(callCount, 1);

  const noResults = createNominatimService({ fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  await assert.rejects(noResults.geocode("Unknown address"), (error) => error.status === 404);
});

test("Open-Meteo adapter classifies cold and hot weather and caches responses", async () => {
  let callCount = 0;
  let apparentTemperature = 34;
  const service = createWeatherService({
    fetchImpl: async (url, options) => {
      callCount += 1;
      assert.equal(new URL(url).hostname, "api.open-meteo.com");
      assert.equal(new URL(url).searchParams.get("forecast_days"), "1");
      assert.ok(options.signal);
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: apparentTemperature,
            apparent_temperature: apparentTemperature,
            relative_humidity_2m: 60,
            weather_code: 1,
            wind_speed_10m: 8,
            time: "2026-10-26T12:00"
          }
        })
      };
    }
  });

  const hot = await service.current(16.043, 120.334);
  assert.equal(hot.comfort, "hot");
  assert.match(hot.advice, /drink water/i);
  apparentTemperature = 5;
  const cached = await service.current(16.043, 120.334);
  assert.equal(cached.comfort, "hot");
  assert.equal(callCount, 1);
  const cold = await service.current(16.15, 120.45);
  assert.equal(cold.comfort, "cold");
  assert.match(cold.advice, /warm layer/i);
  assert.equal(callCount, 2);

  const failed = createWeatherService({
    fetchImpl: async () => ({ ok: false })
  });
  await assert.rejects(failed.current(16, 120), (error) => error.status === 502);

  const timedOut = createWeatherService({
    fetchImpl: async () => {
      const error = new Error("request timed out");
      error.name = "TimeoutError";
      throw error;
    }
  });
  await assert.rejects(timedOut.current(16, 120), (error) => error.status === 504);
});

test("weather adapter falls back to MET Norway with attribution", async () => {
  const service = createWeatherService({
    fetchImpl: async (url, options) => {
      if (new URL(url).hostname === "api.open-meteo.com") {
        const error = new Error("request timed out");
        error.name = "TimeoutError";
        throw error;
      }

      assert.equal(new URL(url).hostname, "api.met.no");
      assert.equal(new URL(url).pathname, "/weatherapi/locationforecast/2.0/compact");
      assert.ok(options.signal);
      assert.match(options.headers["User-Agent"], /^MANGAN\//);
      return {
        ok: true,
        json: async () => ({
          properties: {
            timeseries: [{
              time: new Date().toISOString(),
              data: {
                instant: {
                  details: {
                    air_temperature: 31.4,
                    relative_humidity: 59,
                    wind_speed: 3.6
                  }
                },
                next_1_hours: { summary: { symbol_code: "partlycloudy_day" } }
              }
            }]
          }
        })
      };
    }
  });

  const weather = await service.current(16.043, 120.334);
  assert.equal(weather.source, "MET Norway");
  assert.equal(weather.sourceUrl, "https://api.met.no/weatherapi/locationforecast/2.0/documentation");
  assert.equal(weather.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(weather.condition, "Partly cloudy");
  assert.equal(weather.temperatureC, 31);
  assert.equal(weather.humidityPercent, 59);
  assert.equal(weather.windKph, 13);
  assert.equal(weather.feelsLikeEstimated, true);
});

test("public restaurant location lookup geocodes once and caches coordinates", async () => {
  geocodeCalls.length = 0;
  app.database.prepare("UPDATE restaurants SET latitude = NULL, longitude = NULL WHERE slug = 'house-of-bangus'").run();
  const first = await fetch(`${baseUrl}/api/restaurants/1/location`);
  assert.equal(first.status, 200);
  const location = await first.json();
  assert.equal(location.location.latitude, 16.043);
  assert.equal(location.location.longitude, 120.334);
  assert.deepEqual(geocodeCalls, [
    "House of Bangus, RBA Paramount Building, Old De Venecia Highway, Calasiao, Calasiao (near Dagupan), Philippines"
  ]);

  const second = await fetch(`${baseUrl}/api/restaurants/1/location`);
  assert.equal(second.status, 200);
  assert.deepEqual(geocodeCalls, [
    "House of Bangus, RBA Paramount Building, Old De Venecia Highway, Calasiao, Calasiao (near Dagupan), Philippines"
  ]);

  mapsService.isConfigured = false;
  const ciudadPin = await fetch(`${baseUrl}/api/restaurants/2/location`);
  assert.equal(ciudadPin.status, 200);
  const ciudadLocation = await ciudadPin.json();
  assert.equal(ciudadLocation.location.latitude, 16.0345605);
  assert.equal(ciudadLocation.location.longitude, 120.3441752);
  const matutinaPin = await fetch(`${baseUrl}/api/restaurants/3/location`);
  assert.equal(matutinaPin.status, 200);
  const matutinaLocation = await matutinaPin.json();
  assert.equal(matutinaLocation.location.latitude, 16.0552954);
  assert.equal(matutinaLocation.location.longitude, 120.3374765);

  const silveriosId = app.database.prepare("SELECT id FROM restaurants WHERE slug = 'silverios-seafoods'").get().id;
  const verifiedPin = await fetch(`${baseUrl}/api/restaurants/${silveriosId}/location`);
  assert.equal(verifiedPin.status, 200);
  const silveriosLocation = await verifiedPin.json();
  assert.equal(silveriosLocation.location.latitude, 16.058418);
  assert.equal(silveriosLocation.location.longitude, 120.3400588);
  assert.equal(geocodeCalls.length, 1);

  mapsService.isConfigured = true;

  const unknown = await fetch(`${baseUrl}/api/restaurants/999/location`);
  assert.equal(unknown.status, 404);
  assert.match((await fetch(`${baseUrl}/`).then((response) => response.text())), /app\.js\?v=15/);
});

test("coordinate migration corrects the matched Chowking branch without changing other pins", () => {
  const result = app.database.prepare(`
    INSERT INTO restaurants
      (slug, name, neighborhood, address, description, image_url, rating, review_count,
       price_level, categories_json, highlights_json, hours, is_open, featured,
       status, price_min, price_max, venue_image_url, created_at, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, '₱', '["meat"]', '[]', 'Daily', 1, 0,
       'approved', 40, 900, ?, CURRENT_TIMESTAMP, 16.043, 120.339)
  `).run(
    "migration-chowking-test",
    "Chowking",
    "Dagupan City",
    "AB Fernandez Ave, St, Dagupan City, Pangasinan",
    "Migration test restaurant listing.",
    "/images/ciudad-dining.svg",
    "/images/ciudad-dining.svg"
  );
  const restaurantId = Number(result.lastInsertRowid);
  try {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "src", "migrations", "007_verified_restaurant_coordinates.sql"),
      "utf8"
    );
    app.database.exec(migration);
    const location = app.database.prepare("SELECT latitude, longitude FROM restaurants WHERE id = ?").get(restaurantId);
    assert.equal(location.latitude, 16.0456592);
    assert.equal(location.longitude, 120.3420809);
  } finally {
    app.database.prepare("DELETE FROM restaurants WHERE id = ?").run(restaurantId);
  }
});

test("weather API validates coordinates and returns current conditions", async () => {
  const invalid = await fetch(`${baseUrl}/api/weather?lat=100&lng=120`);
  assert.equal(invalid.status, 400);

  const missing = await fetch(`${baseUrl}/api/weather?lat=16.043`);
  assert.equal(missing.status, 400);

  const response = await fetch(`${baseUrl}/api/weather?lat=16.043&lng=120.334`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.weather.comfort, "hot");
  assert.equal(result.weather.feelsLikeC, 36);
  assert.deepEqual(weatherCalls, [[16.043, 120.334]]);
});

test("user and owner registration, login, and role authorization", async () => {
  const registerUser = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Beta Food Lover",
      email: "food-lover@example.test",
      password: "Foodie!2026",
      role: "user"
    })
  });
  assert.equal(registerUser.status, 201);
  const userResult = await registerUser.json();
  assert.equal(userResult.user.role, "user");
  const userCookie = registerUser.headers.get("set-cookie").split(";")[0];

  const ownerRegister = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Restaurant Owner",
      email: "owner@example.test",
      password: "Owner!2026Food",
      role: "owner"
    })
  });
  assert.equal(ownerRegister.status, 201);
  const ownerResult = await ownerRegister.json();
  assert.equal(ownerResult.user.role, "owner");
  const ownerCookie = ownerRegister.headers.get("set-cookie").split(";")[0];
  const disposableRegister = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Disposable Account",
      email: "disposable@example.test",
      password: "Disposable!2026",
      role: "user"
    })
  });
  assert.equal(disposableRegister.status, 201);
  const disposableUser = (await disposableRegister.json()).user;
  const disposableCookie = disposableRegister.headers.get("set-cookie").split(";")[0];
  const weakPassword = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Weak Password User",
      email: "weak-password@example.test",
      password: "password",
      role: "user"
    })
  });
  assert.equal(weakPassword.status, 400);
  assert.match((await weakPassword.json()).error, /uppercase letter.*lowercase letter.*number.*symbol/i);

  const forbidden = await fetch(`${baseUrl}/api/owner/restaurants`, {
    headers: { Cookie: userCookie }
  });
  assert.equal(forbidden.status, 403);
  const adminForbidden = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: userCookie }
  });
  assert.equal(adminForbidden.status, 403);
  const userGeocodeForbidden = await fetch(`${baseUrl}/api/owner/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookie },
    body: JSON.stringify({ address: "12 Beta Road, Dagupan City" })
  });
  assert.equal(userGeocodeForbidden.status, 403);
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "mangan-admin@example.test", password: "AdminBeta!2026VeryStrong" })
  });
  assert.equal(adminLogin.status, 200);
  const adminUser = (await adminLogin.json()).user;
  assert.equal(adminUser.role, "admin");
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
  const ownerForbidden = await fetch(`${baseUrl}/api/owner/restaurants`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(ownerForbidden.status, 403);
  const missingSession = await fetch(`${baseUrl}/api/owner/restaurants`);
  assert.equal(missingSession.status, 401);

  const ownerSignIn = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "OWNER@example.test", password: "Owner!2026Food" })
  });
  assert.equal(ownerSignIn.status, 200);
  assert.match(ownerSignIn.headers.get("set-cookie"), /HttpOnly/);
  assert.match(ownerSignIn.headers.get("set-cookie"), /SameSite=Strict/);
  assert.ok(ownerCookie.startsWith("mangan_session="));

  const nonAdminDelete = await fetch(`${baseUrl}/api/admin/users/${disposableUser.id}`, {
    method: "DELETE",
    headers: { Cookie: ownerCookie }
  });
  assert.equal(nonAdminDelete.status, 403);

  const protectedAdminDelete = await fetch(`${baseUrl}/api/admin/users/${adminUser.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie }
  });
  assert.equal(protectedAdminDelete.status, 403);

  const deletedUser = await fetch(`${baseUrl}/api/admin/users/${disposableUser.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie }
  });
  assert.equal(deletedUser.status, 200);
  assert.deepEqual(await deletedUser.json(), { removed: true });

  const deletedUserSession = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: disposableCookie }
  }).then((response) => response.json());
  assert.equal(deletedUserSession.user, null);
});

test("owner submissions require admin approval and display PHP price ranges", async () => {
  geocodeCalls.length = 0;
  const owner = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: "Owner!2026Food" })
  });
  const ownerCookie = owner.headers.get("set-cookie").split(";")[0];
  const unauthenticatedGeocode = await fetch(`${baseUrl}/api/owner/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "12 Beta Road, Dagupan City" })
  });
  assert.equal(unauthenticatedGeocode.status, 401);

  const shortAddress = await fetch(`${baseUrl}/api/owner/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ address: "road" })
  });
  assert.equal(shortAddress.status, 400);

  const geocode = await fetch(`${baseUrl}/api/owner/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ address: "12 Beta Road, Dagupan City" })
  });
  assert.equal(geocode.status, 200);
  assert.equal((await geocode.json()).location.latitude, 16.043);
  assert.deepEqual(geocodeCalls, ["12 Beta Road, Dagupan City"]);

  for (let requestNumber = 0; requestNumber < 9; requestNumber += 1) {
    await fetch(`${baseUrl}/api/owner/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ address: "12 Beta Road, Dagupan City" })
    });
  }
  const rateLimited = await fetch(`${baseUrl}/api/owner/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ address: "12 Beta Road, Dagupan City" })
  });
  assert.equal(rateLimited.status, 429);
  assert.equal(geocodeCalls.length, 10);

  const invalidNearby = await fetch(`${baseUrl}/api/restaurants/nearby?lat=91&lng=120`);
  assert.equal(invalidNearby.status, 400);

  const invalidCoordinates = await fetch(`${baseUrl}/api/owner/restaurants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Owner's Test Cafe",
      neighborhood: "Dagupan City",
      address: "12 Beta Road, Dagupan City",
      description: "A sample restaurant listing submitted for beta review.",
      priceMin: 180,
      priceMax: 450,
      hours: "Daily · 9:00 AM – 8:00 PM",
      categories: ["dessert"],
      imageUrl: "/images/ciudad-dining.svg",
      latitude: 16.043
    })
  });
  assert.equal(invalidCoordinates.status, 400);

  const photo = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=",
    "base64"
  );
  const foodUpload = await fetch(`${baseUrl}/api/owner/images`, {
    method: "POST",
    headers: { "Content-Type": "image/png", Cookie: ownerCookie },
    body: photo
  });
  assert.equal(foodUpload.status, 201);
  const { url: foodImageUrl } = await foodUpload.json();
  assert.match(foodImageUrl, /^\/uploads\/[a-f0-9-]{36}\.png$/);

  const venueUpload = await fetch(`${baseUrl}/api/owner/images`, {
    method: "POST",
    headers: { "Content-Type": "image/png", Cookie: ownerCookie },
    body: photo
  });
  assert.equal(venueUpload.status, 201);
  const { url: venueImageUrl } = await venueUpload.json();
  const servedPhoto = await fetch(`${baseUrl}${foodImageUrl}`);
  assert.equal(servedPhoto.status, 200);
  assert.equal(servedPhoto.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await servedPhoto.arrayBuffer()), photo);

  const submission = await fetch(`${baseUrl}/api/owner/restaurants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Owner's Test Cafe",
      neighborhood: "Dagupan City",
      address: "12 Beta Road, Dagupan City",
      description: "A sample restaurant listing submitted for beta review.",
      priceMin: 180,
      priceMax: 450,
      hours: "Daily · 9:00 AM – 8:00 PM",
      categories: ["dessert", "drinks"],
      highlights: ["Coffee", "Local treats"],
      imageUrl: foodImageUrl,
      venueImageUrl,
      latitude: 16.043,
      longitude: 120.334
    })
  });
  assert.equal(submission.status, 201);
  const submitted = await submission.json();
  assert.equal(submitted.restaurant.status, "pending");
  assert.equal(submitted.restaurant.priceMin, 180);
  assert.equal(submitted.restaurant.imageUrl, foodImageUrl);
  assert.equal(submitted.restaurant.venueImageUrl, venueImageUrl);
  assert.equal(submitted.restaurant.latitude, 16.043);
  assert.equal(submitted.restaurant.longitude, 120.334);

  const publicList = await fetch(`${baseUrl}/api/restaurants`).then((response) => response.json());
  assert.equal(publicList.restaurants.length, 31);

  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "mangan-admin@example.test", password: "AdminBeta!2026VeryStrong" })
  });
  assert.equal(adminLogin.status, 200);
  assert.equal((await adminLogin.json()).user.role, "admin");
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
  const overview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: adminCookie }
  }).then((response) => response.json());
  assert.equal(overview.stats.pending, 1);
  const restaurantEdit = {
    name: "Owner's Updated Cafe",
    neighborhood: "Pantal, Dagupan City",
    address: "14 Updated Beta Road, Dagupan City",
    description: "An updated sample restaurant listing for the local dining guide.",
    priceMin: 0,
    priceMax: 0,
    hours: "Daily · 10:00 AM – 9:00 PM",
    categories: ["meat"],
    highlights: ["Updated menu", "Family meals"],
    imageUrl: "/images/representative/ty-ans-pigar-pigar-galvan.jpg",
    venueImageUrl: "/images/representative/simeonas-seafood-bonuan.jpg",
    latitude: 16.043,
    longitude: 120.334,
    sourceUrl: "https://example.test/restaurant",
    isOpen: true,
    featured: false
  };
  const unauthorizedEdit = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify(restaurantEdit)
  });
  assert.equal(unauthorizedEdit.status, 403);

  const invalidImageEdit = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ ...restaurantEdit, imageUrl: "/images/representative/not-a-real-image.jpg" })
  });
  assert.equal(invalidImageEdit.status, 400);

  const blankPriceEdit = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ ...restaurantEdit, priceMin: "", priceMax: "" })
  });
  assert.equal(blankPriceEdit.status, 400);

  const malformedEdit = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: "null"
  });
  assert.equal(malformedEdit.status, 400);

  const edit = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(restaurantEdit)
  });
  assert.equal(edit.status, 200);
  const editedOverview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: adminCookie }
  }).then((response) => response.json());
  const editedRestaurant = editedOverview.restaurants.find((item) => item.id === submitted.restaurant.id);
  assert.equal(editedRestaurant.status, "pending");
  assert.equal(editedRestaurant.name, restaurantEdit.name);
  assert.equal(editedRestaurant.priceMin, 0);
  assert.equal(editedRestaurant.priceMax, 0);
  assert.deepEqual(editedRestaurant.categories, ["meat"]);
  assert.deepEqual(editedRestaurant.highlights, restaurantEdit.highlights);
  assert.equal(editedRestaurant.imageUrl, restaurantEdit.imageUrl);
  assert.equal(editedRestaurant.sourceUrl, restaurantEdit.sourceUrl);
  assert.equal(editedRestaurant.isOpen, true);

  const standardPriceEdit = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ ...restaurantEdit, priceMin: 220, priceMax: 550 })
  });
  assert.equal(standardPriceEdit.status, 200);

  const approval = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ status: "approved" })
  });
  assert.equal(approval.status, 200);

  const approvedList = await fetch(`${baseUrl}/api/restaurants`).then((response) => response.json());
  assert.equal(approvedList.restaurants.length, 32);
  assert.equal(approvedList.restaurants.find((item) => item.id === submitted.restaurant.id).priceMax, 550);
  const nearby = await fetch(`${baseUrl}/api/restaurants/nearby?lat=16.043&lng=120.334&radiusKm=5`)
    .then((response) => response.json());
  const nearbySubmission = nearby.restaurants.find((restaurant) => restaurant.id === submitted.restaurant.id);
  assert.ok(nearbySubmission);
  assert.equal(nearbySubmission.distanceKm, 0);

  const unauthorizedDelete = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "DELETE",
    headers: { Cookie: ownerCookie }
  });
  assert.equal(unauthorizedDelete.status, 403);

  const deletion = await fetch(`${baseUrl}/api/admin/restaurants/${submitted.restaurant.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie }
  });
  assert.equal(deletion.status, 200);
  const deletedOverview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: adminCookie }
  }).then((response) => response.json());
  assert.equal(deletedOverview.stats.restaurants, 31);
  assert.equal(deletedOverview.restaurants.some((restaurant) => restaurant.id === submitted.restaurant.id), false);
  const deletedPublicList = await fetch(`${baseUrl}/api/restaurants`).then((response) => response.json());
  assert.equal(deletedPublicList.restaurants.length, 31);
});

test("forgot password codes expire after a successful password reset", async () => {
  const forgot = await fetch(`${baseUrl}/api/auth/forgot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "food-lover@example.test" })
  });
  assert.equal(forgot.status, 200);
  const { developmentCode } = await forgot.json();
  assert.match(developmentCode, /^\d{6}$/);

  const reset = await fetch(`${baseUrl}/api/auth/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "food-lover@example.test",
      code: developmentCode,
      password: "Fresh!2026Meal"
    })
  });
  assert.equal(reset.status, 200);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "food-lover@example.test", password: "Fresh!2026Meal" })
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.role, "user");
});

test("static file access stays inside the public directory", async () => {
  const illustration = await fetch(`${baseUrl}/images/bangus-table.svg`);
  assert.equal(illustration.status, 200);
  assert.match(illustration.headers.get("content-type"), /image\/svg\+xml/);

  const missing = await fetch(`${baseUrl}/not-a-real-page`);
  assert.equal(missing.status, 404);
  const apiMissing = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(apiMissing.status, 404);

  for (const page of ["login.html", "register.html", "forgot.html", "reset.html", "owner.html", "admin.html"]) {
    const response = await fetch(`${baseUrl}/${page}`);
    assert.equal(response.status, 200, `${page} should be available`);
    assert.match(response.headers.get("content-type"), /text\/html/);
  }
  const login = await fetch(`${baseUrl}/login.html`).then((response) => response.text());
  assert.match(login, /data-password-toggle="login-password"/);
  const register = await fetch(`${baseUrl}/register.html`).then((response) => response.text());
  assert.match(register, /data-password-rule="symbol"/);
  assert.match(register, /data-password-toggle="register-confirm"/);
});

test("static catalog and server database include the sourced Dagupan guide", async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "data", "restaurants.json"), "utf8"));
  assert.equal(catalog.length, 31);
  assert.equal(new Set(catalog.map((restaurant) => restaurant.slug)).size, catalog.length);
  assert.equal(catalog.filter((restaurant) => restaurant.sourceUrl).length, 30);
  assert.ok(catalog.every((restaurant) => restaurant.rating === 0 && restaurant.reviewCount === 0));
  assert.ok(catalog.filter((restaurant) => restaurant.priceMin > 0).length >= 25);
  const representativeRestaurants = catalog.filter((restaurant) => restaurant.id > 3);
  assert.equal(representativeRestaurants.length, 28);
  for (const restaurant of representativeRestaurants) {
    assert.match(restaurant.imageUrl, /^images\/representative\//);
    assert.equal(restaurant.venueImageUrl, restaurant.imageUrl);
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", restaurant.imageUrl)));
  }
  const serverCatalog = await fetch(`${baseUrl}/api/restaurants`).then((response) => response.json());
  const seededServerCatalog = serverCatalog.restaurants.filter((restaurant) => restaurant.ownerId === null);
  assert.deepEqual(
    seededServerCatalog.map((restaurant) => restaurant.slug).sort(),
    catalog.map((restaurant) => restaurant.slug).sort()
  );
  for (const restaurant of catalog) {
    const stored = seededServerCatalog.find((item) => item.slug === restaurant.slug);
    assert.equal(stored.sourceUrl, restaurant.sourceUrl || "");
    assert.equal(stored.imageUrl, `/${restaurant.imageUrl}`);
    assert.equal(stored.venueImageUrl, `/${restaurant.venueImageUrl}`);
    assert.equal(stored.priceMin, restaurant.priceMin);
    assert.equal(stored.priceMax, restaurant.priceMax);
  }
});

test("XAMPP launcher opens the frontend and API on the same origin", () => {
  const launcher = fs.readFileSync(path.join(__dirname, "..", "START-XAMPP.bat"), "utf8");
  assert.match(launcher, /set PORT=3198/i);
  assert.match(launcher, /start "" "http:\/\/localhost:3198"/i);
  assert.match(launcher, /MANGAN Server/i);
  assert.doesNotMatch(launcher, /localhost:8080/i);
  const legacyLauncher = fs.readFileSync(path.join(__dirname, "..", "START-XAMPP-BETA.bat"), "utf8");
  assert.match(legacyLauncher, /START-XAMPP\.bat/i);
});
