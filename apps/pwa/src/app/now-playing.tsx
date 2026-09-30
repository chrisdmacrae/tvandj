import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  spacing,
  useLayout,
} from '@tv-and-j/design-system';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { trackLength, useLyrics, type LyricLine } from '@tv-and-j/core/jellyfin/music';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { formatTime } from '@tv-and-j/player/PlayerControls';
import { ScrobbleButton } from '../components/ScrobbleButton';
import { goBack } from '../lib/nav';
import { useMusic, useMusicProgress } from '../music/MusicPlayer';

const SEEK_STEP_S = 10;

/**
 * The music that's playing, like the TV's: artwork, the song, a timeline,
 * transport controls, and the lyrics or what's up next. Phones stack it all;
 * wider screens put the lyrics beside it. Music keeps playing when you leave:
 * the bar above the tabs (phones) or the top bar leads back.
 */
export default function NowPlaying() {
  const { api } = useAuthedSession();
  const { isPhone, width, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const music = useMusic();
  const { position, duration } = useMusicProgress();
  const { current, queue, index, isPlaying, shuffle, repeat } = music;
  const lyrics = useLyrics(current ?? undefined).data;
  const [panel, setPanel] = useState<'lyrics' | 'queue'>('lyrics');
  const shownPanel = panel === 'lyrics' && !lyrics ? 'queue' : panel;

  // Keyboard: Space plays and pauses, J / L skip back and forward (unless typing somewhere).
  const { togglePlay, seekBy } = music;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, button, [role="button"]')) return;
      if (e.key === ' ') togglePlay();
      else if (e.key === 'j') seekBy(-SEEK_STEP_S);
      else if (e.key === 'l') seekBy(SEEK_STEP_S);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy]);

  const back = <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />;

  if (!current) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
        <Text tone="secondary">Nothing’s playing.</Text>
        <Button label="Back" size="md" onPress={goBack} />
      </View>
    );
  }

  const artSize = isPhone ? Math.min(width - gutter * 2, 360) : 260;
  const art = posterUrl(api, current, 720);
  const artist = current.Artists?.join(', ') || current.AlbumArtist || undefined;

  const player = (
    <View style={{ gap: spacing.md, alignItems: isPhone ? 'stretch' : undefined }}>
      <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: spacing.lg, alignItems: isPhone ? 'center' : 'flex-end' }}>
        <View style={{ width: artSize, height: artSize, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
          {art ? <Image source={art} cachePolicy="memory-disk" style={{ flex: 1 }} /> : null}
        </View>
        <View style={{ flex: isPhone ? undefined : 1, gap: spacing.xs, alignItems: isPhone ? 'center' : 'flex-start' }}>
          <Text variant="headline" numberOfLines={2} style={{ textAlign: isPhone ? 'center' : 'left' }}>
            {current.Name}
          </Text>
          {artist ? <Text tone="secondary">{artist}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: isPhone ? 'center' : 'flex-start' }}>
            {current.AlbumId ? (
              <Button label={current.Album ?? 'Album'} size="sm" variant="ghost" onPress={() => router.push({ pathname: '/album/[id]', params: { id: current.AlbumId! } })} />
            ) : null}
            {/* Keyed by song, so "✓ Scrobbled" doesn't carry over to the next one. */}
            <ScrobbleButton key={current.Id} itemId={current.Id} itemType={current.Type} compact />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text variant="caption" tone="secondary" style={{ minWidth: 40 }}>
          {formatTime(position)}
        </Text>
        <View style={{ flex: 1 }}>
          <ScrubBar
            value={duration ? position / duration : 0}
            playing={isPlaying}
            accessibilityLabel="Timeline. Click to jump there; Enter plays or pauses."
            onSeek={(fraction) => duration && music.seekTo(fraction * duration)}
            onPress={music.togglePlay}
          />
        </View>
        <Text variant="caption" tone="secondary" style={{ minWidth: 40, textAlign: 'right' }}>
          {formatTime(duration)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isPhone ? spacing.md : spacing.lg }}>
        <IconButton accessibilityLabel="Shuffle" selected={shuffle} icon={(color) => <ShuffleIcon color={color} />} onPress={music.toggleShuffle} />
        <IconButton accessibilityLabel="Previous" icon={(color) => <SkipPreviousIcon color={color} />} onPress={music.previous} />
        <IconButton
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          size={56}
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
  );

  const upNext = queue.map((song, i) => (
    <ListItem
      key={`${song.Id}-${i}`}
      title={`${i === index ? '♪ ' : ''}${song.Name ?? ''}`}
      subtitle={[song.Artists?.[0] ?? song.AlbumArtist, i === index ? 'Playing' : undefined].filter(Boolean).join(' · ') || undefined}
      trailing={trackLength(song.RunTimeTicks)}
      onPress={() => music.jumpTo(i)}
    />
  ));

  const tabs = (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {lyrics ? <SelectChip label="Lyrics" selected={shownPanel === 'lyrics'} onPress={() => setPanel('lyrics')} /> : null}
      <SelectChip label="Up next" selected={shownPanel === 'queue'} onPress={() => setPanel('queue')} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* The artwork, blurred and dimmed, fills the background. */}
      {art ? <Image source={art} blurRadius={40} contentFit="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 }} /> : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />

      {isPhone ? (
        // One column that scrolls: the player, then the lyrics or the queue below it.
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
          <View style={{ alignItems: 'flex-start' }}>{back}</View>
          {player}
          {tabs}
          {shownPanel === 'lyrics' && lyrics ? (
            <Lyrics lines={lyrics.lines} synced={lyrics.synced} position={position} duration={duration} />
          ) : (
            <View style={{ gap: spacing.xs }}>{upNext}</View>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: gutter, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.xxl }}>
          <View style={{ flex: 9, gap: spacing.md }}>
            <View style={{ alignItems: 'flex-start' }}>{back}</View>
            {player}
          </View>
          <View style={{ flex: 8, gap: spacing.md }}>
            {tabs}
            {shownPanel === 'lyrics' && lyrics ? (
              <Lyrics lines={lyrics.lines} synced={lyrics.synced} position={position} duration={duration} scrolls />
            ) : (
              <ScrollView contentContainerStyle={{ gap: spacing.xs, padding: spacing.xs }}>{upNext}</ScrollView>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Lyrics that follow the song: synced ones highlight the line being sung. Beside
 * the player (`scrolls`) they keep that line near the top of their own panel;
 * on phones they're part of the page, which you scroll yourself.
 */
function Lyrics({ lines, synced, position, duration, scrolls }: { lines: LyricLine[]; synced: boolean; position: number; duration: number; scrolls?: boolean }) {
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<number[]>([]);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);

  let currentLine = -1;
  if (synced) for (let i = 0; i < lines.length; i++) if ((lines[i].start ?? Infinity) <= position) currentLine = i;

  useEffect(() => {
    if (!scrolls) return;
    if (synced) {
      const top = tops.current[currentLine];
      if (top != null) scroll.current?.scrollTo({ y: Math.max(0, top - viewHeight * 0.2), animated: true });
    } else if (duration > 0 && contentHeight > viewHeight) {
      scroll.current?.scrollTo({ y: (position / duration) * (contentHeight - viewHeight), animated: true });
    }
  }, [scrolls, synced, currentLine, position, duration, contentHeight, viewHeight]);

  const text = lines.map((line, i) => (
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
  ));

  if (!scrolls) return <View style={{ gap: spacing.sm }}>{text}</View>;
  return (
    <ScrollView
      ref={scroll}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContentHeight(h)}
      contentContainerStyle={{ gap: spacing.sm, paddingBottom: viewHeight / 2 }}
    >
      {text}
    </ScrollView>
  );
}
