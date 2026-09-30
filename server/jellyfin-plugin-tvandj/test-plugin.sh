#!/bin/sh
# Loads the built plugin into a throwaway Jellyfin (same version as production) on
# :8097 and checks the household settings API end to end: an admin can save, a
# regular user can read but not write, and an older copy never overwrites a newer one.
# Then scrobbling: what each user sees, that app credentials stay admin-only, and that
# bad logins are turned away. (Real sign-ins need real accounts; not done here.)
# Test-only credentials for the throwaway container.
set -e
cd "$(dirname "$0")"
DOCKER=${DOCKER:-$(command -v podman || command -v docker)}
NAME=tvandj-plugin-test
VERSION=$(sed -n 's/^VERSION=//p' build.sh)
PLUGIN_ID=7a1c6f2e-3b4d-4e8a-9f10-5c2d7e8b9a01
PORT=8097
BASE=http://localhost:$PORT
AUTH='MediaBrowser Client="plugin-test", Device="test", DeviceId="plugin-test", Version="1"'
"$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true
# Copied in, not mounted: Jellyfin writes a meta.json into each plugin's folder as it loads it.
"$DOCKER" create --name "$NAME" -p "$PORT:8096" docker.io/jellyfin/jellyfin:12.1 >/dev/null
STAGE=$(mktemp -d)
mkdir -p "$STAGE/plugins" && cp -R "dist/TVandJ_$VERSION" "$STAGE/plugins/"
"$DOCKER" cp "$STAGE/plugins" "$NAME:/config/"
rm -rf "$STAGE"
"$DOCKER" start "$NAME" >/dev/null
trap '"$DOCKER" rm -f "$NAME" >/dev/null 2>&1' EXIT
wait_up() {
  for _ in $(seq 1 90); do curl -sf "$BASE/System/Info/Public" >/dev/null && return 0; sleep 2; done
  echo "Jellyfin didn't start:"; "$DOCKER" logs "$NAME" 2>&1 | grep -E "ERR|FTL" | grep -v HealthCheck | head -5; exit 1
}
wait_up
req() { curl -s -X "$1" "$BASE$2" -H "Content-Type: application/json" -H "Authorization: $AUTH${4:+, Token=\"$4\"}" ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H "Content-Type: application/json" -H "Authorization: $AUTH${4:+, Token=\"$4\"}" ${3:+-d "$3"}; }
# Jellyfin answers /System/Info/Public a little before it takes requests (503 until then).
for _ in $(seq 1 30); do
  [ "$(code POST /Startup/Configuration '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}')" = 204 ] && break
  sleep 2
done
req GET /Startup/User >/dev/null
req POST /Startup/User '{"Name":"admin","Password":"test-admin"}' >/dev/null
req POST /Startup/Complete >/dev/null
ADMIN=$(req POST /Users/AuthenticateByName '{"Username":"admin","Pw":"test-admin"}' | sed -E 's/.*"AccessToken":"([^"]+)".*/\1/')
req POST '/Users/New' '{"Name":"kid","Password":"test-kid"}' "$ADMIN" >/dev/null
KID=$(req POST /Users/AuthenticateByName '{"Username":"kid","Pw":"test-kid"}' | sed -E 's/.*"AccessToken":"([^"]+)".*/\1/')

echo "plugin loaded:    $(req GET /Plugins '' "$ADMIN" | grep -o '"Name":"TV and J"[^}]*"Status":"[A-Za-z]*"' | sed -E 's/.*"Status":"([A-Za-z]+)"/\1/')"
echo "empty read:       $(req GET /TvAndJ/Household '' "$KID")"
echo "admin save:       $(req POST /TvAndJ/Household '{"Value":{"downloadarrUrl":"http://nas:3001"},"UpdatedAt":2000}' "$ADMIN")"
echo "user read:        $(req GET /TvAndJ/Household '' "$KID")"
echo "user save:        HTTP $(code POST /TvAndJ/Household '{"Value":{"downloadarrUrl":"http://evil"},"UpdatedAt":9000}' "$KID")"
echo "stale admin save: $(req POST /TvAndJ/Household '{"Value":{"downloadarrUrl":"http://old"},"UpdatedAt":1000}' "$ADMIN")"
echo "no sign-in read:  HTTP $(code GET /TvAndJ/Household)"
"$DOCKER" restart "$NAME" >/dev/null
wait_up
until [ "$(code GET /TvAndJ/Household '' "$KID")" != 503 ]; do sleep 2; done
echo "after restart:    $(req GET /TvAndJ/Household '' "$KID")"

echo
echo "scrobbling, no keys:      $(req GET /TvAndJ/Scrobbling '' "$KID")"
echo "trakt without keys:       HTTP $(code POST /TvAndJ/Scrobbling/Trakt/Code '' "$KID")"
echo "lastfm without keys:      HTTP $(code POST /TvAndJ/Scrobbling/Lastfm '{"Username":"x","Password":"y"}' "$KID")"
echo "bad listenbrainz token:   HTTP $(code POST /TvAndJ/Scrobbling/ListenBrainz '{"Token":"not-a-real-token"}' "$KID")"
echo "unknown service:          HTTP $(code DELETE /TvAndJ/Scrobbling/myspace '' "$KID")"
echo "no sign-in:               HTTP $(code GET /TvAndJ/Scrobbling)"
CONFIG=$(req GET "/Plugins/$PLUGIN_ID/Configuration" '' "$ADMIN" | sed -E 's/"LastfmApiKey":"[^"]*"/"LastfmApiKey":"test-key"/; s/"LastfmApiSecret":"[^"]*"/"LastfmApiSecret":"test-secret"/; s/"TraktClientId":"[^"]*"/"TraktClientId":"test-id"/; s/"TraktClientSecret":"[^"]*"/"TraktClientSecret":"test-secret"/')
echo "admin sets keys:          HTTP $(code POST "/Plugins/$PLUGIN_ID/Configuration" "$CONFIG" "$ADMIN")"
echo "user reads plugin config: HTTP $(code GET "/Plugins/$PLUGIN_ID/Configuration" '' "$KID")   (must not be 200: it holds the secrets)"
echo "scrobbling, with keys:    $(req GET /TvAndJ/Scrobbling '' "$KID")"
echo "lastfm, bad key:          $(req POST /TvAndJ/Scrobbling/Lastfm '{"Username":"x","Password":"y"}' "$KID")"
echo "trakt poll, no sign-in:   $(req POST /TvAndJ/Scrobbling/Trakt/Poll '' "$KID")"
echo "disconnect lastfm:        HTTP $(code DELETE /TvAndJ/Scrobbling/lastfm '' "$KID")"
echo "household kept:           $(req GET /TvAndJ/Household '' "$KID")"
echo "scrobbler running:        $("$DOCKER" logs "$NAME" 2>&1 | grep -ciE 'TvAndJ.*(error|exception)' | sed 's/^0$/no errors/')"
