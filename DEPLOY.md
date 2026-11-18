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

## Before a permanent public deployment

- Use a named Cloudflare tunnel or a PaaS (Render, Railway, Fly) with a real
  domain; quick tunnels have no uptime guarantee.
- Keep SQLite on a persistent volume (`DATABASE_PATH`) or move to a hosted
  database using the existing repository adapter.
- Set unique `ADMIN_EMAIL` / `ADMIN_PASSWORD` values. Never expose the local
  default `admin@mangan.com` / `admin_123` credentials publicly.
- Configure email delivery before enabling `/api/auth/forgot` in production;
  it intentionally returns `503` until then.
- Set `GEOCODER_USER_AGENT` and `WEATHER_USER_AGENT` with contact details, and
  review the Open-Meteo non-commercial terms if the app is used commercially.

## Verification

```powershell
npm.cmd run check
npm.cmd test
```
