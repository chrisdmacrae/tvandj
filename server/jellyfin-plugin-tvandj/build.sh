#!/bin/sh
# Builds the plugin in Microsoft's .NET SDK container (no local .NET needed) and
# packages it as dist/tvandj_<version>.zip for Jellyfin's plugins folder.
set -e
cd "$(dirname "$0")"
VERSION=1.2.0.0
rm -rf dist bin obj
"${DOCKER:-docker}" run --rm -v "$PWD":/src -w /src mcr.microsoft.com/dotnet/sdk:10.0 \
  dotnet publish Jellyfin.Plugin.TvAndJ.csproj -c Release -o /src/dist/TVandJ_$VERSION
# Only our assembly: Jellyfin provides its own libraries.
find dist/TVandJ_$VERSION -type f ! -name 'Jellyfin.Plugin.TvAndJ.dll' -delete
( cd dist && zip -qr tvandj_$VERSION.zip TVandJ_$VERSION )
echo "Built dist/tvandj_$VERSION.zip"
