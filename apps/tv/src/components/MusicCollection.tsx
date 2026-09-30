import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Button, Text, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import { fetchInstantMix } from '@tv-and-j/core/jellyfin/music';
import { useMusic } from '../music/MusicPlayer';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { GlowScreen } from './GlowScreen';
import { PageHeader } from './PageHeader';
import { TrackList } from './TrackList';

const ART = 220;

type MusicCollectionProps = {
  /** The album or playlist (for Instant Mix). */
  item: BaseItemDto | undefined;
  artUri?: string;
  title: string;
  /** Artist, year, song count… */
  details: ReactNode;
  tracks: BaseItemDto[] | undefined;
  showArtist?: boolean;
  numberByPosition?: boolean;
  /** Extra actions after Play / Shuffle / Instant Mix (e.g. Delete). */
  actions?: ReactNode;
  /** Below the songs, full width (e.g. a row of albums like this). */
  footer?: ReactNode;
};

/** An album or playlist: artwork and details, Play / Shuffle / Instant Mix, then the songs. */
export function MusicCollection({ item, artUri, title, details, tracks, showArtist, numberByPosition, actions, footer }: MusicCollectionProps) {
  const { api, auth } = useAuthedSession();
  const music = useMusic();
  const play = (options: { startIndex?: number; shuffle?: boolean }) => {
    if (!tracks?.length) return;
    music.playQueue(tracks, options);
    router.push('/now-playing');
  };
  const instantMix = async () => {
    if (!item?.Id) return;
    const mix = await fetchInstantMix(api, auth.userId, item.Id).catch(() => []);
    if (mix.length) {
      music.playQueue(mix);
      router.push('/now-playing');
    }
  };

  return (
    <GlowScreen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: safeArea.horizontal, paddingBottom: safeArea.vertical }}>
        <PageHeader title="" />
        <View style={{ flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-end', marginBottom: spacing.xl }}>
          <View style={{ width: ART, height: ART, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
            {artUri ? <Image source={artUri} cachePolicy="memory-disk" style={{ flex: 1 }} /> : null}
          </View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text variant="headline" numberOfLines={2}>
              {title}
            </Text>
            {details}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button label="Play" size="md" hasTVPreferredFocus disabled={!tracks?.length} onPress={() => play({ startIndex: 0 })} />
              <Button label="Shuffle" size="md" variant="secondary" disabled={!tracks?.length} onPress={() => play({ shuffle: true })} />
              <Button label="Instant Mix" size="md" variant="secondary" onPress={instantMix} />
              {actions}
            </View>
          </View>
        </View>
        {tracks ? (
          <TrackList tracks={tracks} onPlay={(i) => play({ startIndex: i })} showArtist={showArtist} numberByPosition={numberByPosition} />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
        {footer}
      </ScrollView>
    </GlowScreen>
  );
}
