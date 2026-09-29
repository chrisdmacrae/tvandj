import type { RequestSeason } from './client';

/**
 * Where a show (or one season of it) stands, derived bottom-up from its
 * episodes and torrents.
 *
 * downloadarr's own summary fields aren't usable for this: an ongoing show's
 * request drops back to PENDING between search passes even while torrents are
 * downloading, and a season's DOWNLOADING also means "partly complete".
 */
export type TvProgress = {
  state: 'complete' | 'downloading' | 'partial' | 'searching' | 'requested' | 'failed';
  /** 0–1: download progress while downloading, share of episodes done when partial. */
  progress?: number;
  label: string;
  completed: number;
  total: number;
};

function activeProgress(season: RequestSeason): number | undefined | null {
  const active = (season.torrentDownloads ?? []).filter((d) => d.status?.toUpperCase() === 'DOWNLOADING');
  if (!active.length) return null; // nothing downloading
  const known = active.filter((d) => d.downloadProgress != null);
  if (!known.length) return undefined; // downloading, progress unknown
  return known.reduce((sum, d) => sum + (d.downloadProgress ?? 0), 0) / known.length / 100;
}

export function seasonProgress(season: RequestSeason): TvProgress {
  const episodes = season.episodes ?? [];
  const total = Math.max(season.totalEpisodes ?? 0, episodes.length);
  const completed = episodes.filter((e) => e.status === 'COMPLETED').length;
  const ready = total ? `${completed} of ${total} ready` : '';
  const base = { completed, total };

  if (season.status === 'COMPLETED' && (!total || completed >= total || !episodes.length)) {
    return { ...base, state: 'complete', label: 'Downloaded' };
  }
  if (total && completed >= total) return { ...base, state: 'complete', label: 'Downloaded' };

  const active = activeProgress(season);
  if (active !== null || episodes.some((e) => e.status === 'DOWNLOADING')) {
    const progress = active ?? undefined;
    const pct = progress != null ? ` ${Math.round(progress * 100)}%` : '…';
    return { ...base, state: 'downloading', progress, label: `Downloading${pct}${completed ? ` · ${ready}` : ''}` };
  }
  if (completed > 0) {
    const searching = episodes.some((e) => e.status === 'SEARCHING' || e.status === 'FOUND');
    return { ...base, state: 'partial', progress: completed / total, label: `${ready}${searching ? ' · finding the rest' : ''}` };
  }
  if (season.status === 'FAILED' || (episodes.length && episodes.every((e) => e.status === 'FAILED'))) {
    return { ...base, state: 'failed', label: 'Not found' };
  }
  if (season.status === 'SEARCHING' || season.status === 'FOUND' || episodes.some((e) => e.status === 'SEARCHING' || e.status === 'FOUND')) {
    return { ...base, state: 'searching', label: 'Searching…' };
  }
  return { ...base, state: 'requested', label: 'Requested' };
}

const RANK: Record<TvProgress['state'], number> = {
  downloading: 0,
  partial: 1,
  searching: 2,
  requested: 3,
  failed: 4,
  complete: 5,
};

/** The show as a whole: whatever the most active unfinished season is doing. */
export function showProgress(seasons: RequestSeason[]): TvProgress | null {
  if (!seasons.length) return null;
  const all = seasons.map((s) => ({ season: s, p: seasonProgress(s) }));
  const unfinished = all.filter(({ p }) => p.state !== 'complete');
  const completed = all.reduce((n, { p }) => n + p.completed, 0);
  const total = all.reduce((n, { p }) => n + p.total, 0);
  if (!unfinished.length) return { state: 'complete', label: 'Downloaded', completed, total };

  unfinished.sort((a, b) => RANK[a.p.state] - RANK[b.p.state] || a.season.seasonNumber - b.season.seasonNumber);
  const { season, p } = unfinished[0];
  const label = seasons.length > 1 ? `S${season.seasonNumber} · ${p.label}` : p.label;
  return { ...p, label, completed, total };
}
