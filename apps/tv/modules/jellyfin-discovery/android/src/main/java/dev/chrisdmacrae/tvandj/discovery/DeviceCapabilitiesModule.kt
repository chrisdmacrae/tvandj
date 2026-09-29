package dev.chrisdmacrae.tvandj.discovery

import android.media.MediaCodecInfo.CodecProfileLevel
import android.media.MediaCodecList
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What the device's video decoders can actually play, so the app can tell
 * Jellyfin and get a transcode instead of a stream the hardware chokes on
 * (e.g. 10-bit HEVC on a 1080p Fire TV stick). Decoders aren't guaranteed to
 * report honestly, but this is what ExoPlayer itself consults.
 */
class DeviceCapabilitiesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceCapabilities")

    Function("videoDecoders") {
      val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter { !it.isEncoder }

      fun decoders(mime: String) = codecs.filter { info -> info.supportedTypes.any { it.equals(mime, ignoreCase = true) } }

      /** Highest HEVC level (Jellyfin's level_idc scale, e.g. 150 = 5.0) for any of the given profiles, or 0. */
      fun hevcMaxLevel(vararg profiles: Int): Int =
        decoders("video/hevc")
          .flatMap { it.getCapabilitiesForType("video/hevc").profileLevels.toList() }
          .filter { it.profile in profiles }
          .maxOfOrNull { HEVC_LEVELS[it.level] ?: 0 } ?: 0

      fun hasProfile(mime: String, profile: Int) =
        decoders(mime).any { info -> info.getCapabilitiesForType(mime).profileLevels.any { it.profile == profile } }

      mapOf(
        "hevc" to decoders("video/hevc").isNotEmpty(),
        "hevcMainMaxLevel" to hevcMaxLevel(CodecProfileLevel.HEVCProfileMain),
        "hevcMain10MaxLevel" to hevcMaxLevel(CodecProfileLevel.HEVCProfileMain10, CodecProfileLevel.HEVCProfileMain10HDR10),
        "vp9" to decoders("video/x-vnd.on2.vp9").isNotEmpty(),
        "av1" to decoders("video/av01").isNotEmpty(),
        "h264High10" to hasProfile("video/avc", CodecProfileLevel.AVCProfileHigh10),
      )
    }
  }

  companion object {
    /** Android's HEVC level constants (main and high tier) → level_idc (level × 30). */
    private val HEVC_LEVELS = mapOf(
      CodecProfileLevel.HEVCMainTierLevel1 to 30, CodecProfileLevel.HEVCHighTierLevel1 to 30,
      CodecProfileLevel.HEVCMainTierLevel2 to 60, CodecProfileLevel.HEVCHighTierLevel2 to 60,
      CodecProfileLevel.HEVCMainTierLevel21 to 63, CodecProfileLevel.HEVCHighTierLevel21 to 63,
      CodecProfileLevel.HEVCMainTierLevel3 to 90, CodecProfileLevel.HEVCHighTierLevel3 to 90,
      CodecProfileLevel.HEVCMainTierLevel31 to 93, CodecProfileLevel.HEVCHighTierLevel31 to 93,
      CodecProfileLevel.HEVCMainTierLevel4 to 120, CodecProfileLevel.HEVCHighTierLevel4 to 120,
      CodecProfileLevel.HEVCMainTierLevel41 to 123, CodecProfileLevel.HEVCHighTierLevel41 to 123,
      CodecProfileLevel.HEVCMainTierLevel5 to 150, CodecProfileLevel.HEVCHighTierLevel5 to 150,
      CodecProfileLevel.HEVCMainTierLevel51 to 153, CodecProfileLevel.HEVCHighTierLevel51 to 153,
      CodecProfileLevel.HEVCMainTierLevel52 to 156, CodecProfileLevel.HEVCHighTierLevel52 to 156,
      CodecProfileLevel.HEVCMainTierLevel6 to 180, CodecProfileLevel.HEVCHighTierLevel6 to 180,
      CodecProfileLevel.HEVCMainTierLevel61 to 183, CodecProfileLevel.HEVCHighTierLevel61 to 183,
      CodecProfileLevel.HEVCMainTierLevel62 to 186, CodecProfileLevel.HEVCHighTierLevel62 to 186,
    )
  }
}
