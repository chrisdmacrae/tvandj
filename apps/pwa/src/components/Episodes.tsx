import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Dropdown, Focusable, PosterCard, ProgressBar, Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';
import { landscapeUrl } from '@tv-and-j/core/jellyfin/images';
import { useEpisodes, useSeasons } from '@tv-and-j/core/jellyfin/library';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const play = (episode: BaseItemDto) => episode.Id && router.push({ pathname: '/watch/[id]', params: { id: episode.Id } });

function minutes(ticks?: number | null) {
  return ticks ? `${Math.round(ticks / 600_000_000)}m` : undefined;
}

/** A show's seasons and their episodes: a list on phones (room for descriptions), a row of cards on bigger screens. */
export function Episodes({ series, initialSeason }: { series: BaseItemDto; initialSeason?: number }) {
  const { api } = useAuthedSession();
  const { isPhone, gutter } = useLayout();
  const seasons = useSeasons(series.Id ?? undefined).data ?? [];
  const [selected, setSelected] = useState<string | undefined>();
  useEffect(() => {
    if (!selected && seasons.length) setSelected((seasons.find((s) => s.IndexNumber === initialSeason) ?? seasons[0]).Id ?? undefined);
  }, [seasons, selected, initialSeason]);
  const episodes = useEpisodes(series.Id ?? undefined, selected).data ?? [];
  if (!seasons.length) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ paddingHorizontal: gutter, alignItems: 'flex-start' }}>
        <Dropdown
          label="Season"
          value={selected ?? ''}
          options={seasons.map((s) => ({ value: s.Id ?? '', label: s.Name ?? `Season ${s.IndexNumber}` }))}
          onChange={setSelected}
        />
      </View>
      {isPhone ? (
        <View style={{ paddingHorizontal: gutter, gap: spacing.md }}>
          {episodes.map((e) => (
            <Focusable key={e.Id} accessibilityRole="button" accessibilityLabel={`Play ${e.Name}`} focusScale={1} onPress={() => play(e)}>
              {({ focused }) => (
                <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.xs, borderRadius: radii.md, backgroundColor: focused ? colors.surfaceRaised : 'transparent' }}>
                  <View style={{ width: 136, aspectRatio: 16 / 9, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface }}>
                    <Image source={landscapeUrl(api, e, 320)} style={{ flex: 1 }} cachePolicy="memory-disk" />
                    {e.UserData?.PlayedPercentage ? <ProgressBar value={e.UserData.PlayedPercentage / 100} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: spacing.xxs }}>
                    <Text variant="label" numberOfLines={2}>
                      {`${e.IndexNumber ?? ''}. ${e.Name ?? ''}`}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {[minutes(e.RunTimeTicks), e.UserData?.Played ? 'Watched' : undefined].filter(Boolean).join(' · ')}
                    </Text>
                    {e.Overview ? (
                      <Text variant="caption" tone="secondary" numberOfLines={2}>
                        {e.Overview}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            </Focusable>
          ))}
        </View>
      ) : (
        <FlatList
          horizontal
          data={episodes}
          keyExtractor={(e) => e.Id ?? ''}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: spacing.sm, gap: spacing.lg }}
          renderItem={({ item: e }) => (
            <PosterCard
              shape="landscape"
              title={`${e.IndexNumber ?? ''}. ${e.Name ?? ''}`}
              subtitle={minutes(e.RunTimeTicks)}
              imageUri={landscapeUrl(api, e, 480)}
              progress={e.UserData?.PlayedPercentage ? e.UserData.PlayedPercentage / 100 : undefined}
              watched={e.UserData?.Played && !e.UserData.PlayedPercentage}
              onPress={() => play(e)}
            />
          )}
        />
      )}
    </View>
  );
}
