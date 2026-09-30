import { useState, type ReactNode } from 'react';
import { TVFocusGuideView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeftIcon, Button, IconButton, ScrubBar, Text, colors, spacing } from '@tv-and-j/design-system';
import { usePlayerEdges, type Insets } from './edges';
import { TracksPanel } from './TracksPanel';
import { TrickplayPreview } from './TrickplayPreview';
import type { PlaybackControls as Playback } from './types';
import { useRemoteKeys } from './useRemoteKeys';
import type { Scrubber } from './useScrubber';

// react-native-web has no focus guides; a plain View is fine there.
const FocusGuide = TVFocusGuideView ?? View;

export function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

type PlayerControlsProps = {
  playback: Playback;
  scrubber: Scrubber;
  title: string;
  subtitle?: string;
  /** Called on every interaction so the parent can keep the controls awake. */
  onInteract: () => void;
  /** Leave the player. */
  onBack: () => void;
  /** A contextual button beside the title, e.g. Skip intro or Next episode. */
  action?: ReactNode;
  /** The audio & subtitles panel is open (it replaces the transport controls). */
  tracksOpen: boolean;
  onOpenTracks: () => void;
  /** The device's notch and home bar (web and phones). */
  insets?: Insets;
};

/**
 * Player chrome: Back at the top left, transport controls along the bottom. Rendered only while visible so hidden
 * buttons can't steal D-pad focus. The timeline takes focus each time they
 * show: OK plays/pauses, Left/Right drive a continuous scrub.
 */
export function PlayerControls({ playback, scrubber, title, subtitle, onInteract, onBack, action, tracksOpen, onOpenTracks, insets }: PlayerControlsProps) {
  const edges = usePlayerEdges(insets);
  const { currentTime, duration, isPlaying, volume, stream } = playback;
  const [scrubFocused, setScrubFocused] = useState(false);

  useRemoteKeys((event) => {
    if (!scrubFocused || event.eventKeyAction === 0) return; // count each press once (on key-up)
    if (event.eventType === 'left') scrubber.step(-1);
    if (event.eventType === 'right') scrubber.step(1);
  });

  const act = (fn: () => void) => () => {
    fn();
    onInteract();
  };

  const shownTime = scrubber.position ?? currentTime;
  const hasTrackChoice = !!stream && !stream.isAudio && (stream.audio.length > 1 || stream.subtitles.length > 0);
  const subtitleOn = stream?.subtitles.find((t) => t.index === stream.subtitleIndex);
  const tracksLabel = subtitleOn ? `Audio & subtitles · ${subtitleOn.label}` : 'Audio & subtitles';

  return (
    <>
      {/* Top bar: Back, over a light scrim so it reads on bright video. Up from the timeline reaches it. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        <Svg style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} width="100%" height="100%">
          <Defs>
            <LinearGradient id="controls-top-scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.canvas} stopOpacity={0.7} />
              <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#controls-top-scrim)" />
        </Svg>
        <View style={{ paddingHorizontal: edges.horizontal, paddingTop: edges.top, paddingBottom: spacing.xxxl, alignItems: 'flex-start' }}>
          <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={onBack} />
        </View>
      </View>

      {tracksOpen && stream ? (
        <TracksPanel
          stream={stream}
          switching={playback.switching}
          onSelectAudio={(index) => {
            playback.selectAudio(index);
            onInteract();
          }}
          onSelectSubtitle={(index) => {
            playback.selectSubtitle(index);
            onInteract();
          }}
          insets={insets}
        />
      ) : null}

      {tracksOpen ? null : (
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Svg style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} width="100%" height="100%">
          <Defs>
            <LinearGradient id="controls-scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.canvas} stopOpacity={0} />
              <Stop offset="0.4" stopColor={colors.canvas} stopOpacity={0.75} />
              <Stop offset="1" stopColor={colors.canvas} stopOpacity={0.95} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#controls-scrim)" />
        </Svg>

        <View style={{ paddingHorizontal: edges.horizontal, paddingTop: spacing.xxxl, paddingBottom: edges.bottom, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text variant="title" numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {action}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="caption" tone={scrubber.scrubbing ? 'primary' : 'secondary'} style={{ minWidth: 56 }}>
              {formatTime(shownTime)}
            </Text>
            {/* Trap Left/Right on the timeline so they scrub instead of moving focus. */}
            <FocusGuide trapFocusLeft trapFocusRight style={{ flex: 1 }}>
              <ScrubBar
                value={duration ? shownTime / duration : 0}
                playing={isPlaying && !scrubber.scrubbing}
                label={scrubber.label}
                preview={
                  scrubber.scrubbing && stream?.trickplay ? <TrickplayPreview trickplay={stream.trickplay} seconds={shownTime} /> : undefined
                }
                hasTVPreferredFocus
                accessibilityLabel={`Timeline, ${isPlaying ? 'playing' : 'paused'}. OK to play or pause, left or right to scrub.`}
                onFocus={() => {
                  setScrubFocused(true);
                  onInteract();
                }}
                onBlur={() => {
                  setScrubFocused(false);
                  scrubber.commit();
                }}
                // OK: finish a scrub (resuming if it was playing), otherwise play/pause.
                onPress={act(() => (scrubber.scrubbing ? scrubber.commit() : playback.togglePlay()))}
                // Touch and mouse: tap or click the bar to jump there. (On TV, OK plays/pauses.)
                onSeek={
                  edges.isTv || !duration
                    ? undefined
                    : (fraction) => {
                        playback.seekTo(fraction * duration);
                        onInteract();
                      }
                }
              />
            </FocusGuide>
            <Text variant="caption" tone="secondary" style={{ minWidth: 56, textAlign: 'right' }}>
              −{formatTime(Math.max(0, duration - shownTime))}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            {hasTrackChoice ? <Button size="sm" variant="ghost" label={tracksLabel} onPress={act(onOpenTracks)} /> : null}
            {/* Phones have volume buttons of their own. */}
            {edges.isPhone ? null : (
            <>
            <Button size="sm" variant="ghost" label="Vol −" onPress={act(playback.volumeDown)} />
            <Text variant="caption" tone="secondary" style={{ minWidth: 40, textAlign: 'center' }}>
              {Math.round(volume * 100)}%
            </Text>
            <Button size="sm" variant="ghost" label="Vol +" onPress={act(playback.volumeUp)} />
            </>
            )}
          </View>
        </View>
      </View>
      )}
    </>
  );
}
