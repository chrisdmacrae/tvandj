#!/usr/bin/env bash
# Spin up TV and J's web app (the PWA) on a Linux box with Docker. No checkout needed:
#
#   curl -fsSL https://raw.githubusercontent.com/chrisdmacrae/tvandj/main/deploy/setup.sh | bash
#
# It asks a few questions, downloads docker-compose.yml and the Caddyfile into an install folder
# (/opt/tvandj as root, ~/tvandj otherwise), saves your answers in .env there, and starts it.
# A copy of this script goes in the folder too, to manage it afterwards:
#
#   ~/tvandj/setup.sh update     # newest compose files and app, restart
#   ~/tvandj/setup.sh stop | logs | status
#
# Without questions (flags go after `bash -s --` when piping):
#   curl -fsSL …/setup.sh | bash -s -- --yes --port 8080 --domain tv.example.com --email me@example.com
#
# Options: --dir <folder>, --port <n>, --domain <name> ("" for none), --email <address>, --yes.
# TVANDJ_REF picks the branch or tag the files come from (default main).
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/chrisdmacrae/tvandj"
SOURCE="${TVANDJ_SOURCE:-$REPO_RAW/${TVANDJ_REF:-main}/deploy}"
FILES=(docker-compose.yml Caddyfile .env.example setup.sh)
PREBUILT_IMAGE="ghcr.io/chrisdmacrae/tvandj-pwa:latest"
ENV_HEADER="# Written by TV and J's setup.sh; see .env.example for what each setting does."

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: setup.sh [install|update|stop|logs|status] [--dir <folder>] [--port <n>]
                [--domain <name>] [--email <address>] [--yes]

  install  (default) ask a few questions, download the compose files, start the app
  update   download the newest compose files, pull the newest app, restart
  stop     stop and remove the containers (settings and certificates are kept)
  logs     follow the containers' logs
  status   show the containers

Piped from curl, pass options after `bash -s --`.
EOF
  exit "${1:-0}"
}

# ---- arguments -------------------------------------------------------------------

COMMAND=install
ASSUME_YES=0
ARG_DIR="" ARG_PORT="" ARG_DOMAIN="" ARG_DOMAIN_GIVEN=0 ARG_EMAIL=""
if [ -n "${1:-}" ] && [ "${1#-}" = "$1" ]; then COMMAND="$1"; shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    -y | --yes) ASSUME_YES=1 ;;
    --dir) ARG_DIR="${2:?--dir needs a folder}"; shift ;;
    --port) ARG_PORT="${2:?--port needs a value}"; shift ;;
    --domain) ARG_DOMAIN="${2?--domain needs a value (\"\" for none)}"; ARG_DOMAIN_GIVEN=1; shift ;;
    --email) ARG_EMAIL="${2:?--email needs a value}"; shift ;;
    -h | --help) usage ;;
    *) warn "Unknown option: $1"; usage 1 ;;
  esac
  shift
done

# Piped from curl, stdin is this script: questions go to the terminal instead. No terminal, no questions.
if [ "$ASSUME_YES" = 0 ] && ! { true </dev/tty; } 2>/dev/null; then ASSUME_YES=1; fi

ask() { # ask "Question" default -> answer
  local answer
  if [ "$ASSUME_YES" = 1 ]; then printf '%s' "$2"; return; fi
  read -r -p "  $1 [${2:-none}]: " answer </dev/tty
  printf '%s' "${answer:-$2}"
}

confirm() { # confirm "Question" -> 0 for yes
  [ "$ASSUME_YES" = 1 ] && return 0
  local answer
  read -r -p "  $1 [y/N]: " answer </dev/tty
  [[ "$answer" =~ ^[Yy] ]]
}

# ---- install folder --------------------------------------------------------------

# Run as <folder>/setup.sh from an install: that folder. Otherwise --dir, or the default.
SELF="${BASH_SOURCE[0]:-}"
if [ -z "$ARG_DIR" ] && [ -f "$SELF" ] && head -1 "$(dirname "$SELF")/.env" 2>/dev/null | grep -qF "$ENV_HEADER"; then
  DIR="$(cd "$(dirname "$SELF")" && pwd)"
elif [ -n "$ARG_DIR" ]; then
  DIR="$ARG_DIR"
elif [ "$(id -u)" = 0 ]; then
  DIR=/opt/tvandj
else
  DIR="$HOME/tvandj"
fi
ENV_FILE="$DIR/.env"

download() {
  command -v curl >/dev/null 2>&1 || die "curl is needed to download the compose files."
  mkdir -p "$DIR"
  info "Downloading the compose files into $DIR"
  local f
  for f in "${FILES[@]}"; do
    curl -fsSL "$SOURCE/$f" -o "$DIR/$f.download" || die "Couldn't download $SOURCE/$f"
    mv "$DIR/$f.download" "$DIR/$f"
  done
  chmod +x "$DIR/setup.sh"
}

# ---- docker ----------------------------------------------------------------------

COMPOSE=()

find_docker() {
  [ "$(uname -s)" = Linux ] || warn "This is meant for Linux; carrying on anyway."

  if ! command -v docker >/dev/null 2>&1; then
    if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
      COMPOSE=(podman compose)
      warn "Using Podman. Docker Compose is what this is tested with."
      return
    fi
    bold "Docker isn't installed."
    confirm "Install it now with Docker's official script (get.docker.com, needs sudo)?" ||
      die "Install Docker (https://docs.docker.com/engine/install/), then run this again."
    curl -fsSL https://get.docker.com | sudo sh
  fi

  local sudo=""
  # Not in the docker group yet: use sudo rather than fail.
  if ! docker info >/dev/null 2>&1; then
    sudo docker info >/dev/null 2>&1 || die "Can't talk to Docker. Is it running (sudo systemctl enable --now docker)?"
    sudo=sudo
    info "Using sudo for Docker (add yourself to the docker group to skip this: sudo usermod -aG docker \$USER)."
  fi

  if [ -n "$sudo" ]; then COMPOSE=(sudo docker compose); else COMPOSE=(docker compose); fi
  "${COMPOSE[@]}" version >/dev/null 2>&1 ||
    die "Docker Compose v2 is missing. Install the compose plugin: https://docs.docker.com/compose/install/linux/"
}

compose() {
  local profiles=()
  [ -n "${DOMAIN:-}" ] && profiles=(--profile https)
  "${COMPOSE[@]}" --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$ENV_FILE" "${profiles[@]}" "$@"
}

# ---- settings --------------------------------------------------------------------

load_env() {
  HTTP_PORT=8080 DOMAIN="" ACME_EMAIL="" PWA_IMAGE="$PREBUILT_IMAGE"
  [ -f "$ENV_FILE" ] || return 0
  # Only our own KEY=value lines; never executed as a script.
  local key value
  while IFS='=' read -r key value; do
    case "$key" in
      HTTP_PORT | DOMAIN | ACME_EMAIL | PWA_IMAGE) printf -v "$key" '%s' "$value" ;;
    esac
  done < <(grep -E '^[A-Z_]+=' "$ENV_FILE")
  # Older setups could build a local image; there's nothing to build from any more.
  if [ "$PWA_IMAGE" = "tvandj-pwa:local" ]; then
    warn "Switching from a locally built image to the prebuilt one."
    PWA_IMAGE="$PREBUILT_IMAGE"
  fi
}

save_env() {
  cat >"$ENV_FILE" <<EOF
$ENV_HEADER
HTTP_PORT=$HTTP_PORT
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL
PWA_IMAGE=$PWA_IMAGE
EOF
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; else return 1; fi
}

# Our own containers holding a port is fine: they're about to be recreated.
port_taken_by_others() {
  port_in_use "$1" || return 1
  [ -f "$ENV_FILE" ] || return 0
  local ours
  ours=$(compose ps --format '{{.Ports}}' 2>/dev/null || true)
  ! grep -q ":$1->" <<<"$ours"
}

configure() {
  load_env
  bold "TV and J web app setup"

  HTTP_PORT="${ARG_PORT:-$(ask "Port to serve it on over HTTP" "$HTTP_PORT")}"
  [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] || die "Not a port: $HTTP_PORT"
  if port_taken_by_others "$HTTP_PORT"; then die "Port $HTTP_PORT is already in use. Pick another with --port."; fi

  if [ "$ARG_DOMAIN_GIVEN" = 1 ]; then
    DOMAIN="$ARG_DOMAIN"
  else
    if [ "$ASSUME_YES" = 0 ]; then
      info "HTTPS lets people install the app and makes it work offline. It needs a domain pointing"
      info "at this box with ports 80 and 443 open to the internet. Leave empty for HTTP only."
    fi
    DOMAIN="$(ask "Domain for HTTPS" "$DOMAIN")"
  fi
  DOMAIN="${DOMAIN#http*://}"
  DOMAIN="${DOMAIN%%/*}"
  if [ -n "$DOMAIN" ]; then
    ACME_EMAIL="${ARG_EMAIL:-$(ask "Email for Let's Encrypt (certificate expiry notices)" "$ACME_EMAIL")}"
    [[ "$ACME_EMAIL" == *@* ]] || die "HTTPS needs an email for Let's Encrypt (--email you@example.com)."
    local p
    for p in 80 443; do
      if port_taken_by_others "$p"; then die "Port $p is in use by something else; HTTPS needs it."; fi
    done
  fi

  save_env
  info "Settings saved in $ENV_FILE"
}

# ---- actions ---------------------------------------------------------------------

start() {
  bold "Pulling the app…"
  compose pull
  bold "Starting…"
  compose up -d --remove-orphans
  # Without a domain, an HTTPS proxy from an earlier setup shouldn't linger.
  if [ -z "$DOMAIN" ]; then
    "${COMPOSE[@]}" --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$ENV_FILE" --profile https rm -sf caddy >/dev/null 2>&1 || true
  fi
  wait_until_up
  summary
}

wait_until_up() {
  local _
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "http://127.0.0.1:$HTTP_PORT/" 2>/dev/null && return 0
    sleep 1
  done
  warn "The app didn't answer on port $HTTP_PORT yet. Check: $DIR/setup.sh logs"
}

summary() {
  local ip
  # hostname -I is missing on some minimal distros; ip route works there.
  ip=$({ hostname -I 2>/dev/null || ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1) }'; } | awk 'NF { print $1; exit }' || true)
  echo
  bold "TV and J is running."
  info "On this network:  http://${ip:-<this box>}:$HTTP_PORT"
  if [ -n "$DOMAIN" ]; then
    info "Over HTTPS:       https://$DOMAIN   (the certificate can take a minute the first time)"
    info "Over HTTPS, the browser only lets the app reach a Jellyfin (and downloadarr) that's on HTTPS too."
  else
    info "Over plain HTTP, browsers won't offer to install the app. Run setup again with a domain to add HTTPS."
  fi
  info "Manage it with:   $DIR/setup.sh update | stop | logs | status"
}

needs_install() {
  [ -f "$ENV_FILE" ] || die "Not set up in $DIR yet. Run setup.sh without a command first (or pass --dir)."
}

case "$COMMAND" in
  install)
    find_docker
    download
    configure
    start
    ;;
  update)
    needs_install
    find_docker
    download
    load_env
    save_env # picks up any settings format change
    start
    ;;
  stop)
    needs_install
    find_docker
    load_env
    compose down
    ;;
  logs)
    needs_install
    find_docker
    load_env
    compose logs -f --tail 100
    ;;
  status)
    needs_install
    find_docker
    load_env
    compose ps
    ;;
  help) usage ;;
  *) warn "Unknown command: $COMMAND"; usage 1 ;;
esac
