import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, View } from 'react-native';
import { Button, spacing } from '@tv-and-j/design-system';
import type { Segment } from '@tv-and-j/core/jellyfin/segments';
import { usePlayerEdges, type Insets } from './edges';
import { PlayerControls } from './PlayerControls';
import type { PlaybackControls } from './types';
import { UpNextCard } from './UpNextCard';
import { useRemoteKeys, type RemoteEvent } from './useRemoteKeys';
import { useScrubber } from './useScrubber';
import { useSegmentSkip } from './useSegmentSkip';

const CONTROLS_HIDE_MS = 5_000;
/** Without a credits marker, offer the next episode this close to the end. */
const UP_NEXT_BEFORE_END_S = 30;
const UP_NEXT_COUNTDOWN_S = 10;
const REMOTE_KEYS = new Set(['up', 'down', 'left', 'right', 'select', 'playPause', 'play', 'pause', 'rewind', 'fastForward', 'info', 'back']);

export type PlayerOverlayProps = {
  playback: PlaybackControls;
  /** The player is on screen (not a preview, not covered by another screen). */
  active: boolean;
  title: string;
  subtitle?: string;
  /** The episode after this one, if any. */
  nextEpisode: BaseItemDto | null;
  /** Intros, recaps, credits: for Skip, and to time the next-episode card. */
  segments: Segment[];
  autoSkipIntro: boolean;
  autoplayNext: boolean;
  onBack: () => void;
  onPlayNext: () => void;
  /** Whether the next-episode card was dismissed, for the screen's end-of-episode handling. */
  upNextDismissedRef?: { current: boolean };
  /** The device's notch and home bar (web and phones). */
  insets?: Insets;
};

/**
 * Everything over the picture while something plays, the same on TV and the web:
 * the controls (shown on any key, tap or mouse move; hidden after a few idle
 * seconds, never mid-scrub or with the track picker open), continuous scrubbing,
 * the audio & subtitles panel, Skip intro / recap / credits, and the next-episode
 * card with its countdown. Back (the remote, or Esc) closes things in order,
 * then leaves.
 */
export function PlayerOverlay({
  playback,
  active,
  title,
  subtitle,
  nextEpisode,
  segments,
  autoSkipIntro,
  autoplayNext,
  onBack,
  onPlayNext,
  upNextDismissedRef,
  insets,
}: PlayerOverlayProps) {
  const edges = usePlayerEdges(insets);
  const scrubber = useScrubber(playback);
  const scrubbing = useRef(false);
  scrubbing.current = scrubber.scrubbing;
  const { step: scrubStep, commit: scrubCommit } = scrubber;
  const { togglePlay } = playback;

  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsShown = useRef(false);
  controlsShown.current = controlsVisible;
  const [tracksOpen, setTracksOpen] = useState(false);
  const tracksOpenRef = useRef(false);
  tracksOpenRef.current = tracksOpen;

  // Controls: any key, tap or mouse move wakes them; they sleep after a few idle seconds.
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    const hide = () => {
      // Never pull the controls out from under an active scrub or the track picker.
      if (scrubbing.current || tracksOpenRef.current) hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
      else setControlsVisible(false);
    };
    hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (active) wakeControls();
  }, [active, wakeControls]);

  // Intro/recap/credits skipping, and the next episode as the credits roll.
  const skipper = useSegmentSkip(playback, segments, { enabled: active, autoSkip: autoSkipIntro });
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  if (upNextDismissedRef) upNextDismissedRef.current = upNextDismissed;
  const nextId = nextEpisode?.Id;
  useEffect(() => setUpNextDismissed(false), [nextId]);
  const outro = segments.find((s) => s.type === 'Outro');
  const creditsAt = outro ? outro.start : playback.duration > UP_NEXT_BEFORE_END_S * 4 ? playback.duration - UP_NEXT_BEFORE_END_S : Infinity;
  const inCredits = active && !!nextEpisode && playback.currentTime >= creditsAt;
  const upNextShown = inCredits && !upNextDismissed && !controlsVisible && !tracksOpen;

  // Counts down while the card is up and it's playing; any interaction (the controls) pauses it.
  const [countdown, setCountdown] = useState(UP_NEXT_COUNTDOWN_S);
  const counting = upNextShown && autoplayNext && playback.isPlaying;
  useEffect(() => {
    if (!inCredits) setCountdown(UP_NEXT_COUNTDOWN_S);
  }, [inCredits]);
  useEffect(() => {
    if (!counting) return;
    const tick = 250;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - tick / 1000)), tick);
    return () => clearInterval(timer);
  }, [counting]);
  useEffect(() => {
    if (counting && countdown <= 0) onPlayNext();
  }, [counting, countdown, onPlayNext]);

  // A Skip or Next episode button takes focus from the hidden controls; OK on it shouldn't also wake them.
  const overlayAction = active && !controlsVisible && !tracksOpen && (upNextShown || !!skipper.segment);
  const overlayActionRef = useRef(false);
  overlayActionRef.current = overlayAction;
  const upNextShownRef = useRef(false);
  upNextShownRef.current = upNextShown;

  // Back: close the track picker, then hide the controls, then dismiss the next-episode card, then leave.
  const back = useCallback(() => {
    if (tracksOpenRef.current) {
      setTracksOpen(false);
      wakeControls();
    } else if (controlsShown.current) {
      setControlsVisible(false);
    } else if (upNextShownRef.current) {
      setUpNextDismissed(true);
    } else {
      onBack();
    }
  }, [onBack, wakeControls]);

  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [active, back]);

  useRemoteKeys(
    useCallback(
      (event: RemoteEvent) => {
        // Android delivers key-up (1) for these; skip key-down (0) where it also arrives so a press counts once.
        if (!active || event.eventKeyAction === 0 || !REMOTE_KEYS.has(event.eventType)) return;
        if (event.eventType === 'back') return back();
        if (overlayActionRef.current && (event.eventType === 'select' || (upNextShownRef.current && (event.eventType === 'left' || event.eventType === 'right')))) {
          return; // the focused Skip / Next episode buttons handle these
        }
        switch (event.eventType) {
          case 'playPause':
          case 'play':
          case 'pause':
            if (scrubbing.current) scrubCommit();
            else togglePlay();
            break;
          // ⏪/⏩ drive the same continuous scrub as the timeline.
          case 'rewind':
            scrubStep(-1);
            break;
          case 'fastForward':
            scrubStep(1);
            break;
          // With the controls hidden, Left/Right start scrubbing straight away. Once visible,
          // the focused timeline handles them itself.
          case 'left':
            if (!controlsShown.current && !tracksOpenRef.current) scrubStep(-1);
            break;
          case 'right':
            if (!controlsShown.current && !tracksOpenRef.current) scrubStep(1);
            break;
        }
        wakeControls();
      },
      [active, back, togglePlay, scrubStep, scrubCommit, wakeControls],
    ),
  );

  if (!active) return null;

  return (
    // Moving the mouse (web) shows the controls, like pressing a key.
    <View pointerEvents="box-none" onPointerMove={wakeControls} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {upNextShown && nextEpisode ? (
        <UpNextCard
          episode={nextEpisode}
          countdown={autoplayNext ? countdown : undefined}
          total={UP_NEXT_COUNTDOWN_S}
          onPlay={onPlayNext}
          onCancel={() => setUpNextDismissed(true)}
          insets={insets}
        />
      ) : overlayAction && skipper.label ? (
        <View style={{ position: 'absolute', right: edges.horizontal, bottom: edges.bottom + spacing.lg }}>
          <Button label={skipper.label} variant="secondary" hasTVPreferredFocus onPress={skipper.skip} />
        </View>
      ) : null}

      {!controlsVisible && !overlayAction ? (
        // While the controls sleep, this invisible full-screen target holds focus (TV) and catches
        // taps and clicks (touch, mouse): anything wakes the controls.
        <Pressable
          focusable
          hasTVPreferredFocus
          accessibilityLabel="Show player controls"
          onPress={wakeControls}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      {controlsVisible ? (
        <PlayerControls
          playback={playback}
          scrubber={scrubber}
          title={title}
          subtitle={subtitle}
          onInteract={wakeControls}
          onBack={onBack}
          tracksOpen={tracksOpen}
          onOpenTracks={() => setTracksOpen(true)}
          insets={insets}
          action={
            inCredits && nextEpisode ? (
              <Button label="Next episode" size="sm" variant="secondary" onPress={onPlayNext} />
            ) : skipper.label ? (
              <Button
                label={skipper.label}
                size="sm"
                variant="secondary"
                onPress={() => {
                  skipper.skip();
                  wakeControls();
                }}
              />
            ) : undefined
          }
        />
      ) : null}
    </View>
  );
}
