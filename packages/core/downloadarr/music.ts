import type { AlbumRef, MusicList, MusicRecommendation } from './client';

/** downloadarr's recommendation lists as Music tab rows, in order, with why each album is there. Both apps use these. */
export const MUSIC_ROWS: { list: MusicList; title: string; reason: (album: MusicRecommendation) => string | undefined }[] = [
  { list: 'NEW_ARTISTS', title: 'New artists for you', reason: (a) => (a.reasons.length ? `Because you listen to ${joinNames(a.reasons.slice(0, 3))}` : undefined) },
  { list: 'FRESH_RELEASES', title: 'New from artists you love', reason: (a) => (a.releaseDate ? `Released ${formatDate(a.releaseDate)}` : undefined) },
  { list: 'WEEKLY_PICKS', title: 'Your weekly exploration', reason: () => 'From ListenBrainz' },
  { list: 'WEEKLY_JAMS', title: 'Your weekly jams', reason: () => 'From ListenBrainz' },
  { list: 'DAILY_JAMS', title: 'Today’s jams', reason: () => 'From ListenBrainz' },
  { list: 'FLOW', title: 'From your Deezer Flow', reason: () => 'From Deezer' },
  { list: 'MOST_PLAYED', title: 'Your most played albums', reason: () => undefined },
  { list: 'SAVED_ALBUMS', title: 'Saved albums', reason: () => undefined },
];

/** Why a recommended album is there, whichever list it came from. */
export function recommendationReason(album: MusicRecommendation) {
  return MUSIC_ROWS.find((row) => row.list === album.list)?.reason(album);
}

const SOURCE_NAMES: Record<string, string> = { deezer: 'Deezer', listenbrainz: 'ListenBrainz' };

/** "Deezer and ListenBrainz", for where a station's music comes from. */
export function sourceNames(sources: string[]) {
  return joinNames(sources.map((s) => SOURCE_NAMES[s] ?? s));
}

/** Route params for an album's discovery page; the page looks the rest up. */
export function albumParams(album: AlbumRef) {
  return { artist: album.artistName, album: album.albumTitle };
}

export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function formatDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "3:42" from seconds. */
export function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;
}
