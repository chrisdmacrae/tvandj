import type { Api } from '@jellyfin/sdk';
import type {
  BaseItemDto,
  CodecProfile,
  DeviceProfile,
  MediaStream,
  ProfileConditionValue,
  TrickplayInfoDto,
} from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi, getMediaInfoApi, getSessionApi } from '@jellyfin/sdk/lib/utils/api';
import { audioCodecs, directPlayContainers, videoDecoders } from '../platform';

export const TICKS_PER_SECOND = 10_000_000;

/**
 * What this device's player can handle, built from its actual hardware
 * decoders. Jellyfin stream-copies video that fits (usually a cheap remux)
 * and transcodes to H.264 anything that doesn't, e.g. 10-bit HEVC on a
 * decoder that only does 8-bit, instead of sending a stream that won't play.
 *
 * Video is always requested as HLS so the server can deliver text subtitles
 * as WebVTT renditions inside the stream; expo-video can't side-load them.
 */

const TEXT_SUBTITLES = ['vtt', 'srt', 'subrip', 'ass', 'ssa', 'webvtt', 'mov_text'];

function deviceProfile(): DeviceProfile {
  const d = videoDecoders();
  const videoCodecs = ['h264', d.hevc && 'hevc', d.vp9 && 'vp9', d.av1 && 'av1'].filter(Boolean).join(',');
  const lessOrEqual = (Property: ProfileConditionValue, Value: number) =>
    ({ Condition: 'LessThanEqual', Property, Value: String(Value), IsRequired: false }) as const;

  const codecProfiles: CodecProfile[] = [];
  if (d.hevc) {
    if (d.hevcMain10MaxLevel > 0) {
      // Separate level limits for 8-bit and 10-bit streams.
      codecProfiles.push(
        {
          Type: 'Video',
          Codec: 'hevc',
          ApplyConditions: [lessOrEqual('VideoBitDepth', 8)],
          Conditions: [lessOrEqual('VideoLevel', d.hevcMainMaxLevel)],
        },
        {
          Type: 'Video',
          Codec: 'hevc',
          ApplyConditions: [{ Condition: 'GreaterThanEqual', Property: 'VideoBitDepth', Value: '9', IsRequired: false }],
          Conditions: [lessOrEqual('VideoLevel', d.hevcMain10MaxLevel), lessOrEqual('VideoBitDepth', 10)],
        },
      );
    } else {
      codecProfiles.push({
        Type: 'Video',
        Codec: 'hevc',
        Conditions: [lessOrEqual('VideoBitDepth', 8), lessOrEqual('VideoLevel', d.hevcMainMaxLevel)],
      });
    }
  }
  if (!d.h264High10) {
    codecProfiles.push({ Type: 'Video', Codec: 'h264', Conditions: [lessOrEqual('VideoBitDepth', 8)] });
  }

  return {
    Name: 'TV and J',
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 120_000_000,
    MusicStreamingTranscodingBitrate: 320_000,
    DirectPlayProfiles: [
      { Type: 'Video', Container: directPlayContainers().join(','), VideoCodec: videoCodecs, AudioCodec: audioCodecs().join(',') },
      { Type: 'Audio', Container: 'mp3,aac,m4a,flac,ogg,opus,wav' },
    ],
    TranscodingProfiles: [
      {
        Type: 'Video',
        Container: 'ts',
        Protocol: 'hls',
        Context: 'Streaming',
        // Listed codecs can be stream-copied; anything else is transcoded to the first, H.264.
        VideoCodec: d.hevc ? 'h264,hevc' : 'h264',
        // AAC first: it's what anything unplayable becomes. The rest are copied as-is when the device plays them.
        AudioCodec: ['aac', ...audioCodecs().filter((c) => ['ac3', 'eac3', 'mp3'].includes(c))].join(','),
        MaxAudioChannels: '6',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      { Type: 'Audio', Container: 'mp3', Protocol: 'http', Context: 'Streaming', AudioCodec: 'mp3', MaxAudioChannels: '2' },
    ],
    CodecProfiles: codecProfiles,
    SubtitleProfiles: [
      ...TEXT_SUBTITLES.map((Format) => ({ Format, Method: 'Embed' as const })),
      ...TEXT_SUBTITLES.map((Format) => ({ Format, Method: 'Hls' as const })),
      ...['pgssub', 'pgs', 'dvdsub', 'dvbsub', 'vobsub'].map((Format) => ({ Format, Method: 'Encode' as const })),
    ],
  };
}

/** An audio or subtitle track as Jellyfin describes it. */
export type Track = {
  /** Jellyfin's stream index; what PlaybackInfo's AudioStreamIndex / SubtitleStreamIndex take. */
  index: number;
  label: string;
  isDefault: boolean;
  /** A separate file next to the video, rather than inside it. */
  external: boolean;
  /** Text (SRT, ASS, WebVTT…) rather than pictures (PGS, VobSub). */
  text: boolean;
  /** e.g. "eac3", "dts", "subrip", "pgssub". */
  codec?: string;
};

export type Trickplay = { itemId: string; mediaSourceId: string; width: number; info: TrickplayInfoDto };

export type Stream = {
  url: string;
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  playMethod: 'DirectPlay' | 'Transcode';
  isAudio: boolean;
  /** Where playback should begin, in seconds. */
  startSeconds: number;
  audio: Track[];
  subtitles: Track[];
  /** Selected audio stream (undefined: the file's default). */
  audioIndex: number | undefined;
  /** Selected subtitle stream; -1 is off. */
  subtitleIndex: number;
  /** Scrub-bar thumbnails, when the server has generated them. */
  trickplay?: Trickplay;
};

export type StreamOptions = {
  audioIndex?: number;
  subtitleIndex?: number;
  /** Override the resume point, e.g. to reload at the current position. */
  startSeconds?: number;
  /** false: always go through the server (e.g. to deliver an external or picture subtitle). */
  directPlay?: boolean;
};

function tracks(streams: MediaStream[] | null | undefined, type: 'Audio' | 'Subtitle'): Track[] {
  return (streams ?? [])
    .filter((m) => m.Type === type && m.Index != null)
    .map((m) => ({
      index: m.Index!,
      label: m.DisplayTitle || m.Title || m.Language || `${type} ${m.Index}`,
      isDefault: !!m.IsDefault,
      external: !!m.IsExternal,
      text: m.Type === 'Subtitle' ? !!m.IsTextSubtitleStream : false,
      codec: m.Codec?.toLowerCase() ?? undefined,
    }));
}

/** The smallest trickplay resolution that's still readable on a TV (about 240px wide). */
function pickTrickplay(item: BaseItemDto, mediaSourceId: string): Trickplay | undefined {
  const bySize = item.Trickplay?.[mediaSourceId];
  if (!bySize || !item.Id) return undefined;
  const sizes = Object.entries(bySize)
    .map(([w, info]) => ({ width: Number(w), info }))
    .filter((t) => t.info.TileWidth && t.info.TileHeight && t.info.Interval)
    .sort((a, b) => a.width - b.width);
  const pick = sizes.find((t) => t.width >= 240) ?? sizes[sizes.length - 1];
  return pick ? { itemId: item.Id, mediaSourceId, ...pick } : undefined;
}

/**
 * Ask Jellyfin how to play an item on this device. Direct play (the file as-is)
 * when the decoders can handle it and the chosen subtitle can stay in the file;
 * otherwise an HLS stream the server remuxes or transcodes, carrying text
 * subtitles as WebVTT and burning in picture subtitles.
 */
export async function resolveStream(api: Api, userId: string, item: BaseItemDto, options: StreamOptions = {}): Promise<Stream> {
  if (!item.Id) throw new Error('Item has no id');
  // Queue items (e.g. from Next Up) can be partial; the full item has streams and trickplay.
  const { data: full } = await getLibraryApi(api).getItem({ itemId: item.Id, userId });
  const isAudio = full.MediaType === 'Audio';
  const startSeconds = options.startSeconds ?? (full.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND;

  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId: item.Id,
    playbackInfoDto: {
      UserId: userId,
      DeviceProfile: deviceProfile(),
      StartTimeTicks: Math.round(startSeconds * TICKS_PER_SECOND),
      AutoOpenLiveStream: true,
      EnableDirectPlay: options.directPlay ?? true,
      EnableDirectStream: false,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      // Left unset until someone picks, so Jellyfin chooses by the profile's
      // audio and subtitle preferences (language, when to show subtitles).
      AudioStreamIndex: options.audioIndex,
      SubtitleStreamIndex: options.subtitleIndex,
    },
  });

  const source = data.MediaSources?.[0];
  if (!source?.Id || !data.PlaySessionId) throw new Error('The server returned no playable source.');

  const directPlay = !!source.SupportsDirectPlay;
  const params = new URLSearchParams({
    static: 'true',
    mediaSourceId: source.Id,
    playSessionId: data.PlaySessionId,
    // ApiKey, not the old api_key: newer Jellyfin servers turn the old form off by default.
    ApiKey: api.accessToken,
  });
  let url: string;
  if (directPlay) {
    url = isAudio
      ? `${api.basePath}/Audio/${item.Id}/stream?${params}`
      : `${api.basePath}/Videos/${item.Id}/stream${source.Container ? `.${source.Container.split(',')[0]}` : ''}?${params}`;
  } else if (source.TranscodingUrl) {
    url = `${api.basePath}${source.TranscodingUrl}`;
  } else {
    throw new Error('The server can’t stream this in a format this device plays.');
  }

  const streams = source.MediaStreams ?? full.MediaStreams;
  return {
    url,
    itemId: item.Id,
    mediaSourceId: source.Id,
    playSessionId: data.PlaySessionId,
    playMethod: directPlay ? 'DirectPlay' : 'Transcode',
    isAudio,
    startSeconds,
    audio: tracks(streams, 'Audio'),
    subtitles: tracks(streams, 'Subtitle'),
    audioIndex: options.audioIndex ?? source.DefaultAudioStreamIndex ?? undefined,
    subtitleIndex: options.subtitleIndex ?? source.DefaultSubtitleStreamIndex ?? -1,
    trickplay: isAudio ? undefined : pickTrickplay(full, source.Id),
  };
}

type Position = { seconds: number; paused: boolean; volume: number; muted: boolean };

function base(stream: Stream, { seconds, paused, volume, muted }: Position) {
  return {
    ItemId: stream.itemId,
    MediaSourceId: stream.mediaSourceId,
    PlaySessionId: stream.playSessionId,
    PlayMethod: stream.playMethod,
    PositionTicks: Math.round(seconds * TICKS_PER_SECOND),
    IsPaused: paused,
    IsMuted: muted,
    VolumeLevel: Math.round(volume * 100),
    CanSeek: true,
  };
}

// Reporting is best-effort: a failed progress ping must never interrupt playback.
/**
 * Tell Jellyfin to stop converting a stream and delete its files. A stopped
 * report does this for sessions that played; this covers the rest (a preview
 * you left, a failed load, a track switch), which otherwise pile up in the
 * server's transcode folder until its daily cleanup.
 */
export function stopTranscode(api: Api, stream: Stream) {
  if (stream.playMethod !== 'Transcode') return;
  api.axiosInstance
    .delete(`${api.basePath}/Videos/ActiveEncodings`, {
      params: { deviceId: api.deviceInfo.id, playSessionId: stream.playSessionId },
      headers: { Authorization: api.authorizationHeader },
    })
    .catch(() => {});
}

export const report = {
  start: (api: Api, stream: Stream, p: Position) =>
    getSessionApi(api).reportPlaybackStart({ playbackStartInfo: base(stream, p) }).catch(() => {}),
  progress: (api: Api, stream: Stream, p: Position) =>
    getSessionApi(api).reportPlaybackProgress({ playbackProgressInfo: base(stream, p) }).catch(() => {}),
  stopped: (api: Api, stream: Stream, p: Position) =>
    getSessionApi(api)
      .reportPlaybackStopped({ playbackStopInfo: { ...base(stream, p), Failed: false } })
      .catch(() => {}),
};
