/**
 * Minimal client for downloadarr (github.com/chrisdmacrae/downloadarr), an
 * optional companion service: TMDB-backed discovery plus torrent requests.
 * It has no auth; every response is wrapped as { success, data, error }.
 * One server (port 3001) serves its web UI and its API, whose routes all
 * live under /api/v1.
 */
import { requestCredentials } from '../network';
import { discoverDownloadarr } from '../platform';
import type { Codec, Language, Quality, Settings } from '../state/SettingsContext';

export type MediaKind = 'movie' | 'tv';

export type DiscoverItem = {
  id: string; // TMDB id
  title: string;
  year?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  type: MediaKind | 'game';
  rating?: number;
  genres?: string[];
  runtime?: number;
  seasons?: number;
};

export type DiscoverDetails = DiscoverItem & {
  tmdbId?: number;
  imdbId?: string;
  genre?: string[];
  director?: string;
  creator?: string;
  actors?: string; // comma separated
  plot?: string;
  released?: string;
  network?: string;
  status?: string;
  episodes?: number;
  /** Top-billed cast, then the director (movies) or creators (shows). Newer downloadarr only. */
  cast?: CreditPerson[];
  /** TMDB's "more like this". Newer downloadarr only. */
  recommendations?: DiscoverItem[];
  /** YouTube key of the title's trailer. Newer downloadarr only. */
  trailer?: string;
};

/** A cast or crew member; `id` is their TMDB person id. */
export type CreditPerson = {
  id: string;
  name: string;
  /** Character played, or job (Director, Creator). */
  role?: string;
  photo?: string;
  department: 'cast' | 'crew';
};

export type PersonDetails = {
  id: string;
  name: string;
  photo?: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownFor?: string;
  /** Their movies and shows, most popular first. */
  credits: DiscoverItem[];
};

export type Genre = { id: number; name: string };

export type RequestStatus = 'PENDING' | 'SEARCHING' | 'FOUND' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export type TorrentRequest = {
  id: string;
  contentType: 'MOVIE' | 'TV_SHOW' | 'GAME' | 'MUSIC';
  /** For music, the album. */
  title: string;
  /** Music only: the album artist. */
  artist?: string;
  /** Music only: the MusicBrainz release group. */
  musicbrainzId?: string;
  year?: number;
  tmdbId?: number;
  imdbId?: string;
  status: RequestStatus;
  isOngoing?: boolean;
  posterUrl?: string;
  backdropUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type PieceStatus = 'PENDING' | 'SEARCHING' | 'FOUND' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';

export type RequestSeason = {
  id: string;
  seasonNumber: number;
  totalEpisodes?: number;
  status: PieceStatus;
  episodes?: { id: string; episodeNumber: number; title?: string; status: PieceStatus }[];
  torrentDownloads?: { status: string; downloadProgress?: number }[];
};

/** The recommendation lists downloadarr builds from your listening history (ListenBrainz, Last.fm, Deezer, Spotify). */
export type MusicList =
  | 'NEW_ARTISTS'
  | 'FRESH_RELEASES'
  | 'WEEKLY_PICKS'
  | 'WEEKLY_JAMS'
  | 'DAILY_JAMS'
  | 'FLOW'
  | 'MOST_PLAYED'
  | 'SAVED_ALBUMS';

/** An album downloadarr recommends. */
export type MusicRecommendation = {
  id: string;
  list: MusicList;
  rank: number;
  artistName: string;
  artistMbid: string | null;
  albumTitle: string;
  releaseGroupMbid: string | null;
  /** YYYY-MM-DD, or less precise. */
  releaseDate: string | null;
  coverUrl: string | null;
  score: number;
  /** Artists you listen to that led here, strongest first. */
  reasons: string[];
  sources: string[];
};

export type MusicDiscover = {
  /** Lists with nothing in them may be missing, e.g. FLOW without Deezer. */
  lists: Partial<Record<MusicList, MusicRecommendation[]>>;
  topArtists: { name: string; mbid: string | null; tasteWeight: number }[];
};

/** An album as Deezer has it: its tracklist, with 30-second previews. */
export type AlbumPreview = {
  deezerAlbumId: number;
  title: string;
  artistName: string;
  coverUrl?: string;
  tracks: { id: number; title: string; artistName: string; durationSeconds: number; position?: number; previewUrl?: string }[];
};

/** An album from Deezer's catalog (or Spotify's, when a profile has it connected), as music search finds it. */
export type MusicSearchAlbum = {
  /** The provider's id, prefixed with the provider: "deezer:123". */
  id: string;
  artistName: string;
  albumTitle: string;
  coverUrl?: string;
  /** album, ep, single or compile. Albums come first. */
  recordType?: string;
  releaseDate?: string;
  /** Deezer albums have previews; Spotify-only ones usually don't. */
  source: 'deezer' | 'spotify';
};

/** An album like another, from downloadarr's similar-albums lookup: a related artist's album closest in genre and era. */
export type SimilarAlbum = {
  /** "deezer:123". */
  id: string;
  artistName: string;
  albumTitle: string;
  coverUrl?: string;
  releaseDate?: string;
};

/** A track on an artist radio station. */
export type RadioTrack = {
  id: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  coverUrl?: string;
  durationSeconds: number;
  /** 30-second clip; signed and short-lived. */
  previewUrl: string;
  source: 'deezer' | 'listenbrainz';
};

/** An album heard on a station, to request. */
export type RadioAlbum = {
  id: string;
  artistName: string;
  albumTitle: string;
  coverUrl?: string;
  sources: string[];
};

/** Deezer's mix for an artist, plus LB Radio when ListenBrainz is connected. Built on request, never stored. */
export type ArtistRadio = {
  artistName: string;
  sources: string[];
  /** In play order. */
  tracks: RadioTrack[];
  /** The albums the tracks come from, first heard first. */
  albums: RadioAlbum[];
};

/** A person in the household, as downloadarr knows them: each builds their own recommendations. */
export type RecommendationProfile = { id: string; name: string };

/** Movies or shows from a profile's Trakt account: its recommendations and its watchlist. */
export type VideoRails = {
  recommended: (DiscoverItem & { profiles: string[] })[];
  watchlist: (DiscoverItem & { profiles: string[] })[];
};

/** What's needed to request an album; a recommendation has it all. */
export type AlbumRef = {
  artistName: string;
  albumTitle: string;
  releaseGroupMbid?: string | null;
  releaseDate?: string | null;
  coverUrl?: string | null;
};

export type DownloadStatus = {
  requestId: string;
  status: RequestStatus;
  progress: number; // 0–100
  downloadSpeed: string;
  eta: string;
};

export class DownloadarrError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const paths = { movie: 'movies', tv: 'tv-shows' } as const;

// downloadarr's filters are exact matches on what a release title says, so
// "HEVC" and "x265" are different tags for the same codec: send both.
const QUALITY: Record<Quality, string[]> = { '1080p': ['HD_1080P'], '4k': ['UHD_4K'] };
const CODEC: Record<Codec, string[]> = { h264: ['X264'], hevc: ['HEVC', 'X265'] };
const LANGUAGE: Record<Language, string> = {
  english: 'ENGLISH',
  french: 'FRENCH',
  german: 'GERMAN',
  spanish: 'SPANISH',
  japanese: 'JAPANESE',
};

/** Where downloadarr's routes live on its server. */
const API_PATH = '/api/v1';

/**
 * downloadarr's address as the client keeps it: the server itself, without the
 * API's path. An address typed or saved with /api or /api/v1 on the end (older
 * downloadarr was reached at :3000/api) means the same server.
 */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  // The port is the user's to give: downloadarr may sit behind a proxy on 80/443.
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/api(\/v1)?$/i, '');
}

const PROBE_TIMEOUT_MS = 2500;

/**
 * Find downloadarr without the user typing an address. First ask the LAN
 * (newer downloadarr answers UDP broadcasts on 7360); failing that, try the
 * Jellyfin host on downloadarr's port, since they usually run on the same
 * machine.
 */
export async function findDownloadarr(jellyfinAddress: string): Promise<string | null> {
  const announced = await discoverDownloadarr().catch(() => null);
  if (announced) return normalizeBaseUrl(announced);

  let host: string;
  try {
    host = new URL(jellyfinAddress).hostname;
  } catch {
    return null;
  }
  const url = `http://${host}:3001`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${API_PATH}/movies/genres/list`, { signal: controller.signal, credentials: requestCredentials() });
    const body = (await res.json()) as { success?: boolean };
    if (res.ok && body.success) return url;
  } catch {
    // Not there.
  } finally {
    clearTimeout(timer);
  }
  return null;
}

export class Downloadarr {
  /** The server's address, without the API's path. */
  readonly baseUrl: string;
  private readonly apiUrl: string;

  constructor(baseUrl: string) {
    // A saved address may predate /api/v1 and end in /api.
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiUrl = `${this.baseUrl}${API_PATH}`;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        credentials: requestCredentials(),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new DownloadarrError('Couldn’t reach downloadarr.');
    }
    const body = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string; message?: string } | null;
    if (!res.ok || !body?.success) {
      throw new DownloadarrError(body?.error ?? body?.message ?? `downloadarr returned ${res.status}`, res.status);
    }
    return body.data as T;
  }

  /** Cheap reachability check used by Settings. */
  ping() {
    return this.call<Genre[]>('/movies/genres/list');
  }

  genres(kind: MediaKind) {
    return this.call<Genre[]>(`/${paths[kind]}/genres/list`);
  }

  byGenre(kind: MediaKind, genreId: number, page = 1) {
    return this.call<DiscoverItem[]>(`/${paths[kind]}/genres/${genreId}?page=${page}`);
  }

  popular(kind: MediaKind, page = 1) {
    return this.call<DiscoverItem[]>(`/${paths[kind]}/popular?page=${page}`);
  }

  search(kind: MediaKind, query: string) {
    return this.call<DiscoverItem[]>(`/${paths[kind]}/search?query=${encodeURIComponent(query)}`);
  }

  details(kind: MediaKind, tmdbId: string) {
    return this.call<DiscoverDetails>(`/${paths[kind]}/${encodeURIComponent(tmdbId)}`);
  }

  person(tmdbId: string) {
    return this.call<PersonDetails>(`/people/${encodeURIComponent(tmdbId)}`);
  }

  /** All requests (paged 100 at a time). There's no lookup by TMDB id, so callers index these. */
  async requests(): Promise<TorrentRequest[]> {
    const all: TorrentRequest[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const res = await fetch(`${this.apiUrl}/torrent-requests?limit=100&offset=${offset}`, { credentials: requestCredentials() });
      const body = (await res.json()) as { success: boolean; data: TorrentRequest[]; pagination?: { hasMore: boolean } };
      if (!body.success) throw new DownloadarrError('Couldn’t load requests.');
      all.push(...body.data);
      if (!body.pagination?.hasMore) break;
    }
    return all;
  }

  /** Per-season (and per-episode) progress for a TV request. */
  seasons(requestId: string) {
    return this.call<RequestSeason[]>(`/torrent-requests/${requestId}/seasons?includeEpisodes=true`);
  }

  /** Search again for a request that failed or expired. */
  retry(requestId: string) {
    return this.call<TorrentRequest>(`/torrent-requests/${requestId}/search`, { method: 'POST' });
  }

  /** Delete a request outright; downloadarr cancels its download first if one is running. */
  remove(requestId: string) {
    return this.call<void>(`/torrent-requests/${requestId}`, { method: 'DELETE' });
  }

  downloadStatus(requestId: string) {
    return this.call<DownloadStatus>(`/torrent-requests/${requestId}/download-status`);
  }

  /** The household's recommendation profiles. Newer downloadarr only. */
  recommendationProfiles() {
    return this.call<RecommendationProfile[]>('/recommendations/profiles');
  }

  /** Trakt recommendations and watchlist for one profile, or everyone's merged. Newer downloadarr only. */
  videoRails(kind: MediaKind, profileId?: string) {
    const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    return this.call<VideoRails>(`/recommendations/${kind === 'movie' ? 'movies' : 'tv'}${query}`);
  }

  /** Album recommendations built from your listening history. Newer downloadarr only. */
  musicDiscover() {
    return this.call<MusicDiscover>('/music/discover');
  }

  /** Albums by title or artist. Newer downloadarr only. */
  searchMusic(query: string) {
    return this.call<MusicSearchAlbum[]>(`/music/search?q=${encodeURIComponent(query)}`);
  }

  /** An album's tracklist from Deezer; 404s when Deezer doesn't have it. */
  albumPreview(artist: string, album: string) {
    return this.call<AlbumPreview>(`/music/preview?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`);
  }

  /** An artist radio station; 404s when Deezer and ListenBrainz have nothing for the artist. Takes a few seconds. */
  artistRadio(artist: string) {
    return this.call<ArtistRadio>(`/music/radio?artist=${encodeURIComponent(artist)}`);
  }

  /** Albums like this one, one per related artist. Newer downloadarr only. */
  similarAlbums(artist: string, album: string) {
    return this.call<SimilarAlbum[]>(`/music/similar?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`);
  }

  /** Stop recommending an album, or (without `album`) anything by the artist. */
  dismissMusic(artist: string, album?: string) {
    return this.call<unknown>('/music/dismissals', { method: 'POST', body: JSON.stringify({ artistName: artist, albumTitle: album }) });
  }

  /** Request an album. Video preferences don't apply; downloadarr ranks music releases by audio format itself. */
  requestAlbum(album: AlbumRef) {
    const year = Number(album.releaseDate?.slice(0, 4)) || undefined;
    return this.call<TorrentRequest>('/torrent-requests/music', {
      method: 'POST',
      body: JSON.stringify({
        title: album.albumTitle,
        artist: album.artistName,
        musicbrainzId: album.releaseGroupMbid ?? undefined,
        year,
        posterUrl: album.coverUrl ?? undefined,
      }),
    });
  }

  /**
   * Request a movie, or a whole show (ongoing: new seasons are picked up too).
   * The API rejects unknown body fields, so only documented ones are sent.
   */
  request(details: DiscoverDetails, kind: MediaKind, prefs: Settings['request']) {
    const body = {
      title: details.title,
      year: details.year,
      tmdbId: details.tmdbId ?? Number(details.id),
      imdbId: details.imdbId,
      posterUrl: details.poster,
      backdropUrl: details.backdrop,
      preferredQualities: prefs.qualities.flatMap((q) => QUALITY[q]),
      preferredFormats: prefs.codecs.flatMap((c) => CODEC[c]),
      preferredLanguages: prefs.languages.map((l) => LANGUAGE[l]),
      ...(kind === 'tv' ? { isOngoing: true, totalSeasons: details.seasons, totalEpisodes: details.episodes } : {}),
    };
    return this.call<TorrentRequest>(`/torrent-requests/${kind === 'movie' ? 'movies' : 'tv-shows'}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
