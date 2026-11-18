# MANGAN

MANGAN is a restaurant discovery guide for Dagupan. Food lovers can search
places by craving, inspect venue details, save favorites, and share feedback.
Restaurant owners can submit and manage listings, and admins review submissions.

## Run locally

Requires Node.js 22.13 or later. Run `START-XAMPP.bat` or use PowerShell:

```powershell
node server.js
```

Open <http://localhost:3198>. Stop the server with `Ctrl+C`. The first start
creates `data/mangan.sqlite` and applies the numbered SQL migrations.

Optional server settings:

```powershell
$env:PORT = "3198"
$env:HOST = "127.0.0.1"
$env:DATABASE_PATH = "C:\path\to\mangan.sqlite"
node server.js
```

### Run through XAMPP

The static frontend can be opened through Apache, but server-backed features
need the frontend and API on the same origin. Opening
`http://localhost/<project-folder>/public/index.html` directly in Apache is
local demo mode: it uses the sample catalog and `localStorage`, and does not
provide admin sign-in, owner listing tools, or weather.

To use those features alongside XAMPP, run `START-XAMPP.bat` from the
project folder. It starts the Node app and opens <http://localhost:3198>,
where the frontend and API are served together. Apache does not need to be
running for this mode.
The older `START-XAMPP-BETA.bat` and `START-BETA.bat` names remain as
compatibility launchers.

All CSS, JavaScript, image, and page links use relative paths, so the folder
can have any name.

### Admin account

Admin accounts cannot be registered from the public form. The app seeds the
default admin account `admin@mangan.com` / `admin_123` on first start. Override
both values with environment variables if you need different credentials; the
password must be between 8 and 128 characters:

```powershell
$env:ADMIN_EMAIL = "admin@example.test"
$env:ADMIN_PASSWORD = "Use-A-Unique-Local-Password!"
node server.js
```

On an existing database, any previously configured or reset admin password
remains in effect; the default is not reapplied on every server start.
In local development, password recovery shows a reset code on screen. Email
delivery is not configured, so password recovery returns an error when
`NODE_ENV=production`. Before deploying publicly, configure email recovery,
HTTPS, and unique administrator credentials; do not use the local default
credentials for a public service.

## Roles and walkthrough

- **Food lover:** Register at `/register.html`, choose **Food lover**, then
  search, filter, view details, and save restaurants.
- **Restaurant owner:** Register at `/register.html`, choose **Restaurant
  owner**, then use `/owner.html` to upload food and restaurant photos and
  submit, edit, or remove listings. JPEG, PNG, and WebP files up to 5 MB are
  supported. New and edited listings remain private until an admin approves
  them.
- **Admin:** Sign in with the environment-seeded account to use `/admin.html`.
  Review owner listings, suspend/restore non-admin accounts, and read feedback.
- **Guest:** Browse the Dagupan listings. Saving favorites and viewing full
  restaurant details requires signing in.

## Restaurant data and pricing

The catalog contains 30 notable Dagupan restaurants, most with links to their
public listing sources. It also keeps House of Bangus, located in neighboring
Calasiao, clearly labeled as nearby. This is a curated guide, not an exhaustive
directory. A few listings have uncertain current operating or dine-in status;
check each source and contact the venue before visiting. Hours and prices can
change. Ratings are shown only when community reviews exist, and unverified
prices are shown as **Contact venue**. Owner-submitted price ranges and all
displayed prices are in **Philippine pesos (₱)**. The local catalog is
`public/data/restaurants.json`; migration `009_dagupan_restaurant_guide.sql`
seeds the corresponding server database records.

## Checks

```powershell
npm.cmd test
npm.cmd run check
```

Smoke tests use a temporary SQLite database and cover the restaurant guide,
search, filters, favorites, account registration/login, owner submissions,
admin approval, password reset, feedback, and route validation.

## API and migration path

The browser uses same-origin JSON endpoints:

- `GET /api/health`, `GET /api/auth/me`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `POST /api/auth/forgot`, `POST /api/auth/reset` (development only)
- `GET /api/restaurants?q=&category=&sort=`
- `GET /api/restaurants/:id/location` (approved restaurant location; geocoded and cached on first request when configured)
- `GET /api/restaurants/nearby?lat=&lng=&radiusKm=` (approved, geocoded listings; radius 0.1–100 km)
- `GET /api/weather?lat=&lng=` (current conditions from Open-Meteo, with MET Norway fallback)
- `GET|POST /api/owner/restaurants`, `PATCH|DELETE /api/owner/restaurants/:id`
- `POST /api/owner/images` (owner-only JPEG, PNG, or WebP upload; 5 MB maximum)
- `POST /api/owner/geocode` (owner-only OpenStreetMap address lookup)
- `GET /api/admin/overview`, `PATCH /api/admin/restaurants/:id`,
  `PATCH /api/admin/users/:id`
- `GET|POST /api/favorites`, `DELETE /api/favorites/:restaurantId`
- `POST /api/feedback`

HTTP routing, authentication, SQLite migrations, and repository queries are
separated in `src/server.js`, `src/auth-service.js`, `src/database.js`, and
`src/restaurant-repository.js`. Add numbered SQL migrations under
`src/migrations/`. To move to a hosted database, preserve the HTTP/API contract
and replace the persistence adapter rather than rewriting the frontend.

## Geocoding and maps

Restaurants now have optional validated `latitude` and `longitude` values,
persisted by migration `006_restaurant_coordinates.sql`. Owners can save
coordinates with a listing, and the nearby-restaurants API returns approved,
geocoded listings with distance in kilometers. Listings without coordinates are
left out of nearby results. Address lookup uses OpenStreetMap's public Nominatim
service by default and does not require an API key. Requests are serialized to
one per second across the server process, and successful lookups are cached in
memory for 24 hours.

```powershell
$env:GEOCODER_USER_AGENT = "MANGAN/1.0 (your contact details)"
node server.js
```

The public Nominatim service is intended for low-volume use, not
high-traffic geocoding. Identify the application with a meaningful
`GEOCODER_USER_AGENT` and follow the
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
To use Google instead, configure `GOOGLE_MAPS_API_KEY`; the server will then
use Google Geocoding API. Keep that key server-side. On first opening a
restaurant with no saved coordinates, MANGAN can geocode its approved listing
and cache that location. The discovery details use Leaflet and OpenStreetMap
tiles to show the restaurant pin and (when permission is granted) the current
user location. The dashed connector is a straight-line preview; the Google
Maps link opens turn-by-turn directions.

The detail view displays current destination weather from Open-Meteo, with MET
Norway as a fallback, including a cold/cool/warm/hot comfort note. Weather is
cached for five minutes, and its source and CC BY 4.0 attribution are linked.
Open-Meteo's free API is for non-commercial use; arrange a suitable plan before
commercial deployment.
Configure an identifying user agent with a contact email or public URL when
deploying; it is sent to MET Norway:

```powershell
$env:WEATHER_USER_AGENT = "MANGAN/1.0 (your contact email or public website)"
node server.js
```

Weather failures are shown as a status message rather than breaking restaurant
details. Both map tiles and weather need an internet connection. Browser
geolocation normally requires localhost or HTTPS and is optional; denying
permission still leaves the restaurant pin and directions.
