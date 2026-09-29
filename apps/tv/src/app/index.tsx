import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Button, Screen, Shelf, Text, colors, safeArea, spacing, type ArtworkShape } from '@tv-and-j/design-system';
import { MediaCard } from '../components/MediaCard';
import { useContinueWatching, useLatest, useLibraryKinds } from '../jellyfin/library';
import { useAuthedSession } from '../state/SessionContext';

type Row = { key: string; title: string; shape: ArtworkShape; items: BaseItemDto[] };

export default function Home() {
  const { server, auth, signOut, forgetServer } = useAuthedSession();
  const kinds = useLibraryKinds();
  const has = (kind: string) => kinds.data?.has(kind) ?? false;

  const resume = useContinueWatching();
  const movies = useLatest('movies', has('movies'));
  const shows = useLatest('tvshows', has('tvshows'));
  const music = useLatest('music', has('music'));

  // Rows only render when their library exists and has something in it.
  const rows: Row[] = [
    { key: 'resume', title: 'Continue Watching', shape: 'landscape' as const, items: resume.data ?? [] },
    { key: 'movies', title: 'Latest Movies', shape: 'portrait' as const, items: has('movies') ? (movies.data ?? []) : [] },
    { key: 'shows', title: 'Latest Shows', shape: 'portrait' as const, items: has('tvshows') ? (shows.data ?? []) : [] },
    { key: 'music', title: 'Latest Music', shape: 'square' as const, items: has('music') ? (music.data ?? []) : [] },
  ].filter((row) => row.items.length > 0);

  const loading = kinds.isPending || resume.isPending;

  return (
    <Screen inset={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: safeArea.vertical }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: safeArea.horizontal,
            marginBottom: spacing.lg,
          }}
        >
          <View>
            <Text variant="headline">Home</Text>
            <Text variant="caption" tone="secondary">
              {auth.userName} · {server.name}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Sign out" variant="ghost" size="sm" onPress={signOut} />
            <Button label="Change server" variant="ghost" size="sm" onPress={forgetServer} />
          </View>
        </View>

        {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}

        {!loading && rows.length === 0 ? (
          <Text tone="secondary" style={{ paddingHorizontal: safeArea.horizontal }}>
            Nothing here yet. Add some media to your Jellyfin libraries and it will show up here.
          </Text>
        ) : null}

        {rows.map((row, rowIndex) => (
          <Shelf
            key={row.key}
            title={row.title}
            data={row.items}
            keyExtractor={(item) => item.Id ?? ''}
            renderItem={({ item, index }) => (
              <MediaCard item={item} shape={row.shape} hasTVPreferredFocus={rowIndex === 0 && index === 0} />
            )}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}
