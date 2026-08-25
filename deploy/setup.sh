#!/usr/bin/env bash
# LifeOS first-time VPS provisioning (Ubuntu 24.04, run as root).
# Idempotent: safe to re-run; it pulls the latest code and re-installs configs.
#
# Required environment variables:
#   REPO_URL       clone URL including credentials for private repos, e.g.
#                  https://<token>@github.com/RylanJGraham/lifeOS.git
#   PUBLIC_DOMAIN  domain pointed at this droplet, e.g. lifeos-you.duckdns.org
#   TIMEZONE       server timezone for the cron schedule, e.g. Europe/Berlin
#                  (use the same timezone your Windows tasks ran in)
#
# After this script finishes, copy your .env to /opt/lifeos/.env and run:
#   systemctl start lifeos-api

set -euo pipefail

: "${REPO_URL:?Set REPO_URL (clone URL, with token for private repos)}"
: "${PUBLIC_DOMAIN:?Set PUBLIC_DOMAIN (e.g. lifeos-you.duckdns.org)}"
: "${TIMEZONE:?Set TIMEZONE (e.g. Europe/Berlin)}"

APP_DIR=/opt/lifeos
APP_USER=lifeos

echo "==> Installing system packages"
apt-get update
apt-get install -y python3 python3-venv python3-pip git curl ufw

# Caddy (official repo, per caddyserver.com docs)
if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
fi

echo "==> Setting timezone to $TIMEZONE"
timedatectl set-timezone "$TIMEZONE"

echo "==> Creating $APP_USER user"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"

echo "==> Cloning / updating repo in $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
    sudo -u "$APP_USER" git -C "$APP_DIR" pull
else
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi
mkdir -p "$APP_DIR/logs" "$APP_DIR/data/statements"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/logs" "$APP_DIR/data"

echo "==> Creating venv and installing dependencies (this takes a few minutes)"
if [ ! -d "$APP_DIR/venv" ]; then
    sudo -u "$APP_USER" python3 -m venv "$APP_DIR/venv"
fi
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --no-deps -r "$APP_DIR/requirements.txt"

echo "==> Installing systemd unit"
cp "$APP_DIR/deploy/lifeos-api.service" /etc/systemd/system/lifeos-api.service
systemctl daemon-reload
systemctl enable lifeos-api

echo "==> Installing crontab for $APP_USER"
crontab -u "$APP_USER" "$APP_DIR/deploy/lifeos.cron"

echo "==> Configuring Caddy for $PUBLIC_DOMAIN"
sed "s/LIFEOS_DOMAIN/$PUBLIC_DOMAIN/" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "==> Configuring firewall (allow SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat <<EOF

Done. Remaining manual steps:

  1. Copy your secrets:  scp .env root@<droplet-ip>:/opt/lifeos/.env
     (make sure it contains PUBLIC_DOMAIN=$PUBLIC_DOMAIN)
  2. chown the env file: ssh root@<droplet-ip> 'chown lifeos:lifeos /opt/lifeos/.env && chmod 600 /opt/lifeos/.env'
  3. Start the API:      ssh root@<droplet-ip> 'systemctl start lifeos-api'
  4. Verify:             curl https://$PUBLIC_DOMAIN/status

The Telegram webhook registers itself to https://$PUBLIC_DOMAIN/webhook on startup.
EOF
