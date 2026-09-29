import type { Api } from '@jellyfin/sdk';
import type {
  BaseItemDto,
  CodecProfile,
  DeviceProfile,
  ProfileConditionValue,
} from '@jellyfin/sdk/lib/generated-client/models';
import { getMediaInfoApi, getSessionApi } from '@jellyfin/sdk/lib/utils/api';
import { videoDecoders } from '../../modules/jellyfin-discovery/capabilities';

const TICKS_PER_SECOND = 10_000_000;

/**
 * What this device's player can handle, built from its actual hardware
 * decoders. Jellyfin stream-copies video that fits (usually a cheap remux)
 * and transcodes to H.264 anything that doesn't, e.g. 10-bit HEVC on a
 * decoder that only does 8-bit, instead of sending a stream that won't play.
 *
 * Video is always requested as HLS so the server can deliver text subtitles
 * as WebVTT renditions inside the stream; expo-video can't side-load them.
 */
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
      { Type: 'Video', Container: 'mp4,m4v,mkv,webm', VideoCodec: videoCodecs, AudioCodec: 'aac,mp3,ac3,eac3,opus,flac' },
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
        AudioCodec: 'aac,ac3,eac3,mp3',
        MaxAudioChannels: '6',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      { Type: 'Audio', Container: 'mp3', Protocol: 'http', Context: 'Streaming', AudioCodec: 'mp3', MaxAudioChannels: '2' },
    ],
    CodecProfiles: codecProfiles,
    SubtitleProfiles: ['vtt', 'srt', 'subrip', 'ass', 'ssa', 'webvtt', 'mov_text'].map((Format) => ({ Format, Method: 'Hls' as const })),
  };
}

export type Stream = {
  url: string;
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  playMethod: 'DirectPlay' | 'Transcode';
  isAudio: boolean;
  /** Where to resume, in seconds. */
  startSeconds: number;
};

export async function resolveStream(api: Api, userId: string, item: BaseItemDto): Promise<Stream> {
  if (!item.Id) throw new Error('Item has no id');
  const isAudio = item.MediaType === 'Audio';
  const startTicks = item.UserData?.PlaybackPositionTicks ?? 0;
  // The HLS master playlist only lists subtitles when one is requested, so ask for the first text track.
  const firstTextSubtitle = item.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.IsTextSubtitleStream)?.Index;

  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId: item.Id,
    playbackInfoDto: {
      UserId: userId,
      DeviceProfile: deviceProfile(),
      StartTimeTicks: startTicks,
      AutoOpenLiveStream: true,
      EnableDirectPlay: isAudio,
      EnableDirectStream: false,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      SubtitleStreamIndex: firstTextSubtitle ?? undefined,
    },
  });

  const source = data.MediaSources?.[0];
  if (!source?.Id || !data.PlaySessionId) throw new Error('The server returned no playable source.');

  const params = new URLSearchParams({
    static: 'true',
    mediaSourceId: source.Id,
    playSessionId: data.PlaySessionId,
    api_key: api.accessToken,
  });
  const directPlay = isAudio && source.SupportsDirectPlay;
  const url = directPlay
    ? `${api.basePath}/Audio/${item.Id}/stream?${params}`
    : `${api.basePath}${source.TranscodingUrl}`;

  return {
    url,
    itemId: item.Id,
    mediaSourceId: source.Id,
    playSessionId: data.PlaySessionId,
    playMethod: directPlay ? 'DirectPlay' : 'Transcode',
    isAudio,
    startSeconds: startTicks / TICKS_PER_SECOND,
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
