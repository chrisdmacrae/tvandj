#!/usr/bin/env node
// A stand-in for downloadarr's API (github.com/chrisdmacrae/downloadarr) for
// developing TV and J's optional downloadarr integration without a real
// indexer or torrent client.
//
//   node scripts/dev-downloadarr.mjs     # needs scripts/dev-server.sh running
//   PORT=3002 node scripts/dev-downloadarr.mjs
//
// - Serves the same routes and { success, data } shapes TV and J uses, on :3001.
// - Titles and posters come from TMDB via the dev Jellyfin's remote search.
// - Requests walk PENDING → SEARCHING → DOWNLOADING (0–100% over ~30s) →
//   COMPLETED, then drop a generated video into the dev Jellyfin library so
//   the app can be seen waiting for Jellyfin to index it before offering Play.
// - Music discovery: made-up album recommendations (one, Night Drive, already in
//   the dev library), weekly and daily jams, and artist radio; requested albums
//   land as tagged MP3s in /media/music.
// - Recommendation profiles: "dev" (matching the dev Jellyfin user), with Trakt
//   recommendations and a watchlist for movies and shows from the catalogue.
// - Answers "who is Downloadarr?" on udp/7360 like the real LAN discovery.
import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { promisify } from 'node:util';

// PORT=3002 runs it beside a real downloadarr.
const PORT = Number(process.env.PORT ?? 3001);
const JELLYFIN = 'http://localhost:8096';
const CONTAINER = 'tvandj-jellyfin';
const DOCKER = process.env.DOCKER ?? 'podman';
const run = promisify(execFile);

const DEV_PASSWORD = readFileSync(new URL('./dev-server.sh', import.meta.url), 'utf8').match(/^DEV_PASSWORD=(\S+)/m)?.[1];
const AUTH = 'MediaBrowser Client="dev-downloadarr", Device="script", DeviceId="dev-downloadarr", Version="1"';

async function jellyfin(path, body) {
  const res = await fetch(`${JELLYFIN}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `${AUTH}, Token="${token}"` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

let token = '';
async function signIn() {
  const res = await fetch(`${JELLYFIN}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ Username: 'dev', Pw: DEV_PASSWORD }),
  });
  token = (await res.json()).AccessToken;
}

// ---- catalogue ---------------------------------------------------------------

const GENRES = {
  movie: [
    { id: 16, name: 'Animation' },
    { id: 878, name: 'Science Fiction' },
    { id: 14, name: 'Fantasy' },
    { id: 35, name: 'Comedy' },
  ],
  tv: [
    { id: 18, name: 'Drama' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
  ],
};

const SEED = {
  movie: [
    ['Elephants Dream', 2006, [16, 878]],
    ['Tears of Steel', 2012, [878]],
    ['Cosmos Laundromat', 2015, [16, 14]],
    ['Spring', 2019, [16, 14]],
    ['Sprite Fright', 2021, [16, 35]],
    ['Sintel', 2010, [16, 14]],
    ['Big Buck Bunny', 2008, [16, 35]],
  ],
  tv: [
    ['Severance', 2022, [18, 10765]],
    ['Andor', 2022, [18, 10765]],
    ['Shōgun', 2024, [18]],
    ['Pioneer One', 2010, [18, 10765]],
  ],
};

const catalogue = { movie: [], tv: [] };

async function loadCatalogue() {
  for (const kind of ['movie', 'tv']) {
    for (const [name, year, genreIds] of SEED[kind]) {
      const [hit] = await jellyfin(`/Items/RemoteSearch/${kind === 'movie' ? 'Movie' : 'Series'}`, {
        SearchInfo: { Name: name, Year: year },
      });
      if (!hit?.ProviderIds?.Tmdb) continue;
      const genres = GENRES[kind].filter((g) => genreIds.includes(g.id)).map((g) => g.name);
      catalogue[kind].push({
        id: hit.ProviderIds.Tmdb,
        title: hit.Name,
        year: hit.ProductionYear,
        poster: hit.ImageUrl?.replace('/original/', '/w500/'),
        overview: hit.Overview,
        type: kind,
        rating: 6 + ((Number(hit.ProviderIds.Tmdb) % 30) / 10),
        genres,
        genreIds,
        ...(kind === 'tv' ? { seasons: 1 } : { runtime: 90 + (Number(hit.ProviderIds.Tmdb) % 60) }),
      });
    }
  }
  console.log(`catalogue: ${catalogue.movie.length} movies, ${catalogue.tv.length} shows`);
}

const publicItem = ({ genreIds, ...item }) => item;

// Big Buck Bunny (Creative Commons), so every mock title has a trailer that's allowed to embed.
const MOCK_TRAILER = 'aqz-KE-bpKQ';

const MOCK_PEOPLE = [
  { id: '9001', name: 'A. Performer', job: 'Acting' },
  { id: '9002', name: 'B. Actor', job: 'Acting' },
  { id: '9003', name: 'C. Player', job: 'Acting' },
  { id: '9004', name: 'D. Director', job: 'Director' },
];

// ---- music -------------------------------------------------------------------

const cover = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/400`;
let nextRecId = 1;
const rec = (list, artistName, albumTitle, releaseDate, reasons = []) => ({
  id: `rec_${nextRecId++}`,
  list,
  rank: nextRecId,
  artistName,
  artistMbid: null,
  albumTitle,
  releaseGroupMbid: null,
  releaseDate,
  coverUrl: cover(`${artistName}-${albumTitle}`),
  score: 1,
  reasons,
  sources: ['listenbrainz'],
  generatedAt: new Date().toISOString(),
});
let recommendations = [
  rec('NEW_ARTISTS', 'Glass Harbour', 'Low Tide Radio', '2023-04-14', ['Test Artist']),
  rec('NEW_ARTISTS', 'The Paper Moons', 'Stations', '2021-10-01', ['Test Artist', 'Glass Harbour']),
  rec('NEW_ARTISTS', 'Mira Kova', 'Slow Signals', '2022-06-03', ['Test Artist']),
  rec('FRESH_RELEASES', 'Test Artist', 'Night Drive II', '2026-09-12'),
  rec('WEEKLY_PICKS', 'Oslo Static', 'Northern Lines', '2019-02-22'),
  rec('WEEKLY_PICKS', 'Hollow Pines', 'Understory', '2020-08-08'),
  rec('WEEKLY_JAMS', 'Glass Harbour', 'Tidewater', '2020-03-06'),
  rec('DAILY_JAMS', 'Mira Kova', 'Paper Weather', '2024-11-15'),
  rec('MOST_PLAYED', 'Test Artist', 'Night Drive', '2024-01-01'),
];
const dismissals = [];

// Freely licensed sample MP3s stand in for Deezer's 30-second clips.
const clip = (n) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(n % 16) + 1}.mp3`;

function musicLists() {
  const lists = {};
  for (const r of recommendations) (lists[r.list] ??= []).push(r);
  return lists;
}

// ---- requests ----------------------------------------------------------------

const requests = [];
let nextRequestId = 1;
const SEARCH_AFTER_MS = 3_000;
const DOWNLOAD_AFTER_MS = 8_000;
const DOWNLOAD_MS = 30_000;

function progressOf(r) {
  const elapsed = Date.now() - r.startedAt - DOWNLOAD_AFTER_MS;
  return Math.max(0, Math.min(100, (elapsed / DOWNLOAD_MS) * 100));
}

function tick() {
  for (const r of requests) {
    // Like real downloadarr: an ongoing show's request sits at PENDING between search
    // passes while its season torrents download. Progress lives in /seasons.
    if (r.contentType === 'TV_SHOW' && r.isOngoing) continue;
    const age = Date.now() - r.startedAt;
    const before = r.status;
    if (r.status === 'PENDING' && age > SEARCH_AFTER_MS) r.status = 'SEARCHING';
    if (r.status === 'SEARCHING' && age > DOWNLOAD_AFTER_MS) {
      r.status = 'DOWNLOADING';
      r.foundTorrentTitle = r.contentType === 'MUSIC' ? `${r.artist} - ${r.title} (${r.year}) [FLAC]` : `${r.title} (${r.year}) 1080p WEB-DL x265`;
    }
    if (r.status === 'DOWNLOADING' && progressOf(r) >= 100) {
      r.status = 'COMPLETED';
      r.completedAt = new Date().toISOString();
      organize(r);
    }
    if (before !== r.status) {
      r.updatedAt = new Date().toISOString();
      console.log(`${r.title}: ${before} → ${r.status}`);
    }
  }
}

/** "Move into the library": generate a short video where Jellyfin will find it, then rescan. */
async function organize(r) {
  if (r.contentType === 'MUSIC') return organizeAlbum(r);
  const folder =
    r.contentType === 'MOVIE'
      ? `/media/movies/${r.title} (${r.year})`
      : `/media/shows/${r.title} (${r.year})/Season 01`;
  const file = r.contentType === 'MOVIE' ? `${r.title} (${r.year}).mp4` : `${r.title} - S01E01.mkv`;
  const ff = `/usr/lib/jellyfin-ffmpeg/ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=500:sample_rate=48000 -t 120 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest`;
  try {
    await run(DOCKER, ['exec', CONTAINER, 'sh', '-c', `mkdir -p "${folder}" && ${ff} "${folder}/${file}"`]);
    await jellyfin('/Library/Refresh', {});
    console.log(`${r.title}: organized into ${folder}; Jellyfin rescanning`);
  } catch (e) {
    console.error(`${r.title}: organize failed`, e.message);
  }
}

/** Three short tagged MP3s, like dev-server.sh's seeded album. */
async function organizeAlbum(r) {
  const folder = `/media/music/${r.artist}/${r.title}${r.year ? ` (${r.year})` : ''}`;
  const tag = (s) => String(s).replace(/"/g, '');
  const script = [1, 2, 3]
    .map(
      (i) =>
        `/usr/lib/jellyfin-ffmpeg/ffmpeg -loglevel error -y -f lavfi -i sine=frequency=${150 * i + 100}:sample_rate=44100 -t 30 -c:a libmp3lame ` +
        `-metadata title="Song ${i}" -metadata artist="${tag(r.artist)}" -metadata album_artist="${tag(r.artist)}" -metadata album="${tag(r.title)}" -metadata track=${i} ${r.year ? `-metadata date=${r.year}` : ''} "${folder}/0${i} - Song ${i}.mp3"`,
    )
    .join(' && ');
  try {
    await run(DOCKER, ['exec', CONTAINER, 'sh', '-c', `mkdir -p "${folder}" && ${script}`]);
    await jellyfin('/Library/Refresh', {});
    console.log(`${r.title}: organized into ${folder}; Jellyfin rescanning`);
  } catch (e) {
    console.error(`${r.title}: organize failed`, e.message);
  }
}

// ---- HTTP --------------------------------------------------------------------

const ok = (data, extra = {}) => ({ status: 200, body: { success: true, data, ...extra } });
const fail = (status, error) => ({ status, body: { success: false, error } });

async function route(method, url, body) {
  const path = url.pathname;
  let m;

  if ((m = path.match(/^\/(movies|tv-shows)\/(popular|genres\/list|genres\/(\d+)|(\d+))$/)) && method === 'GET') {
    const kind = m[1] === 'movies' ? 'movie' : 'tv';
    if (m[2] === 'popular') return ok(catalogue[kind].map(publicItem));
    if (m[2] === 'genres/list') return ok(GENRES[kind]);
    if (m[3]) return ok(catalogue[kind].filter((i) => i.genreIds.includes(Number(m[3]))).map(publicItem));
    const item = catalogue[kind].find((i) => i.id === m[4]);
    if (!item) return fail(404, 'Not found');
    // Made-up cast (no photos) and "more like this" from the same catalogue, so those rows have something to show.
    const cast = MOCK_PEOPLE.map((p, i) => ({ id: p.id, name: p.name, role: i < 3 ? `Character ${i + 1}` : p.job, department: i < 3 ? 'cast' : 'crew' }));
    const recommendations = catalogue[kind].filter((i) => i.id !== item.id).slice(0, 10).map(publicItem);
    return ok({ ...publicItem(item), tmdbId: Number(item.id), genre: item.genres, actors: 'A. Performer, B. Actor', cast, recommendations, trailer: MOCK_TRAILER });
  }

  if ((m = path.match(/^\/people\/(\d+)$/)) && method === 'GET') {
    const person = MOCK_PEOPLE.find((p) => p.id === m[1]);
    if (!person) return fail(404, 'Person not found');
    return ok({
      id: person.id,
      name: person.name,
      biography: `${person.name} is a made-up person from the mock downloadarr.`,
      birthday: '1970-01-01',
      placeOfBirth: 'Nowhere',
      knownFor: person.job,
      credits: [...catalogue.movie, ...catalogue.tv].slice(0, 12).map(publicItem),
    });
  }

  if ((m = path.match(/^\/(movies|tv-shows)\/search$/)) && method === 'GET') {
    const kind = m[1] === 'movies' ? 'movie' : 'tv';
    const q = (url.searchParams.get('query') ?? '').toLowerCase();
    return ok(catalogue[kind].filter((i) => i.title.toLowerCase().includes(q)).map(publicItem));
  }

  if (path === '/music/discover' && method === 'GET') {
    return ok({ lists: musicLists(), topArtists: [{ name: 'Test Artist', mbid: null, tasteWeight: 1 }] });
  }

  if (path === '/music/preview' && method === 'GET') {
    const artist = url.searchParams.get('artist');
    const album = url.searchParams.get('album');
    if (!artist || !album) return fail(400, 'artist and album are required');
    const tracks = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `${album} ${['Intro', 'Part', 'Interlude', 'Reprise'][i % 4]} ${i + 1}`,
      artistName: artist,
      durationSeconds: 150 + ((i * 37) % 120),
      position: i + 1,
      previewUrl: clip(i),
    }));
    return ok({ deezerAlbumId: 1, title: album, artistName: artist, coverUrl: cover(`${artist}-${album}`), tracks });
  }

  // Artist radio: a made-up station mixing the artist with the recommended artists.
  if (path === '/music/radio' && method === 'GET') {
    const artist = url.searchParams.get('artist');
    if (!artist) return fail(400, 'artist is required');
    const albums = [{ artistName: artist, albumTitle: `${artist} Live` }, ...recommendations.filter((r) => r.artistName !== artist)].slice(0, 6);
    const tracks = Array.from({ length: 12 }, (_, i) => {
      const a = albums[i % albums.length];
      return {
        id: `deezer:${i}`,
        title: `Radio Song ${i + 1}`,
        artistName: a.artistName,
        albumTitle: a.albumTitle,
        coverUrl: cover(`${a.artistName}-${a.albumTitle}`),
        durationSeconds: 200,
        previewUrl: clip(i),
        source: i % 3 ? 'deezer' : 'listenbrainz',
      };
    });
    return ok({
      artistName: artist,
      sources: ['deezer', 'listenbrainz'],
      tracks,
      albums: albums.map((a) => ({ id: `radio:${a.artistName}|${a.albumTitle}`, artistName: a.artistName, albumTitle: a.albumTitle, coverUrl: cover(`${a.artistName}-${a.albumTitle}`), sources: ['deezer'] })),
    });
  }

  if (path === '/music/dismissals' && method === 'POST') {
    const key = body.albumTitle ? `${body.artistName}|${body.albumTitle}` : body.artistName;
    const dismissal = { id: `dis_${dismissals.length + 1}`, key, label: body.albumTitle ? `${body.albumTitle} by ${body.artistName}` : body.artistName, createdAt: new Date().toISOString() };
    dismissals.push(dismissal);
    recommendations = recommendations.filter((r) => r.artistName !== body.artistName || (body.albumTitle && r.albumTitle !== body.albumTitle));
    console.log(`not interested: ${dismissal.label}`);
    return ok(dismissal);
  }

  if (path === '/torrent-requests/music' && method === 'POST') {
    if (!body.artist) return fail(400, 'artist is required for music requests');
    const same = (r) => r.contentType === 'MUSIC' && r.artist.toLowerCase() === body.artist.toLowerCase() && r.title.toLowerCase() === body.title.toLowerCase();
    if (requests.some((r) => same(r) && !['CANCELLED', 'FAILED', 'EXPIRED'].includes(r.status))) {
      return fail(409, `A request for "${body.title}" by ${body.artist} already exists`);
    }
    const now = new Date().toISOString();
    const request = { id: `req_${nextRequestId++}`, contentType: 'MUSIC', ...body, status: 'PENDING', searchAttempts: 0, createdAt: now, updatedAt: now, startedAt: Date.now() };
    requests.push(request);
    console.log(`requested album ${body.artist} - ${body.title}`);
    const { startedAt, ...shown } = request;
    return { status: 201, body: { success: true, data: shown } };
  }

  if (path === '/recommendations/profiles' && method === 'GET') {
    return ok([{ id: 'profile-dev', name: 'dev', createdAt: '2026-09-30T00:00:00.000Z' }]);
  }

  if ((m = path.match(/^\/recommendations\/(movies|tv)$/)) && method === 'GET') {
    const items = catalogue[m[1] === 'movies' ? 'movie' : 'tv'].map((i) => ({ ...publicItem(i), profiles: ['dev'] }));
    return ok({ recommended: items.filter((_, i) => i % 2 === 0), watchlist: items.filter((_, i) => i % 2 === 1) });
  }

  if (path === '/torrent-requests' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const page = requests.slice(offset, offset + limit).map(({ startedAt, ...r }) => r);
    return ok(page, { pagination: { total: requests.length, limit, offset, hasMore: offset + limit < requests.length } });
  }

  if ((m = path.match(/^\/torrent-requests\/(movies|tv-shows)$/)) && method === 'POST') {
    const contentType = m[1] === 'movies' ? 'MOVIE' : 'TV_SHOW';
    const dupe = requests.find((r) => r.contentType === contentType && r.tmdbId === body.tmdbId && r.status !== 'CANCELLED');
    if (dupe) return fail(409, 'This title has already been requested');
    const now = new Date().toISOString();
    const request = {
      id: `req_${nextRequestId++}`,
      contentType,
      ...body,
      status: 'PENDING',
      searchAttempts: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: Date.now(),
    };
    requests.push(request);
    console.log(`requested ${body.title}`, JSON.stringify({ q: body.preferredQualities, f: body.preferredFormats, l: body.preferredLanguages }));
    const { startedAt, ...shown } = request;
    return { status: 201, body: { success: true, data: shown } };
  }

  if ((m = path.match(/^\/torrent-requests\/([^/]+)\/download-status$/)) && method === 'GET') {
    const r = requests.find((x) => x.id === m[1]);
    if (!r) return fail(404, 'Not found');
    const progress = r.status === 'COMPLETED' ? 100 : r.status === 'DOWNLOADING' ? progressOf(r) : 0;
    const left = Math.max(0, Math.round((DOWNLOAD_MS * (1 - progress / 100)) / 1000));
    return ok({
      requestId: r.id,
      status: r.status,
      progress,
      downloadSpeed: r.status === 'DOWNLOADING' ? '12.4 MB/s' : '0 B/s',
      eta: r.status === 'DOWNLOADING' ? `${left}s` : '0',
      totalSize: 0,
      completedSize: 0,
      files: [],
      torrentDownloads: [],
    });
  }

  // An ongoing show mid-way: S1 partly delivered (E1 done, E2 downloading, E3 searching), S2 not found yet.
  if ((m = path.match(/^\/torrent-requests\/([^/]+)\/seasons$/)) && method === 'GET') {
    const r = requests.find((x) => x.id === m[1]);
    if (!r || r.contentType !== 'TV_SHOW') return fail(404, 'Not found');
    const progress = progressOf(r);
    const done = progress >= 100;
    const episode = (n, status) => ({ id: `${r.id}-s1e${n}`, episodeNumber: n, title: `Episode ${n}`, status });
    return ok([
      {
        id: `${r.id}-s1`,
        seasonNumber: 1,
        totalEpisodes: 3,
        // Season status DOWNLOADING also means "partly complete" in downloadarr; episode 2 stays PENDING
        // while its season pack downloads, which is what used to leave the app saying "Requested".
        status: 'DOWNLOADING',
        episodes: [episode(1, 'COMPLETED'), episode(2, done ? 'COMPLETED' : 'PENDING'), episode(3, 'SEARCHING')],
        torrentDownloads: [{ status: done ? 'COMPLETED' : 'DOWNLOADING', downloadProgress: progress }],
      },
      { id: `${r.id}-s2`, seasonNumber: 2, totalEpisodes: 8, status: 'SEARCHING', episodes: [] },
    ]);
  }

  if ((m = path.match(/^\/torrent-requests\/([^/]+)\/search$/)) && method === 'POST') {
    const r = requests.find((x) => x.id === m[1]);
    if (!r) return fail(404, 'Not found');
    Object.assign(r, { status: 'PENDING', startedAt: Date.now(), updatedAt: new Date().toISOString() });
    return ok(r);
  }

  if ((m = path.match(/^\/torrent-requests\/([^/]+)$/)) && method === 'DELETE') {
    const i = requests.findIndex((x) => x.id === m[1]);
    if (i < 0) return fail(404, 'Not found');
    console.log(`removed ${requests[i].title}`);
    requests.splice(i, 1);
    return { status: 200, body: { success: true, message: 'Torrent request deleted successfully' } };
  }

  return fail(404, `No mock for ${method} ${path}`);
}

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const { status, body } = await route(req.method, url, raw ? JSON.parse(raw) : {});
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  })
  .listen(PORT, async () => {
    await signIn();
    await loadCatalogue();
    setInterval(tick, 1000);
    console.log(`mock downloadarr on http://localhost:${PORT} (emulator: http://10.0.2.2:${PORT})`);
  });

dgram
  .createSocket({ type: 'udp4', reuseAddr: true })
  .on('message', function (msg, from) {
    if (msg.toString().trim().toLowerCase() !== 'who is downloadarr?') return;
    this.send(JSON.stringify({ Id: 'dev', Name: 'Downloadarr', Version: 'dev', Port: PORT }), from.port, from.address);
  })
  .bind(7360);
