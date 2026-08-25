#!/usr/bin/env bash
# LifeOS deploy/update script — run on the droplet (as root) to ship new code:
#   ssh root@<droplet-ip> /opt/lifeos/deploy/update.sh
# Or from your Windows machine:
#   ssh root@<droplet-ip> "bash /opt/lifeos/deploy/update.sh"

set -euo pipefail

APP_DIR=/opt/lifeos
APP_USER=lifeos

echo "==> Pulling latest code"
sudo -u "$APP_USER" git -C "$APP_DIR" pull

echo "==> Installing any new dependencies"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --no-deps -r "$APP_DIR/requirements.txt"

echo "==> Refreshing systemd unit and crontab (in case they changed)"
cp "$APP_DIR/deploy/lifeos-api.service" /etc/systemd/system/lifeos-api.service
systemctl daemon-reload
crontab -u "$APP_USER" "$APP_DIR/deploy/lifeos.cron"

echo "==> Restarting API (re-registers the Telegram webhook if PUBLIC_DOMAIN changed)"
systemctl restart lifeos-api

systemctl --no-pager --full status lifeos-api | head -5
echo "Done."
