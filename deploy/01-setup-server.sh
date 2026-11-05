#!/usr/bin/env bash
# ONE-TIME server setup for Retail Verse, fully isolated from other projects.
#   - Linux user  : retailverse   (own home, own files)
#   - Node        : nvm inside that user (does NOT change the system node)
#   - PM2         : separate PM2 daemon owned by that user
#   - MongoDB     : Docker container "retailverse-mongo" on 127.0.0.1:27018 (not public)
#   - Backend     : 127.0.0.1:$BACKEND_PORT (not public, only via Nginx)
#   - Nginx       : one new file /etc/nginx/sites-available/retailverse (other sites untouched)
#
# Usage:  sudo DOMAIN=retail.example.com EMAIL=you@example.com bash 01-setup-server.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive   # never stop on apt prompts

DOMAIN="${DOMAIN:?Set DOMAIN=your.domain}"
EMAIL="${EMAIL:?Set EMAIL=you@example.com (for SSL certificate)}"
APP_USER="retailverse"
BACKEND_PORT="${BACKEND_PORT:-5050}"
MONGO_PORT="${MONGO_PORT:-27018}"
NODE_VERSION="${NODE_VERSION:-22}"
HOME_DIR="/home/$APP_USER"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }

port_busy() { ss -ltn "( sport = :$1 )" | grep -q LISTEN; }
if port_busy "$BACKEND_PORT"; then echo "Port $BACKEND_PORT is in use. Re-run with BACKEND_PORT=<free port>"; exit 1; fi

echo ">> Packages (only installs what is missing)"
apt-get update -y
command -v nginx   >/dev/null || apt-get install -y nginx
command -v docker  >/dev/null || apt-get install -y docker.io
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
apt-get install -y curl git openssl tar
systemctl enable --now docker

echo ">> App user"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$HOME_DIR"/{app,data/uploads,releases,logs}
chown -R "$APP_USER:$APP_USER" "$HOME_DIR"
chmod 755 "$HOME_DIR"   # nginx must read app/dist

echo ">> MongoDB (Docker, private to this server)"
SECRETS="$HOME_DIR/.secrets"
if [ ! -f "$SECRETS" ]; then
  echo "MONGO_PASS=$(openssl rand -hex 24)" > "$SECRETS"
  chown "$APP_USER:$APP_USER" "$SECRETS"; chmod 600 "$SECRETS"
fi
# shellcheck disable=SC1090
. "$SECRETS"
if ! docker ps -a --format '{{.Names}}' | grep -qx retailverse-mongo; then
  if port_busy "$MONGO_PORT"; then echo "Port $MONGO_PORT in use. Re-run with MONGO_PORT=<free port>"; exit 1; fi
  docker run -d --name retailverse-mongo --restart unless-stopped \
    -p 127.0.0.1:"$MONGO_PORT":27017 \
    -v retailverse-mongo-data:/data/db \
    -e MONGO_INITDB_ROOT_USERNAME=rvadmin \
    -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASS" \
    mongo:7   # mongo:8 refuses to start on Linux kernel >= 6.19 (SERVER-121912)
fi

echo ">> Node $NODE_VERSION + PM2 for $APP_USER only (via nvm)"
sudo -u "$APP_USER" -H bash -lc "
  set -e
  [ -d \$HOME/.nvm ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  . \$HOME/.nvm/nvm.sh
  nvm install $NODE_VERSION && nvm alias default $NODE_VERSION
  npm i -g pm2
"
NODE_BIN_DIR="$(sudo -u "$APP_USER" -H bash -lc '. $HOME/.nvm/nvm.sh && dirname $(which node)')"
env PATH="$PATH:$NODE_BIN_DIR" "$NODE_BIN_DIR/pm2" startup systemd -u "$APP_USER" --hp "$HOME_DIR" >/dev/null
echo "   PM2 boot service: pm2-$APP_USER"

echo ">> Backend .env (created once, edit later to add API keys)"
ENV_FILE="$HOME_DIR/backend.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$BACKEND_PORT
MONGO_URI=mongodb://rvadmin:$MONGO_PASS@127.0.0.1:$MONGO_PORT/retailverse?authSource=admin
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
OAUTH_STATE_SECRET=$(openssl rand -hex 32)
MARKETPLACE_ENCRYPTION_KEY=$(openssl rand -hex 16)
ENCRYPTION_KEY=$(openssl rand -hex 16)
FRONTEND_URL=https://$DOMAIN
CLIENT_ORIGIN=https://$DOMAIN,https://www.$DOMAIN
BACKEND_URL=https://$DOMAIN
APP_URL=https://$DOMAIN
GOOGLE_CALLBACK_URL=https://$DOMAIN/auth/google/callback

# ---- Fill these in as needed, then: sudo -u retailverse bash ~/deploy.sh --restart-only
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=
OPENAI_API_KEY=
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
fi
echo "VITE_API_BASE_URL=https://$DOMAIN" > "$HOME_DIR/frontend.env"
chown "$APP_USER:$APP_USER" "$HOME_DIR/frontend.env"

echo ">> Nginx site (new file only)"
SITE=/etc/nginx/sites-available/retailverse
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$BACKEND_PORT/g" "$(dirname "$0")/nginx-retailverse.conf" > "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/retailverse
nginx -t && systemctl reload nginx

echo ">> SSL certificate"
WWW_ARG=""
getent hosts "www.$DOMAIN" >/dev/null && WWW_ARG="-d www.$DOMAIN"
certbot --nginx -d "$DOMAIN" $WWW_ARG -m "$EMAIL" --agree-tos --non-interactive --redirect || \
  echo "!! certbot failed. Point the domain's A record to this server's IP, then run: sudo certbot --nginx -d $DOMAIN"

echo
echo "Setup done. Next: upload the code and run deploy.sh (see DEPLOY_VPS.md)."

