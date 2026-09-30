import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Dropdown,
  IconButton,
  PauseIcon,
  PlayIcon,
  ScrubBar,
  SkipNextIcon,
  Text,
  TextField,
  colors,
  radii,
  spacing,
  useLayout,
} from '@tv-and-j/design-system';
import { backdropUrl, posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { remotePosition, useRemoteCommands, useRemoteDevice } from '@tv-and-j/core/jellyfin/remote';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { formatTime } from '@tv-and-j/player/PlayerControls';
import { Page } from '../../components/Page';
import { goBack } from '../../lib/nav';
import { useRemoteTarget } from '../../lib/remoteTarget';

/**
 * A remote for another screen (TV and J on the TV, or any Jellyfin app that
 * takes remote control): what it's playing, a timeline to tap, transport,
 * volume, audio and subtitles, and a message to put on its screen. Everything
 * goes through Jellyfin, so it works from anywhere the server is reachable.
 */
export default function Remote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const { isPhone, gutter } = useLayout();
  const { setSessionId } = useRemoteTarget();
  const { data: device, isPending } = useRemoteDevice(id);
  const commands = useRemoteCommands(id);
  const item = device?.NowPlayingItem;
  const details = useItem(item?.Id ?? '').data; // for its audio and subtitle tracks
  const [message, setMessage] = useState('');

  // The device reports its position every few seconds; count forward in between so the timeline moves smoothly.
  const reported = remotePosition(device);
  const paused = !!device?.PlayState?.IsPaused;
  const sync = useRef({ at: Date.now(), position: reported.position });
  useEffect(() => {
    sync.current = { at: Date.now(), position: reported.position };
  }, [reported.position]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (paused || !item) return;
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [paused, item]);
  const position = Math.min(reported.duration || Infinity, sync.current.position + (paused ? 0 : (Date.now() - sync.current.at) / 1000));

  if (!device) {
    return (
      <Page back title="Remote">
        <View style={{ paddingHorizontal: gutter, gap: spacing.md }}>
          <Text tone="secondary">{isPending ? 'Looking for it…' : 'That screen isn’t available any more. Make sure it’s on and signed in to Jellyfin.'}</Text>
          {!isPending ? (
            <Button
              label="Stop controlling it"
              size="sm"
              variant="secondary"
              onPress={() => {
                setSessionId(null);
                goBack();
              }}
            />
          ) : null}
        </View>
      </Page>
    );
  }

  const art = item ? (item.MediaType === 'Audio' ? posterUrl(api, item, 800) : backdropUrl(api, item, 1280)) : undefined;
  const title = item?.Type === 'Episode' ? item.SeriesName : item?.Name;
  const subtitle = item?.Type === 'Episode' ? `S${item.ParentIndexNumber}:E${item.IndexNumber} · ${item.Name}` : item?.ProductionYear ? String(item.ProductionYear) : undefined;
  const audio = (details?.MediaStreams ?? []).filter((s) => s.Type === 'Audio' && s.Index != null);
  const subtitles = (details?.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle' && s.Index != null);
  const volume = device.PlayState?.VolumeLevel;

  return (
    <Page back title={device.DeviceName ?? 'Remote'}>
      <View style={{ paddingHorizontal: gutter, gap: spacing.xl, maxWidth: 720 + gutter * 2, width: '100%', alignSelf: 'center' }}>
        {item ? (
          <>
            <View style={{ width: '100%', aspectRatio: item.MediaType === 'Audio' ? 1 : 16 / 9, maxWidth: item.MediaType === 'Audio' ? 360 : undefined, alignSelf: 'center', borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
              {art ? <Image source={art} contentFit="cover" style={{ flex: 1 }} /> : null}
            </View>
            <View style={{ gap: spacing.xxs }}>
              <Text variant="headline" numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
            </View>

            <View style={{ gap: spacing.xs }}>
              <ScrubBar
                value={reported.duration ? position / reported.duration : 0}
                playing={!paused}
                accessibilityLabel="Timeline. Tap to jump there."
                onPress={() => commands.playstate('PlayPause')}
                onSeek={(fraction) => commands.playstate('Seek', fraction * reported.duration)}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" tone="secondary">
                  {formatTime(position)}
                </Text>
                <Text variant="caption" tone="secondary">
                  −{formatTime(Math.max(0, reported.duration - position))}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
              <Button label="−10s" size="sm" variant="ghost" onPress={() => commands.playstate('Rewind')} />
              <IconButton
                accessibilityLabel={paused ? 'Play' : 'Pause'}
                size={64}
                icon={(c) => (paused ? <PlayIcon color={c} size={28} /> : <PauseIcon color={c} size={28} />)}
                onPress={() => commands.playstate('PlayPause')}
              />
              <Button label="+30s" size="sm" variant="ghost" onPress={() => commands.playstate('FastForward')} />
              <IconButton accessibilityLabel="Next" icon={(c) => <SkipNextIcon color={c} />} onPress={() => commands.playstate('NextTrack')} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
              <Button label="Vol −" size="sm" variant="secondary" onPress={() => commands.command('VolumeDown')} />
              <Text variant="caption" tone="secondary" style={{ minWidth: 48, textAlign: 'center' }}>
                {device.PlayState?.IsMuted ? 'Muted' : volume != null ? `${volume}%` : ''}
              </Text>
              <Button label="Vol +" size="sm" variant="secondary" onPress={() => commands.command('VolumeUp')} />
              <Button label={device.PlayState?.IsMuted ? 'Unmute' : 'Mute'} size="sm" variant="ghost" onPress={() => commands.command('ToggleMute')} />
              <Button label="Stop" size="sm" variant="ghost" onPress={() => commands.playstate('Stop')} />
            </View>

            {audio.length > 1 || subtitles.length ? (
              <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: spacing.sm, alignItems: isPhone ? 'stretch' : 'flex-start' }}>
                {audio.length > 1 ? (
                  <Dropdown
                    label="Audio"
                    value={device.PlayState?.AudioStreamIndex ?? audio[0].Index!}
                    options={audio.map((s) => ({ value: s.Index!, label: s.DisplayTitle ?? `Track ${s.Index}` }))}
                    onChange={(index) => commands.command('SetAudioStreamIndex', { Index: String(index) })}
                  />
                ) : null}
                {subtitles.length ? (
                  <Dropdown
                    label="Subtitles"
                    value={device.PlayState?.SubtitleStreamIndex ?? -1}
                    options={[{ value: -1, label: 'Off' }, ...subtitles.map((s) => ({ value: s.Index!, label: s.DisplayTitle ?? `Track ${s.Index}` }))]}
                    onChange={(index) => commands.command('SetSubtitleStreamIndex', { Index: String(index) })}
                  />
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ gap: spacing.xs, paddingVertical: spacing.xl }}>
            <Text variant="title">Nothing’s playing on {device.DeviceName}.</Text>
            <Text tone="secondary">Open something here and choose “Play on {device.DeviceName}”.</Text>
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          <TextField
            label={`Show a message on ${device.DeviceName}`}
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={() => {
              if (message.trim()) commands.message(message.trim());
              setMessage('');
            }}
            returnKeyType="send"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Send"
              size="sm"
              variant="secondary"
              disabled={!message.trim()}
              onPress={() => {
                commands.message(message.trim());
                setMessage('');
              }}
            />
            <Button
              label="Stop controlling"
              size="sm"
              variant="ghost"
              onPress={() => {
                setSessionId(null);
                goBack();
              }}
            />
          </View>
        </View>
      </View>
    </Page>
  );
}
