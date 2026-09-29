#!/usr/bin/env bash
# Spins up a throwaway Jellyfin server with generated sample media for local
# development: two movies (one with an .srt), one TV episode, one album.
# Titles match real films/shows so the server pulls TMDB/TVDB metadata.
#
#   scripts/dev-server.sh          # create (or recreate) and seed
#   scripts/dev-server.sh stop     # remove the container
#
# From the Android emulator the server is at 10.0.2.2:8096.
# Works with docker or podman.
set -euo pipefail

NAME=tvandj-jellyfin
PORT=8096
DEV_USER=dev
DEV_PASSWORD=tvandj-dev # test-only credentials for this local container
URL="http://localhost:$PORT"
DOCKER=${DOCKER:-$(command -v podman || command -v docker)}

if [[ "${1:-}" == "stop" ]]; then
  "$DOCKER" rm -f "$NAME" >/dev/null && echo "removed $NAME"
  exit 0
fi

"$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true
"$DOCKER" run -d --name "$NAME" -p "$PORT:8096" docker.io/jellyfin/jellyfin:latest >/dev/null

echo "generating sample media…"
"$DOCKER" exec "$NAME" sh -c '
set -e
FF=/usr/lib/jellyfin-ffmpeg/ffmpeg
M="/media/movies" S="/media/shows/Pioneer One (2010)/Season 01" A="/media/music/Test Artist/Night Drive (2024)"
mkdir -p "$M/Big Buck Bunny (2008)" "$M/Sintel (2010)" "$S" "$A"
video() { $FF -loglevel error -y -f lavfi -i "$1=size=1280x720:rate=24" -f lavfi -i "sine=frequency=$2:sample_rate=48000" -t "$3" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$4"; }
video testsrc2 440 180 "$M/Big Buck Bunny (2008)/Big Buck Bunny (2008).mkv"
printf "1\n00:00:01,000 --> 00:00:30,000\nHello from the English subtitle track\n\n2\n00:00:31,000 --> 00:02:59,000\nSubtitles are working\n" > "$M/Big Buck Bunny (2008)/Big Buck Bunny (2008).en.srt"
video smptebars 330 120 "$M/Sintel (2010)/Sintel (2010).mp4"
video testsrc 520 90 "$S/Pioneer One - S01E01.mkv"
for i in 1 2 3; do
  $FF -loglevel error -y -f lavfi -i "sine=frequency=$((200*i)):sample_rate=44100" -t 60 -c:a libmp3lame \
    -metadata title="Track $i" -metadata artist="Test Artist" -metadata album="Night Drive" -metadata track=$i -metadata date=2024 \
    "$A/0$i - Track $i.mp3"
done'

echo "waiting for server…"
until curl -sf "$URL/System/Info/Public" >/dev/null; do sleep 1; done

json() { curl -sf -X "$1" "$URL$2" -H 'Content-Type: application/json' ${AUTH:+-H "Authorization: $AUTH"} ${3:+-d "$3"}; }

echo "running startup wizard…"
json POST /Startup/Configuration '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}'
json GET /Startup/User >/dev/null
json POST /Startup/User "{\"Name\":\"$DEV_USER\",\"Password\":\"$DEV_PASSWORD\"}"
json POST /Startup/RemoteAccess '{"EnableRemoteAccess":true,"EnableAutomaticPortMapping":false}'
json POST /Startup/Complete

AUTH='MediaBrowser Client="dev-server.sh", Device="script", DeviceId="dev-server-script", Version="1"'
TOKEN=$(json POST /Users/AuthenticateByName "{\"Username\":\"$DEV_USER\",\"Pw\":\"$DEV_PASSWORD\"}" | sed -E 's/.*"AccessToken":"([^"]+)".*/\1/')
AUTH="$AUTH, Token=\"$TOKEN\""

echo "allowing resume on short clips…"
# Jellyfin only keeps a resume point for items over 5 minutes by default; the sample clips are shorter.
json GET /System/Configuration | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);c.MinResumeDurationSeconds=30;process.stdout.write(JSON.stringify(c))})' > /tmp/tvandj-config.json
json POST /System/Configuration "$(cat /tmp/tvandj-config.json)"

echo "creating libraries…"
lib() { json POST "/Library/VirtualFolders?name=$1&collectionType=$2&paths=$3&refreshLibrary=false" '{"LibraryOptions":{}}'; }
lib Movies movies /media/movies
lib Shows tvshows /media/shows
lib Music music /media/music
json POST /Library/Refresh

echo
echo "Jellyfin is up at $URL (emulator: http://10.0.2.2:$PORT)"
echo "Sign in as '$DEV_USER' with the password in this script. Metadata finishes downloading in ~30s."
