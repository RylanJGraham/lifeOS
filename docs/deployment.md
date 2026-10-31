# Deploying LifeOS to a VPS (DigitalOcean)

Production setup: FastAPI backend + all scheduled workers on a single
DigitalOcean droplet (Ubuntu 24.04, $6/mo 1 GB is enough), Caddy providing HTTPS
for the Telegram webhook, cron replacing the Windows scheduled tasks, and the
Next.js dashboard on Vercel. Supabase stays hosted — only the Python backend moves.

Architecture on the droplet:

- `lifeos-api` systemd service runs `uvicorn api:app` on `127.0.0.1:8000`
  (working dir `/opt/lifeos/src`, env from `/opt/lifeos/.env`).
- Caddy reverse-proxies `https://<your-domain>` → `127.0.0.1:8000` and manages
  the Let's Encrypt certificate automatically.
- The `lifeos` user's crontab (`deploy/lifeos.cron`) runs all pipelines via
  `python src/pipeline_service.py run <id>` — the same entry point the Windows
  tasks use, so runs still land in `pipeline_runs` / `worker_heartbeats`.
- Ollama is **not** used in production; all LLM calls go through OpenRouter.
- ngrok is **not** used in production; the webhook registers to `PUBLIC_DOMAIN`.

## One-time setup

### 1. Create the droplet

- Ubuntu 24.04 LTS, Basic plan, 1 GB RAM ($6/mo), region closest to you.
- Add your SSH key during creation.

### 2. Get a domain (free)

- Go to [duckdns.org](https://www.duckdns.org), sign in, create a subdomain
  (e.g. `lifeos-you.duckdns.org`) and point it at the droplet's IP.
- (Or use your own domain: create an A record pointing at the droplet.)

### 3. Repo access token (private repo)

GitHub → Settings → Developer settings → Personal access tokens → create a
token with **repo read** access. The clone URL becomes:

```text
https://<TOKEN>@github.com/RylanJGraham/lifeOS.git
```

### 4. Provision the droplet

SSH in as root and run (adjust the three values):

```bash
curl -sL https://raw.githubusercontent.com/RylanJGraham/lifeOS/main/deploy/setup.sh -o /tmp/setup.sh
REPO_URL="https://<TOKEN>@github.com/RylanJGraham/lifeOS.git" \
PUBLIC_DOMAIN="lifeos-you.duckdns.org" \
TIMEZONE="Europe/Berlin" \
bash /tmp/setup.sh
```

`TIMEZONE` must match the timezone your Windows scheduled tasks ran in — all
cron times are server-local.

### 5. Add secrets and start

From your Windows machine:

```bash
scp .env root@<droplet-ip>:/opt/lifeos/.env
ssh root@<droplet-ip> "chown lifeos:lifeos /opt/lifeos/.env && chmod 600 /opt/lifeos/.env && systemctl start lifeos-api"
```

Make sure the droplet's `.env` contains:

- `PUBLIC_DOMAIN=lifeos-you.duckdns.org`
- `API_SECRET=<new long random string>` — **rotate it**: the previous value was shipped inside client bundles. Only the iOS Shortcut uses it now.
- `CORS_ORIGINS=https://<your-dashboard>.vercel.app` (comma separated; native mobile needs no CORS)
- `LIFEOS_TIMEZONE=<your IANA timezone>` — used for calendar phrases and cron-adjacent reminders.

Telegram is retired: the webhook is **not** registered unless you set `TELEGRAM_ENABLED=true`.
Remove `EXPO_PUBLIC_API_TOKEN` / `NEXT_PUBLIC_API_TOKEN` from the mobile and Vercel environments — clients now authenticate with their Supabase session.

Apply the new migrations (029–031) from a machine with `DATABASE_URL` set:
`python scripts/migrate.py --baseline 28` once on this existing database, then `python scripts/migrate.py`.

### 6. Verify

```bash
curl https://lifeos-you.duckdns.org/status
# {"status":"online","services":{"openrouter":"ok","supabase":"ok",...}}

curl -H "x-api-key: <API_SECRET>" https://lifeos-you.duckdns.org/api/pipelines
# 200 with your pipelines; without the header it must be 401
```

Then trigger a test notification from the app (Inbox → Notifications → "Send test notification") and watch the log:

```bash
ssh root@<droplet-ip> journalctl -u lifeos-api -f
```

### 7. Shut down the old local stack (critical)

Until you do this, workers run **twice** (duplicate Telegram messages, duplicate
insights) and the local API may steal the webhook back on restart.

On Windows (PowerShell, admin):

```powershell
Get-ScheduledTask -TaskName "LifeOS-*" | Disable-ScheduledTask
```

Stop the local API and ngrok services as well. Rollback is the reverse:
re-enable the tasks, restart the local API (it re-registers the webhook to the
ngrok domain).

### 8. Frontend on Vercel

- Import the repo in Vercel, set the root directory to `frontend`.
- Environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — as before
  - `NEXT_PUBLIC_API_URL=https://lifeos-you.duckdns.org`

## Day-to-day deploys

Push to `main`, then:

```bash
ssh root@<droplet-ip> "bash /opt/lifeos/deploy/update.sh"
```

This pulls, installs new dependencies, refreshes the systemd unit and crontab,
and restarts the API.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| Bot not answering | `journalctl -u lifeos-api -n 100`; check `/telegram/webhook-info` |
| Webhook pointing at old URL | restart the service — it re-registers on startup |
| Cron pipeline not running | `/opt/lifeos/logs/cron.log`; `crontab -u lifeos -l`; check timezone with `timedatectl` |
| TLS errors | `journalctl -u caddy -n 100`; confirm DNS resolves to the droplet |
| `pip install` fails with a websockets/realtime/langsmith conflict | Expected — always install with `pip install --no-deps -r requirements.txt` (see header of `requirements.txt`) |
| Dashboard can't reach API | check `NEXT_PUBLIC_API_URL` on Vercel and the `x-api-key` header |

## Notes

- Bank/CC statement PDFs uploaded via `/statements/upload` are stored under
  `/opt/lifeos/data/statements` on the droplet (`STATEMENT_DIRECTORY`).
- Local Windows development still works exactly as before: Ollama is optional
  (`general.py` falls back to OpenRouter), and ngrok remains the local webhook
  path via the legacy `NGROK_DOMAIN` variable.
