# Deploying MANGAN

## Public preview (this session)

The app is served on port `3198` in production mode and exposed through a
Cloudflare quick tunnel, which provides a public HTTPS URL without an account:

```powershell
$env:NODE_ENV = "production"
$env:PORT = "3198"
$env:HOST = "127.0.0.1"
node server.js
```

In a second terminal:

```powershell
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3198
```

Copy the `https://<name>.trycloudflare.com` URL printed by `cloudflared` and
share it. For this session the live URL is:

**https://birds-advise-seller-classifieds.trycloudflare.com**

The URL is temporary: it changes whenever the tunnel restarts and stops working
when this machine sleeps or the processes exit. The admin password for this
preview was restored to the local default (`admin@mangan.com` / `admin_123`) on
request. Replace it with unique credentials before any permanent deployment.

## Deployment fixes applied

- The origin check now trusts `X-Forwarded-Proto` and `X-Forwarded-Host` from
  the HTTPS reverse proxy. Without this, every login, favorite, upload, and
  admin action returned `403` behind a TLS-terminating tunnel or load balancer.
- In production, the server binds `0.0.0.0` by default so container/PaaS health
  checks can reach it. Set `HOST` explicitly to override.
- A regression test covers POST requests through an HTTPS proxy, and a
  mismatched `Origin` is still rejected.

## Stable `mangan` domain

A Cloudflare quick tunnel cannot use a chosen name. For a stable link containing
`mangan`, deploy the repo to Render: `render.yaml` names the service `mangan`, so
Render publishes it at **https://mangan.onrender.com**.

1. Push this repo (already initialized on `main`) to GitHub/GitLab.
2. In Render, create a **Web Service** from that repo — it will pick up
   `render.yaml` automatically.
3. Fill in the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values when prompted, then
   deploy. Render sets `PORT` and provides HTTPS.
4. If `mangan.onrender.com` is already taken, Render will append a suffix; use a
   custom domain or pick another host name.

Note: on Render's free plan the filesystem is ephemeral, so SQLite data and
owner uploads reset on each deploy. Add a persistent disk (paid plan) or move to
a hosted database/object storage for permanent data.

## Before a permanent public deployment

- Use a named Cloudflare tunnel or a PaaS (Render, Railway, Fly) with a real
  domain; quick tunnels have no uptime guarantee.
- Keep SQLite on a persistent volume (`DATABASE_PATH`) or move to a hosted
  database using the existing repository adapter.
- Set unique `ADMIN_EMAIL` / `ADMIN_PASSWORD` values. Never expose the local
  default `admin@mangan.com` / `admin_123` credentials publicly. In production,
  or whenever `ADMIN_PASSWORD` is set, the effective password is authoritative:
  on every start it is applied to the admin account, so changing the Render
  environment variable and redeploying is enough to rotate it. If no admin
  password variable is configured in production, the local default is applied —
  always set a unique value before exposing the app publicly.
- Configure email delivery before enabling `/api/auth/forgot` in production;
  it intentionally returns `503` until then.
- Set `GEOCODER_USER_AGENT` and `WEATHER_USER_AGENT` with contact details, and
  review the Open-Meteo non-commercial terms if the app is used commercially.

## Verification

```powershell
npm.cmd run check
npm.cmd test
```
