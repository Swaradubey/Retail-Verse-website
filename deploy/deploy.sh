#!/usr/bin/env bash
# Build + (re)start Retail Verse. Run as the app user, NOT root:
#   sudo -u retailverse -H bash /home/retailverse/deploy.sh --git            (pull latest from GitHub main)
#   sudo -u retailverse -H bash /home/retailverse/deploy.sh --git <branch>   (deploy another branch)
#   sudo -u retailverse -H bash /home/retailverse/deploy.sh /path/to/release.tar.gz
#   sudo -u retailverse -H bash /home/retailverse/deploy.sh --restart-only   (after editing backend.env)
# This script and ecosystem.config.cjs live in /home/retailverse (outside the app),
# so the GitHub repo does not need to contain them.
set -euo pipefail
[ "$(whoami)" = "retailverse" ] || { echo "Run as: sudo -u retailverse -H bash $0 ..."; exit 1; }

# Run from a temp copy so swapping the app folder can't affect the running script
if [ -z "${RV_DEPLOY_COPY:-}" ]; then
  TMP_SELF="$(mktemp /tmp/rv-deploy.XXXXXX.sh)"; cp "$0" "$TMP_SELF"
  RV_DEPLOY_COPY=1 exec bash "$TMP_SELF" "$@"
fi

. "$HOME/.nvm/nvm.sh"
APP="$HOME/app"
REPO="$HOME/repo"

link_config() {
  local dir="$1"
  ln -sfn "$HOME/backend.env"   "$dir/Backend/.env"
  cp      "$HOME/frontend.env"  "$dir/.env.production"
  rm -rf  "$dir/Backend/uploads"
  ln -sfn "$HOME/data/uploads"  "$dir/Backend/uploads"   # uploads survive redeploys
}

restart() {
  cd "$APP"
  pm2 startOrReload "$HOME/ecosystem.config.cjs" --update-env
  pm2 save
  sleep 3
  PORT=$(grep -E '^PORT=' "$HOME/backend.env" | cut -d= -f2)
  curl -fsS "http://127.0.0.1:$PORT/api/health" && echo && echo "Backend healthy" || \
    { echo "Health check failed - see: pm2 logs retailverse-api --lines 100"; exit 1; }
}

case "${1:-}" in
  --restart-only) restart; exit 0 ;;
  --git)
    BRANCH="${2:-main}"
    [ -d "$REPO/.git" ] || { echo "No git checkout at $REPO. Run: git clone https://github.com/Swaradubey/Retail-Verse-website.git $REPO"; exit 1; }
    echo ">> Fetching $BRANCH from GitHub"
    git -C "$REPO" fetch --prune origin "$BRANCH"
    git -C "$REPO" checkout -q -B "$BRANCH" "origin/$BRANCH"
    git -C "$REPO" reset -q --hard "origin/$BRANCH"
    echo "   Commit: $(git -C "$REPO" log -1 --format='%h %s (%an, %cr)')"
    TARBALL="$HOME/releases/release.tar.gz"
    git -C "$REPO" archive --format=tar.gz -o "$TARBALL" HEAD
    ;;
  "") echo "Usage: $0 --git [branch] | <release.tar.gz> | --restart-only"; exit 1 ;;
  *) TARBALL="$1" ;;
esac

if pgrep -f "next build" >/dev/null; then
  echo "!! Another project (HRMS) is building right now. Waiting for it to finish to avoid running out of memory..."
  while pgrep -f "next build" >/dev/null; do sleep 10; done
fi

NEW="$HOME/app-new"; OLD="$HOME/app-old"
rm -rf "$NEW"; mkdir -p "$NEW"
tar -xzf "$TARBALL" -C "$NEW"
link_config "$NEW"

echo ">> Installing + building frontend"
cd "$NEW" && npm ci --no-audit --no-fund && npm run build
echo ">> Installing backend"
cd "$NEW/Backend" && npm ci --omit=dev --no-audit --no-fund

echo ">> Switching to new release"
rm -rf "$OLD"
[ -d "$APP" ] && mv "$APP" "$OLD"
mv "$NEW" "$APP"
restart
echo "Deployed. Previous version kept at $OLD"
echo "Roll back:  mv ~/app ~/app-bad && mv ~/app-old ~/app && bash ~/deploy.sh --restart-only"

