import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TVFocusGuideView, View } from 'react-native';
import { Button, Dropdown, PosterCard, Text, safeArea, spacing } from '@tv-and-j/design-system';
import type { RequestSeason } from '@tv-and-j/core/downloadarr/client';
import { useRequestSeasons } from '@tv-and-j/core/downloadarr/hooks';
import { seasonProgress, type TvProgress } from '@tv-and-j/core/downloadarr/tvStatus';
import { landscapeUrl } from '@tv-and-j/core/jellyfin/images';
import { useTogglePlayed } from '@tv-and-j/core/jellyfin/browse';
import { DeleteButton } from './DeleteButton';
import { useEpisodes, useSeasons } from '@tv-and-j/core/jellyfin/library';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

// react-native-web has no focus guides; a plain View is fine there.
const FocusGuide = TVFocusGuideView ?? View;

type Display = { download?: number | null; status: string };

/** Card props for a season (as a whole) that downloadarr hasn't delivered yet. */
function seasonDisplay(p: TvProgress): Display {
  switch (p.state) {
    case 'downloading':
    case 'partial':
      return { download: p.progress ?? null, status: p.label };
    case 'complete':
      return { download: null, status: 'Adding to library…' };
    case 'failed':
      return { status: p.label };
    default:
      return { download: null, status: p.label };
  }
}

/**
 * One episode not in Jellyfin yet. Episode statuses lag behind season packs:
 * an episode still marked PENDING is really downloading if its season's
 * torrent is, so the season's state wins while it's actively downloading.
 */
function episodeDisplay(status: RequestSeason['status'], season: TvProgress): Display {
  if (status === 'COMPLETED') return { download: null, status: 'Adding to library…' };
  if (status === 'FAILED') return { status: 'Not found' };
  if (status === 'SEARCHING' || status === 'FOUND') return { download: null, status: 'Searching…' };
  // Only an episode with no status of its own inherits the season pack's download.
  if (status === 'DOWNLOADING' || season.state === 'downloading') {
    const pct = season.state === 'downloading' && season.progress != null ? season.progress : null;
    return { download: pct, status: pct != null ? `Downloading ${Math.round(pct * 100)}%` : 'Downloading…' };
  }
  return { download: null, status: 'Requested' };
}

type Card =
  | { key: string; kind: 'episode'; episode: BaseItemDto }
  | { key: string; kind: 'pending'; number: number | null; title?: string; display: Display };

type SeasonBrowserProps = {
  /** The show in Jellyfin, if it's there; without it, delivered episodes show as "adding to library". */
  series?: BaseItemDto;
  /** TMDB id, for downloadarr's side. Defaults to the Jellyfin series' own. */
  tmdbId?: string;
  /** Season to open on, e.g. the next-up episode's. */
  initialSeason?: number;
  onPlayEpisode: (episodeId: string) => void;
  /** Focus entered the section: the viewer is browsing, so hold any autoplay. */
  onFocus?: () => void;
};

/**
 * Season picker plus a row of that season's episodes. Seasons come from
 * Jellyfin and, when connected, downloadarr; so an ongoing show lists
 * seasons and episodes still on their way, with their download status,
 * next to the ones ready to play.
 */
export function SeasonBrowser({ series, tmdbId, initialSeason, onPlayEpisode, onFocus }: SeasonBrowserProps) {
  const { api } = useAuthedSession();
  const jellyfinSeasons = useSeasons(series?.Id ?? undefined).data;
  const requestSeasons = useRequestSeasons(tmdbId ?? series?.ProviderIds?.Tmdb ?? undefined).data;

  // Every season number either side knows about, in order.
  const seasons = useMemo(() => {
    const numbers = new Set<number>();
    for (const s of jellyfinSeasons ?? []) if (s.IndexNumber != null) numbers.add(s.IndexNumber);
    for (const s of requestSeasons ?? []) numbers.add(s.seasonNumber);
    return [...numbers]
      .sort((a, b) => a - b)
      .map((number) => {
        const request = requestSeasons?.find((s) => s.seasonNumber === number);
        return {
          number,
          jellyfin: jellyfinSeasons?.find((s) => s.IndexNumber === number),
          request,
          progress: request ? seasonProgress(request) : undefined,
        };
      });
  }, [jellyfinSeasons, requestSeasons]);

  const [selected, setSelected] = useState<number | undefined>(initialSeason);
  useEffect(() => {
    if (selected == null && seasons.length) {
      setSelected(seasons.find((s) => s.number === initialSeason)?.number ?? seasons.find((s) => s.jellyfin)?.number ?? seasons[0].number);
    }
  }, [seasons, selected, initialSeason]);

  const season = seasons.find((s) => s.number === selected);
  const togglePlayed = useTogglePlayed();
  const seasonWatched = !!season?.jellyfin?.UserData?.Played;
  const episodes = useEpisodes(series?.Id ?? undefined, season?.jellyfin?.Id ?? undefined).data;

  const cards = useMemo<Card[]>(() => {
    if (!season) return [];
    const inLibrary = new Set((episodes ?? []).map((e) => e.IndexNumber));
    const list: Card[] = (episodes ?? []).map((e) => ({ key: e.Id ?? String(e.IndexNumber), kind: 'episode', episode: e }));
    if (season.request && season.progress) {
      const progress = season.progress;
      for (const e of season.request.episodes ?? []) {
        if (inLibrary.has(e.episodeNumber)) continue;
        list.push({ key: `pending-${e.episodeNumber}`, kind: 'pending', number: e.episodeNumber, title: e.title, display: episodeDisplay(e.status, progress) });
      }
      // A season downloadarr is fetching whole, with no episode list yet: one card for it.
      if (!list.length) list.push({ key: 'pending-season', kind: 'pending', number: null, display: seasonDisplay(progress) });
    }
    return list.sort((a, b) => (numberOf(a) ?? Infinity) - (numberOf(b) ?? Infinity));
  }, [season, episodes]);

  if (!seasons.length) return null;

  const options = seasons.map((s) => ({
    value: s.number,
    label: s.number === 0 ? 'Specials' : `Season ${s.number}`,
    detail: s.progress && s.progress.state !== 'complete' ? s.progress.label : undefined,
  }));

  return (
    <View style={{ gap: spacing.xs }}>
      {/*
        Full-width guides: the dropdown is a narrow pill at the far left, so a plain
        geometric focus search from Play or from an episode further right can pass it
        by. Any Up/Down into this row lands on the dropdown; into the next row, on the
        last-focused episode.
      */}
      <FocusGuide autoFocus style={{ width: '100%', paddingHorizontal: safeArea.horizontal, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Dropdown label="Season" value={selected ?? seasons[0].number} options={options} onChange={setSelected} onFocus={onFocus} />
        {season?.jellyfin?.Id ? (
          <Button
            label={seasonWatched ? 'Mark season unwatched' : 'Mark season watched'}
            size="sm"
            variant="ghost"
            onFocus={onFocus}
            onPress={() => season.jellyfin?.Id && !togglePlayed.isPending && togglePlayed.mutate({ itemId: season.jellyfin.Id, on: !seasonWatched })}
          />
        ) : null}
        <DeleteButton item={season?.jellyfin} label="Delete season" onFocus={onFocus} onDeleted={() => setSelected(undefined)} />
      </FocusGuide>
      <FocusGuide autoFocus style={{ width: '100%' }}>
        <FlatList
          horizontal
          data={cards}
          keyExtractor={(c) => c.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: safeArea.horizontal, paddingVertical: spacing.md, gap: spacing.lg }}
          ListEmptyComponent={
            <Text variant="caption" tone="secondary">
              No episodes yet.
            </Text>
          }
          renderItem={({ item: card }) =>
            card.kind === 'episode' ? (
              <PosterCard
                shape="landscape"
                title={`${card.episode.IndexNumber ?? ''}. ${card.episode.Name ?? ''}`}
                subtitle={episodeSubtitle(card.episode)}
                imageUri={landscapeUrl(api, card.episode, 480)}
                progress={card.episode.UserData?.PlayedPercentage ? card.episode.UserData.PlayedPercentage / 100 : undefined}
                watched={card.episode.UserData?.Played && !card.episode.UserData.PlayedPercentage}
                onFocus={onFocus}
                onPress={() => card.episode.Id && onPlayEpisode(card.episode.Id)}
              />
            ) : (
              <PosterCard
                shape="landscape"
                title={card.number == null ? `Season ${season?.number}` : `${card.number}. ${card.title ?? `Episode ${card.number}`}`}
                {...card.display}
                // Focusable (so the row can be browsed) but nothing to play yet.
                onFocus={onFocus}
              />
            )
          }
        />
      </FocusGuide>
    </View>
  );
}

function numberOf(card: Card) {
  return card.kind === 'episode' ? card.episode.IndexNumber : card.number;
}

function episodeSubtitle(e: BaseItemDto) {
  if (e.RunTimeTicks && e.UserData?.PlaybackPositionTicks) {
    return `${Math.round((e.RunTimeTicks - e.UserData.PlaybackPositionTicks) / 600_000_000)}m left`;
  }
  return e.RunTimeTicks ? `${Math.round(e.RunTimeTicks / 600_000_000)}m` : undefined;
}
