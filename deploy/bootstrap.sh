#!/usr/bin/env bash
# BRZ one-command deployment bootstrap (Ubuntu 24.04).
# Idempotent: a second run is a no-op, not a crash.
set -euo pipefail

BRZ_USER="${BRZ_USER:-brz}"
BRZ_HOME="${BRZ_HOME:-/opt/brz}"
BRZ_STATE="${BRZ_STATE:-/var/lib/brz}"
BRZ_ENV="/etc/brz/.env"
BRZ_CREDS="/etc/brz/credentials"
BRZ_PUBLIC_HOST="${BRZ_PUBLIC_HOST:-}"

log() { echo "[brz-bootstrap] $*"; }
fail() { echo "[brz-bootstrap] ERROR: $*" >&2; exit 1; }

# --- 1. runtime + dependencies ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v24* ]]; then
  log "installing Node 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
apt-get update -y
apt-get install -y bubblewrap caddy

# --- 2. user + state dir ---
if ! id "$BRZ_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$BRZ_HOME" --create-home --shell /usr/sbin/nologin "$BRZ_USER"
fi
mkdir -p "$BRZ_STATE" "$BRZ_HOME"
chown -R "$BRZ_USER:$BRZ_USER" "$BRZ_STATE" "$BRZ_HOME"

# --- 3. cgroup v2 hierarchy (enable controllers if needed) ---
if [[ -f /sys/fs/cgroup/cgroup.controllers ]]; then
  log "cgroup v2 present: $(cat /sys/fs/cgroup/cgroup.controllers)"
fi

# --- 4. env file from template ---
if [[ ! -f "$BRZ_ENV" ]]; then
  mkdir -p /etc/brz
  cp "$BRZ_HOME/deploy/.env.template" "$BRZ_ENV" 2>/dev/null || cp /opt/brz/deploy/.env.template "$BRZ_ENV"
  chmod 600 "$BRZ_ENV"
  log "wrote $BRZ_ENV from template — fill in the placeholders"
fi

# fail closed on missing required values
set -a; source "$BRZ_ENV"; set +a
for v in OPENAI_ENDPOINT OPENAI_MODEL OPENAI_API_KEY; do
  if [[ -z "${!v:-}" ]]; then
    fail "required env value $v is missing in $BRZ_ENV"
  fi
done

# --- 5. access-control credentials (generated, never printed) ---
if [[ ! -f "$BRZ_CREDS" ]]; then
  USER="brz-admin"
  PASS="$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)"
  HASH="$(caddy hash-password --plaintext "$PASS")"
  umask 077
  cat > "$BRZ_CREDS" <<EOF
BRZ_BASIC_AUTH_USER=$USER
BRZ_BASIC_AUTH_HASH=$HASH
EOF
  chmod 600 "$BRZ_CREDS"
  chown root:root "$BRZ_CREDS"
  # store the plaintext password in a separate 0600 file for the operator
  printf '%s\n' "$PASS" > /etc/brz/.admin-password
  chmod 600 /etc/brz/.admin-password
  chown root:root /etc/brz/.admin-password
  log "credentials written to $BRZ_CREDS (mode 0600). Read the password with: sudo cat /etc/brz/.admin-password"
fi

# --- 6. systemd unit ---
cp "$BRZ_HOME/deploy/brz.service" /etc/systemd/system/brz.service
systemctl daemon-reload
systemctl enable --now brz.service

# --- 7. caddy unit (reverse proxy) ---
cat > /etc/systemd/system/brz-caddy.service <<'EOF'
[Unit]
Description=BRZ reverse proxy (Caddy)
After=brz.service

[Service]
Type=simple
EnvironmentFile=/etc/brz/.env
EnvironmentFile=/etc/brz/credentials
ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
mkdir -p /etc/caddy
cp "$BRZ_HOME/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now brz-caddy.service

# --- 8. health check ---
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1; then
    log "health check OK"
    exit 0
  fi
  sleep 1
done
fail "health check failed"
"