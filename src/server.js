const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { openDatabase } = require("./database");
const { AuthError, createAuthService } = require("./auth-service");
const { createGoogleMapsService } = require("./google-maps-service");
const { createNominatimService } = require("./nominatim-service");
const { createRestaurantRepository } = require("./restaurant-repository");
const { createWeatherService } = require("./weather-service");
const { createMailerFromEnvironment } = require("./mail-service");

const publicDirectory = path.join(__dirname, "..", "public");
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "mangan.sqlite");
const maxBodyLength = 10_000;
const maxImageLength = 5 * 1024 * 1024;
const sessionCookie = "mangan_session";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
const categories = new Set(["all", "meat", "seafood", "drinks", "dessert"]);
const visitorIdPattern = /^[a-f0-9-]{36}$/i;
const restaurantImages = new Set([
  "/images/bangus-table.svg",
  "/images/ciudad-dining.svg",
  "/images/seafood-spread.svg"
]);

function cookieValue(request, name) {
  const prefix = `${name}=`;
  for (const part of (request.headers.cookie || "").split(";")) {
    const cookie = part.trim();
    if (!cookie.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

function setSessionCookie(response, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function validateRestaurant(body, { allowRepresentativeImages = false, allowUnknownPrice = false } = {}) {
  const text = (key, max) => typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
  const name = text("name", 100);
  const neighborhood = text("neighborhood", 100);
  const address = text("address", 240);
  const description = text("description", 500);
  const hours = text("hours", 100);
  const priceMin = Number(body.priceMin);
  const priceMax = Number(body.priceMax);
  const coordinate = (value) => {
    if (value === undefined || value === "" || value === null) return null;
    if (typeof value !== "number" && typeof value !== "string") return Number.NaN;
    if (typeof value === "string" && !value.trim()) return Number.NaN;
    return Number(value);
  };
  const latitude = coordinate(body.latitude);
  const longitude = coordinate(body.longitude);
  const categoriesInput = Array.isArray(body.categories) ? body.categories : [];
  const categoriesValue = [...new Set(categoriesInput.filter((item) =>
    typeof item === "string" && ["meat", "seafood", "drinks", "dessert"].includes(item)
  ))];
  const highlightsInput = Array.isArray(body.highlights)
    ? body.highlights
    : typeof body.highlights === "string" ? body.highlights.split(",") : [];
  const highlights = highlightsInput
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 5);
  const galleryImage = (key) => {
    const value = text(key, 100).replace(/^\/+/, "");
    return value ? `/${value}` : "";
  };
  const imageUrl = galleryImage("imageUrl");
  const venueImageUrl = galleryImage("venueImageUrl") || imageUrl;
  const isAllowedImage = (value) => restaurantImages.has(value) ||
    (allowRepresentativeImages &&
      /^\/images\/representative\/[a-z0-9-]+\.jpg$/.test(value) &&
      fs.existsSync(path.join(publicDirectory, value.slice(1)))) ||
    /^\/uploads\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(value);

  if (name.length < 3 || neighborhood.length < 2 || address.length < 5) {
    throw new AuthError(400, "Enter the restaurant name, neighborhood, and complete address.");
  }
  if (description.length < 15 || !hours) {
    throw new AuthError(400, "Add a description (at least 15 characters) and opening hours.");
  }
  const isContactVenuePrice = allowUnknownPrice &&
    (body.priceMin === 0 || body.priceMin === "0") &&
    (body.priceMax === 0 || body.priceMax === "0");
  if (!Number.isInteger(priceMin) || !Number.isInteger(priceMax) ||
      (!isContactVenuePrice && priceMin < 1) || priceMax < priceMin || priceMax > 100_000) {
    throw new AuthError(400, "Enter a valid price range in Philippine pesos.");
  }
  if ((latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    throw new AuthError(400, "Enter both valid map coordinates: latitude from -90 to 90 and longitude from -180 to 180.");
  }
  if (!categoriesValue.length || !isAllowedImage(imageUrl) || !isAllowedImage(venueImageUrl)) {
    throw new AuthError(400, "Choose a food category and upload valid restaurant photos.");
  }
  return { name, neighborhood, address, description, hours, priceMin, priceMax, categories: categoriesValue, highlights, imageUrl, venueImageUrl, latitude, longitude };
}

function validateAdminRestaurant(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AuthError(400, "Enter restaurant details to save.");
  }
  const restaurant = validateRestaurant(body, {
    allowRepresentativeImages: true,
    allowUnknownPrice: true
  });
  if (typeof body.isOpen !== "boolean" || typeof body.featured !== "boolean") {
    throw new AuthError(400, "Choose valid open and featured listing settings.");
  }
  if (body.sourceUrl !== undefined && typeof body.sourceUrl !== "string") {
    throw new AuthError(400, "Enter a valid HTTPS source URL or leave the field blank.");
  }
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  if (sourceUrl.length > 2048) {
    throw new AuthError(400, "The source URL must be 2048 characters or fewer.");
  }
  if (sourceUrl) {
    let parsedSourceUrl;
    try {
      parsedSourceUrl = new URL(sourceUrl);
    } catch {
      throw new AuthError(400, "Enter a valid HTTPS source URL or leave the field blank.");
    }
    if (parsedSourceUrl.protocol !== "https:") {
      throw new AuthError(400, "Enter a valid HTTPS source URL or leave the field blank.");
    }
  }
  return { ...restaurant, sourceUrl, isOpen: body.isOpen, featured: body.featured };
}

function readImage(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      length += chunk.length;
      if (length > maxImageLength) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Each photo must be 5 MB or smaller."), { status: 413 }));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    request.on("error", reject);
  });
}

function imageExtension(contentType, content) {
  if (contentType === "image/jpeg" && content.length >= 4 &&
      content[0] === 0xff && content[1] === 0xd8 &&
      content[content.length - 2] === 0xff && content[content.length - 1] === 0xd9) return ".jpg";
  if (contentType === "image/png" && content.length >= 24 &&
      content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      content.toString("ascii", 12, 16) === "IHDR") return ".png";
  if (contentType === "image/webp" && content.length >= 12 &&
      content.toString("ascii", 0, 4) === "RIFF" &&
      content.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      if (Buffer.byteLength(body) + Buffer.byteLength(chunk) > maxBodyLength) {
        tooLarge = true;
        body = "";
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        return;
      }
      try {
        const payload = body ? JSON.parse(body) : {};
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          reject(Object.assign(new Error("Request body must be a JSON object."), { status: 400 }));
          return;
        }
        resolve(payload);
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function visitorIdFrom(request) {
  const visitorId = request.headers["x-mangan-visitor"];
  return typeof visitorId === "string" && visitorIdPattern.test(visitorId) ? visitorId : null;
}

function staticPath(pathname, uploadDirectory) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.startsWith("/uploads/")) {
    const uploadPath = path.resolve(uploadDirectory, decoded.slice("/uploads/".length));
    return uploadPath.startsWith(`${uploadDirectory}${path.sep}`) ? uploadPath : null;
  }
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(publicDirectory, relativePath);
  return filePath.startsWith(`${publicDirectory}${path.sep}`) ? filePath : null;
}

function createApp(options = {}) {
  const database = openDatabase(options.databasePath || databasePath);
  const uploadDirectory = options.uploadDirectory || path.join(publicDirectory, "uploads");
  const repository = createRestaurantRepository(database);
  const auth = createAuthService(database);
  const googleMapsApiKey = options.googleMapsApiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  const maps = options.mapsService || (googleMapsApiKey
    ? createGoogleMapsService({
      apiKey: googleMapsApiKey,
      countryCode: options.googleMapsCountry ?? process.env.GOOGLE_MAPS_COUNTRY ?? "PH"
    })
    : createNominatimService({ userAgent: process.env.GEOCODER_USER_AGENT || "MANGAN/1.0" }));
  const weather = options.weatherService || createWeatherService();
  const mailer = options.mailer || createMailerFromEnvironment();
  const publicGeocodeLimits = new Map();
  const geocodeRateLimits = new Map();
  const configuredAdminPassword = process.env.ADMIN_PASSWORD;
  const enforceAdminPassword = Boolean(configuredAdminPassword) || process.env.NODE_ENV === "production";
  auth.seedAdmin(
    process.env.ADMIN_EMAIL || "admin@mangan.com",
    configuredAdminPassword || "admin_123",
    { enforcePassword: enforceAdminPassword }
  );

  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org https://tile.openstreetmap.org; style-src 'self' https://unpkg.com; font-src 'self'; script-src 'self' https://unpkg.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");

    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.headers.origin;
      const forwardedProtocol = typeof request.headers["x-forwarded-proto"] === "string"
        ? request.headers["x-forwarded-proto"].split(",")[0].trim().toLowerCase()
        : "";
      const protocol = request.socket.encrypted || forwardedProtocol === "https" ? "https" : "http";
      const forwardedHost = typeof request.headers["x-forwarded-host"] === "string"
        ? request.headers["x-forwarded-host"].split(",")[0].trim()
        : "";
      const host = forwardedHost || request.headers.host;
      if (origin && origin !== `${protocol}://${host}`) {
        sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
        return;
      }
    }

    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    } catch {
      sendJson(response, 400, { error: "Request URL is invalid." });
      return;
    }

    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url, repository, auth, database, maps, weather, mailer, geocodeRateLimits, publicGeocodeLimits, uploadDirectory);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }

      let filePath;
      try {
        filePath = staticPath(url.pathname, uploadDirectory);
      } catch {
        sendJson(response, 400, { error: "Request path is invalid." });
        return;
      }
      if (!filePath) {
        sendJson(response, 403, { error: "That file is not available." });
        return;
      }

      fs.readFile(filePath, (error, content) => {
        if (error) {
          sendJson(response, 404, { error: "Page not found." });
          return;
        }
        response.writeHead(200, {
          "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
          "Content-Length": content.length,
          "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600"
        });
        response.end(request.method === "HEAD" ? undefined : content);
      });
    } catch (error) {
      if (error.status && !response.headersSent) {
        sendJson(response, error.status, { error: error.message });
      } else {
        console.error("Request failed:", error);
      }
      if (response.headersSent) response.destroy();
      else if (!error.status) sendJson(response, 500, { error: "Something went wrong. Please try again." });
    }
  });

  return { server, database };
}

function authorizedUser(request, response, auth, role) {
  const user = auth.userForSession(cookieValue(request, sessionCookie));
  if (!user) {
    sendJson(response, 401, { error: "Sign in to continue." });
    return null;
  }
  if (role && user.role !== role) {
    sendJson(response, 403, { error: "This page is only available to the correct account role." });
    return null;
  }
  return user;
}

async function handleApi(request, response, url, repository, auth, database, maps, weather, mailer, geocodeRateLimits, publicGeocodeLimits, uploadDirectory) {
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    sendJson(response, 200, { user: auth.userForSession(cookieValue(request, sessionCookie)) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(request);
    const user = auth.register(body);
    const session = auth.issueSession(user.id);
    setSessionCookie(response, session.token, session.expiresAt);
    sendJson(response, 201, { user });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const user = auth.login(body);
    const session = auth.issueSession(user.id);
    setSessionCookie(response, session.token, session.expiresAt);
    sendJson(response, 200, { user });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    auth.revokeSession(cookieValue(request, sessionCookie));
    clearSessionCookie(response);
    sendJson(response, 200, { loggedOut: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/forgot") {
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const code = auth.requestPasswordReset(email);
    const genericMessage = "If that email belongs to an account, a reset code has been sent.";
    if (!code) {
      sendJson(response, 200, { message: genericMessage });
      return;
    }
    if (!mailer.isConfigured()) {
      sendJson(response, 200, {
        message: "Email delivery is not configured, so your reset code is shown here.",
        developmentCode: code
      });
      return;
    }
    try {
      await mailer.sendPasswordResetCode({ to: email, code });
      sendJson(response, 200, { message: genericMessage });
    } catch (error) {
      console.error("Password recovery email could not be sent:", error.message);
      sendJson(response, 200, {
        message: "The email could not be sent, so your reset code is shown here.",
        developmentCode: code
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/reset") {
    const body = await readJson(request);
    auth.resetPassword(body);
    clearSessionCookie(response);
    sendJson(response, 200, { reset: true, message: "Password updated. You can sign in with your new password." });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", service: "mangan" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/restaurants") {
    const category = (url.searchParams.get("category") || "all").toLowerCase();
    const sort = url.searchParams.get("sort") || "recommended";
    const query = url.searchParams.get("q") || "";
    if (!categories.has(category)) {
      sendJson(response, 400, { error: "Choose a supported food category." });
      return;
    }
    if (!["recommended", "rating", "name"].includes(sort)) {
      sendJson(response, 400, { error: "Choose a supported sort order." });
      return;
    }
    if (query.length > 100) {
      sendJson(response, 400, { error: "Search text must be 100 characters or fewer." });
      return;
    }
    sendJson(response, 200, { restaurants: repository.list({ category, sort, query }) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/restaurants/nearby") {
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lng"));
    const radiusKm = url.searchParams.has("radiusKm") ? Number(url.searchParams.get("radiusKm")) : 25;
    if (!url.searchParams.has("lat") || !url.searchParams.has("lng") ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AuthError(400, "Provide a valid map center using lat (-90 to 90) and lng (-180 to 180).");
    }
    if (!Number.isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 100) {
      throw new AuthError(400, "Choose a search radius from 0.1 to 100 kilometers.");
    }
    sendJson(response, 200, { restaurants: repository.listNearby({ latitude, longitude, radiusKm }) });
    return;
  }

  const locationMatch = url.pathname.match(/^\/api\/restaurants\/(\d+)\/location$/);
  if (request.method === "GET" && locationMatch) {
    const restaurant = repository.getById(Number(locationMatch[1]));
    if (!restaurant) throw new AuthError(404, "That restaurant is not available.");
    if (restaurant.latitude !== null && restaurant.longitude !== null) {
      sendJson(response, 200, {
        location: {
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          formattedAddress: restaurant.address
        }
      });
      return;
    }
    if (!maps.isConfigured) {
      sendJson(response, 200, {
        location: null,
        message: "Exact pins need address lookup configured or coordinates supplied by the restaurant owner."
      });
      return;
    }

    const clientAddress = request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const previous = publicGeocodeLimits.get(clientAddress);
    const bucket = !previous || now - previous.startedAt >= 60_000
      ? { startedAt: now, count: 0 }
      : previous;
    if (bucket.count >= 20) {
      throw new AuthError(429, "Too many map lookups. Please wait a minute and try again.");
    }
    bucket.count += 1;
    publicGeocodeLimits.set(clientAddress, bucket);

    let location;
    try {
      location = await maps.geocode(`${restaurant.name}, ${restaurant.address}, ${restaurant.neighborhood}, Philippines`);
    } catch (error) {
      if (error.status !== 404) throw error;
      location = await maps.geocode(`${restaurant.name}, ${restaurant.neighborhood}, Philippines`);
    }
    repository.saveGeocodedLocation(restaurant.id, location.latitude, location.longitude);
    sendJson(response, 200, { location });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/weather") {
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lng"));
    if (!url.searchParams.has("lat") || !url.searchParams.has("lng") ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AuthError(400, "Provide valid weather coordinates: latitude from -90 to 90 and longitude from -180 to 180.");
    }
    sendJson(response, 200, { weather: await weather.current(latitude, longitude) });
    return;
  }

  if (url.pathname.startsWith("/api/owner/")) {
    const owner = authorizedUser(request, response, auth, "owner");
    if (!owner) return;

    if (request.method === "POST" && url.pathname === "/api/owner/images") {
      const contentType = (request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const content = await readImage(request);
      const extension = imageExtension(contentType, content);
      if (!extension) throw new AuthError(415, "Upload a valid JPEG, PNG, or WebP photo.");
      const filename = `${crypto.randomUUID()}${extension}`;
      await fs.promises.mkdir(uploadDirectory, { recursive: true });
      await fs.promises.writeFile(path.join(uploadDirectory, filename), content, { flag: "wx" });
      sendJson(response, 201, { url: `/uploads/${filename}` });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/owner/geocode") {
      const body = await readJson(request);
      const address = typeof body.address === "string" ? body.address.trim() : "";
      if (address.length < 5 || address.length > 240) {
        throw new AuthError(400, "Enter an address between 5 and 240 characters.");
      }
      if (!maps.isConfigured) {
        throw new AuthError(503, "Address lookup is not configured on this server.");
      }

      const now = Date.now();
      const previous = geocodeRateLimits.get(owner.id);
      const bucket = !previous || now - previous.startedAt >= 60_000
        ? { startedAt: now, count: 0 }
        : previous;
      if (bucket.count >= 10) {
        throw new AuthError(429, "Too many address lookups. Please wait a minute and try again.");
      }
      bucket.count += 1;
      geocodeRateLimits.set(owner.id, bucket);

      sendJson(response, 200, { location: await maps.geocode(address) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/owner/restaurants") {
      sendJson(response, 200, { restaurants: repository.listByOwner(owner.id) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/owner/restaurants") {
      const restaurant = validateRestaurant(await readJson(request));
      sendJson(response, 201, { restaurant: repository.createOwnedRestaurant(owner.id, restaurant) });
      return;
    }
    const editMatch = url.pathname.match(/^\/api\/owner\/restaurants\/(\d+)$/);
    if (editMatch && request.method === "PATCH") {
      const restaurant = validateRestaurant(await readJson(request));
      const saved = repository.updateOwnedRestaurant(owner.id, Number(editMatch[1]), restaurant);
      if (!saved) throw new AuthError(404, "That restaurant was not found under your account.");
      sendJson(response, 200, { saved: true, status: "pending" });
      return;
    }
    if (editMatch && request.method === "DELETE") {
      const removed = repository.deleteOwnedRestaurant(owner.id, Number(editMatch[1]));
      if (!removed) throw new AuthError(404, "That restaurant was not found under your account.");
      sendJson(response, 200, { removed: true });
      return;
    }
  }

  if (url.pathname.startsWith("/api/admin/")) {
    const admin = authorizedUser(request, response, auth, "admin");
    if (!admin) return;

    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
      const count = (sql) => database.prepare(sql).get().count;
      const restaurants = database.prepare(`
        SELECT restaurants.id, restaurants.slug, restaurants.name, restaurants.neighborhood,
          restaurants.address, restaurants.description,
          restaurants.image_url AS imageUrl, restaurants.venue_image_url AS venueImageUrl,
          restaurants.hours, restaurants.is_open AS isOpen, restaurants.featured,
          restaurants.latitude, restaurants.longitude, restaurants.source_url AS sourceUrl,
          restaurants.highlights_json AS highlights,
          restaurants.status, restaurants.price_min AS priceMin,
          restaurants.price_max AS priceMax, restaurants.categories_json AS categories,
          restaurants.owner_id AS ownerId, users.name AS ownerName, users.email AS ownerEmail,
          restaurants.created_at AS createdAt
        FROM restaurants LEFT JOIN users ON users.id = restaurants.owner_id
        ORDER BY CASE restaurants.status WHEN 'pending' THEN 0 ELSE 1 END, restaurants.created_at DESC
      `).all().map((restaurant) => ({
        ...restaurant,
        categories: JSON.parse(restaurant.categories),
        highlights: JSON.parse(restaurant.highlights),
        isOpen: Boolean(restaurant.isOpen),
        featured: Boolean(restaurant.featured)
      }));
      const feedback = database.prepare(`
        SELECT id, topic, message, created_at AS createdAt
        FROM beta_feedback ORDER BY created_at DESC LIMIT 30
      `).all();
      sendJson(response, 200, {
        stats: {
          users: count("SELECT COUNT(*) AS count FROM users WHERE role = 'user'"),
          owners: count("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'"),
          restaurants: count("SELECT COUNT(*) AS count FROM restaurants"),
          pending: count("SELECT COUNT(*) AS count FROM restaurants WHERE status = 'pending'"),
          feedback: count("SELECT COUNT(*) AS count FROM beta_feedback")
        },
        users: auth.listUsers(),
        restaurants,
        feedback
      });
      return;
    }
    const restaurantMatch = url.pathname.match(/^\/api\/admin\/restaurants\/(\d+)$/);
    if (restaurantMatch && request.method === "DELETE") {
      const removed = repository.deleteAdminRestaurant(Number(restaurantMatch[1]));
      if (!removed) throw new AuthError(404, "Restaurant not found.");
      sendJson(response, 200, { removed: true });
      return;
    }
    if (restaurantMatch && request.method === "PUT") {
      const restaurant = validateAdminRestaurant(await readJson(request));
      const saved = repository.updateAdminRestaurant(Number(restaurantMatch[1]), restaurant);
      if (!saved) throw new AuthError(404, "Restaurant not found.");
      sendJson(response, 200, { saved: true });
      return;
    }
    if (restaurantMatch && request.method === "PATCH") {
      const body = await readJson(request);
      if (!["approved", "rejected", "pending"].includes(body.status)) {
        throw new AuthError(400, "Choose an approved, rejected, or pending status.");
      }
      const result = database.prepare("UPDATE restaurants SET status = ? WHERE id = ?")
        .run(body.status, Number(restaurantMatch[1]));
      if (!result.changes) throw new AuthError(404, "Restaurant not found.");
      sendJson(response, 200, { status: body.status });
      return;
    }
    const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && request.method === "PATCH") {
      const body = await readJson(request);
      if (typeof body.isActive !== "boolean" || !auth.setUserActive(Number(userMatch[1]), body.isActive)) {
        throw new AuthError(400, "That user could not be updated.");
      }
      sendJson(response, 200, { isActive: body.isActive });
      return;
    }
    if (userMatch && request.method === "DELETE") {
      if (!auth.deleteUser(Number(userMatch[1]))) throw new AuthError(404, "Account not found.");
      sendJson(response, 200, { removed: true });
      return;
    }
  }

  if (url.pathname === "/api/favorites") {
    const visitorId = visitorIdFrom(request);
    if (!visitorId) {
      sendJson(response, 400, { error: "Your browser session is missing. Refresh and try again." });
      return;
    }

    if (request.method === "GET") {
      sendJson(response, 200, { favorites: repository.getFavorites(visitorId) });
      return;
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const restaurantId = Number(body.restaurantId);
      if (!Number.isSafeInteger(restaurantId) || !repository.getById(restaurantId)) {
        sendJson(response, 400, { error: "Choose a restaurant from the list." });
        return;
      }
      repository.saveFavorite(visitorId, restaurantId);
      sendJson(response, 201, { saved: true });
      return;
    }
  }

  const favoriteMatch = url.pathname.match(/^\/api\/favorites\/(\d+)$/);
  if (request.method === "DELETE" && favoriteMatch) {
    const visitorId = visitorIdFrom(request);
    if (!visitorId) {
      sendJson(response, 400, { error: "Your browser session is missing. Refresh and try again." });
      return;
    }
    repository.removeFavorite(visitorId, Number(favoriteMatch[1]));
    sendJson(response, 200, { saved: false });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readJson(request);
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!["bug", "idea", "other"].includes(topic)) {
      sendJson(response, 400, { error: "Choose a feedback topic." });
      return;
    }
    if (message.length < 8 || message.length > 1000) {
      sendJson(response, 400, { error: "Feedback must be between 8 and 1,000 characters." });
      return;
    }
    repository.saveFeedback({ topic, message });
    sendJson(response, 201, { received: true });
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

function startServer() {
  const port = Number(process.env.PORT) || 3198;
  const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  const app = createApp();
  app.server.listen(port, host, () => {
    const address = app.server.address();
    console.log(`MANGAN is ready at http://${host}:${address.port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      app.server.close(() => {
        app.database.close();
        process.exit(0);
      });
    });
  }
  return app;
}

module.exports = { createApp, startServer };
