#!/bin/sh
# Loads the built plugin into a throwaway Jellyfin (same version as production) on
# :8097 and checks the household settings API end to end: an admin can save, a
# regular user can read but not write, and an older copy never overwrites a newer one.
# Test-only credentials for the throwaway container.
set -e
cd "$(dirname "$0")"
DOCKER=${DOCKER:-$(command -v podman || command -v docker)}
NAME=tvandj-plugin-test
PORT=8097
BASE=http://localhost:$PORT
AUTH='MediaBrowser Client="plugin-test", Device="test", DeviceId="plugin-test", Version="1"'
"$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true
"$DOCKER" run -d --name "$NAME" -p "$PORT:8096" -v "$PWD/dist/TVandJ_1.0.0.0:/config/plugins/TVandJ_1.0.0.0:ro" docker.io/jellyfin/jellyfin:12.1 >/dev/null
trap '"$DOCKER" rm -f "$NAME" >/dev/null 2>&1' EXIT
until curl -sf "$BASE/System/Info/Public" >/dev/null; do sleep 2; done
req() { curl -s -X "$1" "$BASE$2" -H "Content-Type: application/json" -H "Authorization: $AUTH${4:+, Token=\"$4\"}" ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H "Content-Type: application/json" -H "Authorization: $AUTH${4:+, Token=\"$4\"}" ${3:+-d "$3"}; }
req POST /Startup/Configuration '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}' >/dev/null
req GET /Startup/User >/dev/null
req POST /Startup/User '{"Name":"admin","Password":"test-admin"}' >/dev/null
req POST /Startup/Complete >/dev/null
ADMIN=$(req POST /Users/AuthenticateByName '{"Username":"admin","Pw":"test-admin"}' | sed -E 's/.*"AccessToken":"([^"]+)".*/\1/')
req POST '/Users/New' '{"Name":"kid","Password":"test-kid"}' "" "$ADMIN" >/dev/null
KID=$(req POST /Users/AuthenticateByName '{"Username":"kid","Pw":"test-kid"}' | sed -E 's/.*"AccessToken":"([^"]+)".*/\1/')

echo "plugin loaded:    $(req GET /Plugins '' "$ADMIN" | grep -o '"Name":"TV and J"[^}]*"Status":"[A-Za-z]*"' | sed -E 's/.*"Status":"([A-Za-z]+)"/\1/')"
echo "empty read:       $(req GET /TvAndJ/Household '' "$KID")"
echo "admin save:       $(req POST /TvAndJ/Household '{"Value":{"downloadarrUrl":"http://nas:3001"},"UpdatedAt":2000}' "$ADMIN")"
echo "user read:        $(req GET /TvAndJ/Household '' "$KID")"
echo "user save:        HTTP $(code POST /TvAndJ/Household '{"Value":{"downloadarrUrl":"http://evil"},"UpdatedAt":9000}' "$KID")"
echo "stale admin save: $(req POST /TvAndJ/Household '{"Value":{"downloadarrUrl":"http://old"},"UpdatedAt":1000}' "$ADMIN")"
echo "no sign-in read:  HTTP $(code GET /TvAndJ/Household)"
"$DOCKER" restart "$NAME" >/dev/null
until curl -sf "$BASE/System/Info/Public" >/dev/null; do sleep 2; done
echo "after restart:    $(req GET /TvAndJ/Household '' "$KID")"
