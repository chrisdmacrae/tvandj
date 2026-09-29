import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto, DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models';
import { getMediaInfoApi, getSessionApi } from '@jellyfin/sdk/lib/utils/api';

const TICKS_PER_SECOND = 10_000_000;

/**
 * What Fire TV's ExoPlayer handles. Video is always requested as HLS so the
 * server can deliver text subtitles as WebVTT renditions inside the stream;
 * expo-video can't side-load subtitle files. The server stream-copies video
 * and audio when the codecs already fit, so this is usually a cheap remux.
 */
const DEVICE_PROFILE: DeviceProfile = {
  Name: 'TV and J',
  MaxStreamingBitrate: 120_000_000,
  MaxStaticBitrate: 120_000_000,
  MusicStreamingTranscodingBitrate: 320_000,
  DirectPlayProfiles: [
    { Type: 'Video', Container: 'mp4,m4v,mkv,webm', VideoCodec: 'h264,hevc,vp9,av1', AudioCodec: 'aac,mp3,ac3,eac3,opus,flac' },
    { Type: 'Audio', Container: 'mp3,aac,m4a,flac,ogg,opus,wav' },
  ],
  TranscodingProfiles: [
    {
      Type: 'Video',
      Container: 'ts',
      Protocol: 'hls',
      Context: 'Streaming',
      VideoCodec: 'h264,hevc',
      AudioCodec: 'aac,ac3,eac3,mp3',
      MaxAudioChannels: '6',
      MinSegments: 1,
      BreakOnNonKeyFrames: true,
    },
    { Type: 'Audio', Container: 'mp3', Protocol: 'http', Context: 'Streaming', AudioCodec: 'mp3', MaxAudioChannels: '2' },
  ],
  SubtitleProfiles: ['vtt', 'srt', 'subrip', 'ass', 'ssa', 'webvtt', 'mov_text'].map((Format) => ({ Format, Method: 'Hls' as const })),
};

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
      DeviceProfile: DEVICE_PROFILE,
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
