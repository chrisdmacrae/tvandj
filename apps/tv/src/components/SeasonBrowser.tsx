import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, TVFocusGuideView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Dropdown, PosterCard, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import type { RequestSeason } from '../downloadarr/client';
import { useRequestSeasons } from '../downloadarr/hooks';
import { seasonProgress, type TvProgress } from '../downloadarr/tvStatus';
import { landscapeUrl } from '../jellyfin/images';
import { useEpisodes, useSeasons } from '../jellyfin/library';
import { useAuthedSession } from '../state/SessionContext';

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
      <FocusGuide autoFocus style={{ width: '100%', paddingHorizontal: safeArea.horizontal }}>
        <Dropdown label="Season" value={selected ?? seasons[0].number} options={options} onChange={setSelected} onFocus={onFocus} />
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

/** Season dropdown + one row of landscape episode cards with titles. */
export const SEASONS_HEIGHT = 250;

/**
 * SeasonBrowser as a block in a scrolling page, below a summary. Its top edge
 * fades in over the artwork behind; below that it's solid, so it covers the
 * artwork as it scrolls up.
 */
export function SeasonsBlock({ opacity, ...props }: SeasonBrowserProps & { opacity?: Animated.Value | Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View style={{ opacity: opacity ?? 1 }}>
      <Svg width="100%" height={spacing.xxxl}>
        <Defs>
          <LinearGradient id="seasons-block-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.canvas} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#seasons-block-scrim)" />
      </Svg>
      <View style={{ backgroundColor: colors.canvas, paddingBottom: safeArea.vertical }}>
        <SeasonBrowser {...props} />
      </View>
    </Animated.View>
  );
}

/**
 * SeasonBrowser pinned along the bottom of a summary screen, over a gradient
 * so it reads on top of artwork. Screens reserve SEASONS_HEIGHT above it.
 */
export function SeasonsSection({ opacity, ...props }: SeasonBrowserProps & { opacity?: Animated.Value | Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: SEASONS_HEIGHT + 40, opacity: opacity ?? 1 }}>
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
        <Defs>
          <LinearGradient id="seasons-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.canvas} stopOpacity={0} />
            <Stop offset="0.2" stopColor={colors.canvas} stopOpacity={0.85} />
            <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#seasons-scrim)" />
      </Svg>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.sm }}>
        <SeasonBrowser {...props} />
      </View>
    </Animated.View>
  );
}
