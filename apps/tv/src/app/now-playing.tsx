import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import {
  ArrowLeftIcon,
  Button,
  IconButton,
  ListItem,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  ScrubBar,
  SelectChip,
  ShuffleIcon,
  SkipNextIcon,
  SkipPreviousIcon,
  Text,
  colors,
  radii,
  safeArea,
  spacing,
} from '@tv-and-j/design-system';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { trackLength, useLyrics, type LyricLine } from '@tv-and-j/core/jellyfin/music';
import { ScrobbleButton } from '../components/ScrobbleButton';
import { useMusic, useMusicProgress } from '../music/MusicPlayer';
import { formatTime } from '@tv-and-j/player/PlayerControls';
import { useRemoteKeys } from '@tv-and-j/player/useRemoteKeys';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const ART = 220;
const SEEK_STEP_S = 10;

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * The music that's playing: artwork, the song, a timeline, transport controls
 * (shuffle, previous, play/pause, next, repeat), and beside it the lyrics or
 * what's up next. Music keeps playing when you leave; the top bar leads back.
 */
export default function NowPlaying() {
  const { api } = useAuthedSession();
  const music = useMusic();
  const { position, duration } = useMusicProgress();
  const { current, queue, index, isPlaying, shuffle, repeat } = music;
  const lyrics = useLyrics(current ?? undefined).data;
  const [panel, setPanel] = useState<'lyrics' | 'queue'>('lyrics');
  const [scrubFocused, setScrubFocused] = useState(false);
  const shownPanel = panel === 'lyrics' && !lyrics ? 'queue' : panel;

  // On the timeline, Left/Right skip back and forward; the remote's ⏪/⏩ do it anywhere here.
  useRemoteKeys((event) => {
    if (event.eventKeyAction === 0) return;
    if (event.eventType === 'rewind' || (scrubFocused && event.eventType === 'left')) music.seekBy(-SEEK_STEP_S);
    if (event.eventType === 'fastForward' || (scrubFocused && event.eventType === 'right')) music.seekBy(SEEK_STEP_S);
  });

  if (!current) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
        <Text tone="secondary">Nothing’s playing.</Text>
        <Button label="Back" size="md" hasTVPreferredFocus onPress={goBack} />
      </View>
    );
  }

  const art = posterUrl(api, current, ART * 2);
  const artist = current.ArtistItems?.[0] ?? current.AlbumArtists?.[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* The artwork, blurred and dimmed, fills the background. */}
      {art ? <Image source={art} blurRadius={40} contentFit="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 }} /> : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />

      <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: safeArea.horizontal, paddingVertical: safeArea.vertical, gap: spacing.xxl }}>
        <View style={{ flex: 9, gap: spacing.md }}>
          <View style={{ alignItems: 'flex-start' }}>
            <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-end' }}>
            <View style={{ width: ART, height: ART, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
              {art ? <Image source={art} cachePolicy="memory-disk" style={{ flex: 1 }} /> : null}
            </View>
            <View style={{ flex: 1, gap: spacing.xs, alignItems: 'flex-start' }}>
              <Text variant="headline" numberOfLines={2}>
                {current.Name}
              </Text>
              {artist?.Id ? (
                <Button label={artist.Name ?? ''} size="sm" variant="ghost" onPress={() => router.push({ pathname: '/artist/[id]', params: { id: artist.Id! } })} />
              ) : null}
              {current.AlbumId ? (
                <Button label={current.Album ?? 'Album'} size="sm" variant="ghost" onPress={() => router.push({ pathname: '/album/[id]', params: { id: current.AlbumId! } })} />
              ) : null}
              {/* Keyed by song, so "✓ Scrobbled" doesn't carry over to the next one. */}
              <ScrobbleButton key={current.Id} itemId={current.Id} itemType={current.Type} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="caption" tone="secondary" style={{ minWidth: 44 }}>
              {formatTime(position)}
            </Text>
            <View style={{ flex: 1 }}>
              <ScrubBar
                value={duration ? position / duration : 0}
                playing={isPlaying}
                accessibilityLabel="Timeline. OK to play or pause, left or right to skip."
                onFocus={() => setScrubFocused(true)}
                onBlur={() => setScrubFocused(false)}
                onPress={music.togglePlay}
              />
            </View>
            <Text variant="caption" tone="secondary" style={{ minWidth: 44, textAlign: 'right' }}>
              {formatTime(duration)}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
            <IconButton accessibilityLabel="Shuffle" selected={shuffle} icon={(color) => <ShuffleIcon color={color} />} onPress={music.toggleShuffle} />
            <IconButton accessibilityLabel="Previous" icon={(color) => <SkipPreviousIcon color={color} />} onPress={music.previous} />
            <IconButton
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              size={56}
              hasTVPreferredFocus
              icon={(color) => (isPlaying ? <PauseIcon color={color} size={26} /> : <PlayIcon color={color} size={26} />)}
              onPress={music.togglePlay}
            />
            <IconButton accessibilityLabel="Next" icon={(color) => <SkipNextIcon color={color} />} onPress={music.next} />
            <IconButton
              accessibilityLabel={repeat === 'one' ? 'Repeat this song' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}
              selected={repeat !== 'off'}
              icon={(color) => <RepeatIcon color={color} one={repeat === 'one'} />}
              onPress={music.cycleRepeat}
            />
          </View>
          {music.error ? (
            <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
              {music.error}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 8, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {lyrics ? <SelectChip label="Lyrics" selected={shownPanel === 'lyrics'} onPress={() => setPanel('lyrics')} /> : null}
            <SelectChip label="Up next" selected={shownPanel === 'queue'} onPress={() => setPanel('queue')} />
          </View>
          {shownPanel === 'lyrics' && lyrics ? (
            <Lyrics lines={lyrics.lines} synced={lyrics.synced} position={position} duration={duration} />
          ) : (
            <ScrollView contentContainerStyle={{ gap: spacing.xs, padding: spacing.xs }}>
              {queue.map((song, i) => (
                <ListItem
                  key={`${song.Id}-${i}`}
                  title={`${i === index ? '♪ ' : ''}${song.Name ?? ''}`}
                  subtitle={[song.Artists?.[0] ?? song.AlbumArtist, i === index ? 'Playing' : undefined].filter(Boolean).join(' · ') || undefined}
                  trailing={trackLength(song.RunTimeTicks)}
                  onPress={() => music.jumpTo(i)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Lyrics that follow the song. Synced lyrics highlight the line being sung
 * and keep it near the top; unsynced ones scroll in step with the song, since
 * plain text can't take D-pad focus to be scrolled by hand.
 */
function Lyrics({ lines, synced, position, duration }: { lines: LyricLine[]; synced: boolean; position: number; duration: number }) {
  const { height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<number[]>([]);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);

  let currentLine = -1;
  if (synced) for (let i = 0; i < lines.length; i++) if ((lines[i].start ?? Infinity) <= position) currentLine = i;

  useEffect(() => {
    if (synced) {
      const top = tops.current[currentLine];
      if (top != null) scroll.current?.scrollTo({ y: Math.max(0, top - height * 0.12), animated: true });
    } else if (duration > 0 && contentHeight > viewHeight) {
      scroll.current?.scrollTo({ y: (position / duration) * (contentHeight - viewHeight), animated: true });
    }
  }, [synced, currentLine, position, duration, contentHeight, viewHeight, height]);

  return (
    <ScrollView
      ref={scroll}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContentHeight(h)}
      contentContainerStyle={{ gap: spacing.sm, paddingBottom: height / 2 }}
    >
      {lines.map((line, i) => (
        <Text
          key={i}
          variant={synced ? 'title' : 'body'}
          tone={!synced || i === currentLine ? 'primary' : 'tertiary'}
          onLayout={(e) => {
            tops.current[i] = e.nativeEvent.layout.y;
          }}
        >
          {line.text || ' '}
        </Text>
      ))}
    </ScrollView>
  );
}
