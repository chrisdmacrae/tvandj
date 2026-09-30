import { configurePlatform } from '@tv-and-j/core/platform';
import { discoverDownloadarr } from '../modules/jellyfin-discovery';
import { audioCodecs, videoDecoders } from '../modules/jellyfin-discovery/capabilities';

// The TV's own decoders (and HDMI passthrough), LAN discovery, and ExoPlayer's containers.
configurePlatform({
  videoDecoders,
  audioCodecs,
  directPlayContainers: () => ['mp4', 'm4v', 'mkv', 'webm'],
  discoverDownloadarr,
});
