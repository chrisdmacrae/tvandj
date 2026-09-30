#!/usr/bin/env node
// Writes (or updates) manifest.json, the plugin repository file Jellyfin reads:
// Dashboard → Plugins → Repositories → add its URL, then install from the Catalog.
//
//   node make-manifest.mjs <version> <zip> <download-url> [changelog]
//
// Each release adds a version (newest first) with the zip's MD5 checksum and the
// Jellyfin version it's built for, so servers only offer builds that will load.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [version, zip, sourceUrl, changelog = ''] = process.argv.slice(2);
if (!version || !zip || !sourceUrl) {
  console.error('usage: node make-manifest.mjs <version> <zip> <download-url> [changelog]');
  process.exit(1);
}

// The Jellyfin version the plugin compiles against (from the .csproj), as Jellyfin writes it: 12.1.0.0.
const csproj = readFileSync(new URL('./Jellyfin.Plugin.TvAndJ.csproj', import.meta.url), 'utf8');
const jellyfin = csproj.match(/Include="Jellyfin.Controller" Version="([^"]+)"/)[1];
const targetAbi = jellyfin.split('.').concat(['0', '0', '0']).slice(0, 4).join('.');

const path = new URL('./manifest.json', import.meta.url);
const manifest = existsSync(path)
  ? JSON.parse(readFileSync(path, 'utf8'))
  : [
      {
        guid: '7a1c6f2e-3b4d-4e8a-9f10-5c2d7e8b9a01',
        name: 'TV and J',
        description: 'Household settings shared by the TV and J apps on every device.',
        overview: 'Keeps settings that belong to the whole household (like the downloadarr address) on your Jellyfin server, so the TV and J apps share them across every device and user.',
        owner: 'chrisdmacrae',
        category: 'General',
        versions: [],
      },
    ];

const plugin = manifest[0];
plugin.versions = [
  {
    version,
    changelog,
    targetAbi,
    sourceUrl,
    checksum: createHash('md5').update(readFileSync(zip)).digest('hex'),
    timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  },
  ...plugin.versions.filter((v) => v.version !== version),
];
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json: ${plugin.name} ${version} for Jellyfin ${targetAbi}`);
