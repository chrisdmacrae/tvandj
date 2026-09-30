import { ActivityIndicator, ScrollView, TVFocusGuideView, View } from 'react-native';
import { ListItem, Text, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import type { Stream, Track } from '@tv-and-j/core/jellyfin/playback';

const FocusGuide = TVFocusGuideView ?? View;

type TracksPanelProps = {
  stream: Stream;
  /** The stream is being reloaded for a new track. */
  switching: boolean;
  onSelectAudio: (index: number) => void;
  onSelectSubtitle: (index: number) => void;
};

function subtitleNote(track: Track) {
  if (!track.text) return 'Shown in the picture';
  return track.external ? 'Separate file' : undefined;
}

/**
 * Audio and subtitle picker over the right side of the player. Back closes it
 * (handled by the screen). Focus stays inside while it's open.
 */
export function TracksPanel({ stream, switching, onSelectAudio, onSelectSubtitle }: TracksPanelProps) {
  const audioFocus = stream.audio.find((t) => t.index === stream.audioIndex) ?? stream.audio[0];
  return (
    <FocusGuide
      autoFocus
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: '62%',
        flexDirection: 'row',
        gap: spacing.lg,
        paddingHorizontal: safeArea.horizontal,
        paddingVertical: safeArea.vertical,
        backgroundColor: colors.scrim,
        borderTopLeftRadius: radii.lg,
        borderBottomLeftRadius: radii.lg,
      }}
    >
      <Column title="Audio">
        {stream.audio.map((t) => (
          <ListItem
            key={t.index}
            title={t.label}
            trailing={t.index === stream.audioIndex ? '✓' : undefined}
            hasTVPreferredFocus={t === audioFocus}
            disabled={switching}
            onPress={() => t.index !== stream.audioIndex && onSelectAudio(t.index)}
          />
        ))}
        {!stream.audio.length ? (
          <Text variant="caption" tone="secondary">
            No audio tracks listed
          </Text>
        ) : null}
      </Column>
      <Column title="Subtitles" busy={switching}>
        <ListItem
          title="Off"
          trailing={stream.subtitleIndex < 0 ? '✓' : undefined}
          hasTVPreferredFocus={!audioFocus}
          disabled={switching}
          onPress={() => stream.subtitleIndex >= 0 && onSelectSubtitle(-1)}
        />
        {stream.subtitles.map((t) => (
          <ListItem
            key={t.index}
            title={t.label}
            subtitle={subtitleNote(t)}
            trailing={t.index === stream.subtitleIndex ? '✓' : undefined}
            disabled={switching}
            onPress={() => t.index !== stream.subtitleIndex && onSelectSubtitle(t.index)}
          />
        ))}
      </Column>
    </FocusGuide>
  );
}

function Column({ title, busy, children }: { title: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" tone="secondary">
          {title}
        </Text>
        {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.xs, padding: spacing.xs }}>
        {children}
      </ScrollView>
    </View>
  );
}
