#!/usr/bin/env bash
# Spin up TV and J's web app (the PWA) on a Linux box with Docker.
#
#   deploy/setup.sh                 # asks a few questions, then starts it
#   deploy/setup.sh update          # newest image (or rebuild this checkout), restart
#   deploy/setup.sh stop | logs | status
#
# Non-interactive:
#   deploy/setup.sh --yes --port 8080 --domain tv.example.com --email me@example.com
#   deploy/setup.sh --yes --build   # build this checkout instead of pulling the prebuilt image
#
# Answers are saved in deploy/.env; running it again keeps them as the defaults.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/.env"
PREBUILT_IMAGE="ghcr.io/chrisdmacrae/tvandj-pwa:latest"
LOCAL_IMAGE="tvandj-pwa:local"
# Building the app (Metro) needs about 3 GB of memory.
BUILD_MEMORY_MB=3500

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ---- arguments -------------------------------------------------------------------

COMMAND=install
ASSUME_YES=0
ARG_PORT="" ARG_DOMAIN="" ARG_DOMAIN_GIVEN=0 ARG_EMAIL="" ARG_OMDB="" ARG_MODE=""
[ -n "${1:-}" ] && [ "${1#-}" = "$1" ] && { COMMAND="$1"; shift; }
while [ $# -gt 0 ]; do
  case "$1" in
    -y | --yes) ASSUME_YES=1 ;;
    --port) ARG_PORT="${2:?--port needs a value}"; shift ;;
    --domain) ARG_DOMAIN="${2?--domain needs a value (\"\" for none)}"; ARG_DOMAIN_GIVEN=1; shift ;;
    --email) ARG_EMAIL="${2:?--email needs a value}"; shift ;;
    --omdb-key) ARG_OMDB="${2:?--omdb-key needs a value}"; shift ;;
    --build) ARG_MODE=build ;;
    --prebuilt) ARG_MODE=prebuilt ;;
    -h | --help) usage ;;
    *) warn "Unknown option: $1"; usage 1 ;;
  esac
  shift
done
[ -t 0 ] || ASSUME_YES=1

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

# ---- docker ----------------------------------------------------------------------

SUDO=""
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

  # Not in the docker group yet: use sudo rather than fail.
  if ! docker info >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null || [ -t 0 ]; then
      sudo docker info >/dev/null 2>&1 || die "Docker isn't running. Start it (sudo systemctl enable --now docker) and try again."
      SUDO=sudo
      info "Using sudo for Docker (add yourself to the docker group to skip this: sudo usermod -aG docker \$USER)."
    else
      die "Can't talk to Docker. Is it running, and are you in the docker group?"
    fi
  fi

  $SUDO docker compose version >/dev/null 2>&1 ||
    die "Docker Compose v2 is missing. Install the compose plugin: https://docs.docker.com/compose/install/linux/"
  if [ -n "$SUDO" ]; then COMPOSE=(sudo docker compose); else COMPOSE=(docker compose); fi
}

compose() {
  local profiles=()
  [ -n "${DOMAIN:-}" ] && profiles=(--profile https)
  "${COMPOSE[@]}" --project-directory "$HERE" -f "$HERE/docker-compose.yml" --env-file "$ENV_FILE" "${profiles[@]}" "$@"
}

# ---- settings --------------------------------------------------------------------

load_env() {
  HTTP_PORT=8080 DOMAIN="" ACME_EMAIL="" OMDB_API_KEY="" PWA_IMAGE="$PREBUILT_IMAGE" PWA_PULL_POLICY=missing
  if [ -f "$ENV_FILE" ]; then
    # Only our own KEY=value lines; never executed as a script.
    while IFS='=' read -r key value; do
      case "$key" in
        HTTP_PORT | DOMAIN | ACME_EMAIL | OMDB_API_KEY | PWA_IMAGE | PWA_PULL_POLICY) printf -v "$key" '%s' "$value" ;;
      esac
    done < <(grep -E '^[A-Z_]+=' "$ENV_FILE")
  fi
}

save_env() {
  (
    umask 077 # it can hold an API key
    cat >"$ENV_FILE" <<EOF
# Written by deploy/setup.sh; see .env.example for what each setting does.
HTTP_PORT=$HTTP_PORT
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL
PWA_IMAGE=$PWA_IMAGE
PWA_PULL_POLICY=$PWA_PULL_POLICY
OMDB_API_KEY=$OMDB_API_KEY
EOF
  )
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; else return 1; fi
}

# Our own containers holding a port is fine: they're about to be recreated.
port_taken_by_others() {
  port_in_use "$1" || return 1
  local ours
  ours=$(compose ps --format '{{.Ports}}' 2>/dev/null || true)
  ! grep -q ":$1->" <<<"$ours"
}

configure() {
  load_env
  bold "TV and J web app setup"

  HTTP_PORT="${ARG_PORT:-$(ask "Port to serve it on over HTTP" "$HTTP_PORT")}"
  [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] || die "Not a port: $HTTP_PORT"
  port_taken_by_others "$HTTP_PORT" && die "Port $HTTP_PORT is already in use. Pick another with --port."

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
    for p in 80 443; do port_taken_by_others "$p" && die "Port $p is in use by something else; HTTPS needs it."; done
  fi

  local mode=prebuilt
  [ "$PWA_IMAGE" = "$LOCAL_IMAGE" ] && mode=build
  if [ -n "$ARG_MODE" ]; then
    mode="$ARG_MODE"
  elif [ "$ASSUME_YES" = 0 ]; then
    info "Prebuilt: the latest release from GitHub, ready in seconds."
    info "Build: this checkout, including any local changes (a few minutes, ~${BUILD_MEMORY_MB} MB of memory)."
    mode="$(ask "Prebuilt or build" "$mode")"
  fi
  case "$mode" in
    prebuilt | p*) PWA_IMAGE="$PREBUILT_IMAGE" PWA_PULL_POLICY=missing ;;
    build | b*)
      [ -f "$HERE/../apps/pwa/Dockerfile" ] || die "Building needs the whole repository checked out around deploy/."
      PWA_IMAGE="$LOCAL_IMAGE" PWA_PULL_POLICY=build
      OMDB_API_KEY="${ARG_OMDB:-$(ask "OMDb API key for IMDb/Rotten Tomatoes ratings (optional)" "$OMDB_API_KEY")}"
      local mem_mb
      mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || echo 0)
      if [ "$mem_mb" -gt 0 ] && [ "$mem_mb" -lt "$BUILD_MEMORY_MB" ]; then
        warn "This box has ${mem_mb} MB of memory; the build may run out. Add swap, or use the prebuilt image."
      fi
      ;;
    *) die "Choose prebuilt or build, not: $mode" ;;
  esac

  save_env
  info "Saved to deploy/.env"
}

# ---- actions ---------------------------------------------------------------------

start() {
  if [ "$PWA_PULL_POLICY" = build ]; then
    bold "Building the app (this takes a few minutes)…"
    compose build pwa
  else
    bold "Pulling the app…"
    compose pull pwa
  fi
  [ -n "$DOMAIN" ] && compose pull caddy
  bold "Starting…"
  compose up -d --remove-orphans
  # Without a domain, an old HTTPS proxy from a previous setup shouldn't linger.
  [ -z "$DOMAIN" ] && "${COMPOSE[@]}" --project-directory "$HERE" -f "$HERE/docker-compose.yml" --env-file "$ENV_FILE" --profile https rm -sf caddy >/dev/null 2>&1 || true
  wait_until_up
  summary
}

wait_until_up() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "http://127.0.0.1:$HTTP_PORT/" 2>/dev/null && return 0
    sleep 1
  done
  warn "The app didn't answer on port $HTTP_PORT yet. Check: deploy/setup.sh logs"
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
    info "Over plain HTTP, browsers won't offer to install the app. Run again with a domain to add HTTPS."
  fi
  info "Update later with: deploy/setup.sh update"
}

case "$COMMAND" in
  install)
    find_docker
    configure
    start
    ;;
  update)
    find_docker
    [ -f "$ENV_FILE" ] || die "Not set up yet. Run deploy/setup.sh first."
    load_env
    [ "$PWA_PULL_POLICY" = build ] && info "Rebuilding this checkout; git pull first for the newest code."
    start
    ;;
  stop)
    find_docker
    load_env
    compose down
    ;;
  logs)
    find_docker
    load_env
    compose logs -f --tail 100
    ;;
  status)
    find_docker
    load_env
    compose ps
    ;;
  help) usage ;;
  *) warn "Unknown command: $COMMAND"; usage 1 ;;
esac
