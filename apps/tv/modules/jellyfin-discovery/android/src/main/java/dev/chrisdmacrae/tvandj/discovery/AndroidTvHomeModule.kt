package dev.chrisdmacrae.tvandj.discovery

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.tvprovider.media.tv.PreviewChannelHelper
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.WatchNextProgram
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android TV / Google TV home screen integration: the "Continue watching"
 * (Watch Next) row, and the connection details the system search provider
 * uses. Fire TV has neither (its equivalents are for Amazon catalog partners),
 * so everything here is a no-op there.
 */
class AndroidTvHomeModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("AndroidTvHome")

    Function("isSupported") { isSupported(context) }

    /** Remember where to search (or forget it, with null) for [SearchProvider]. */
    Function("setSearchConfig") { config: Map<String, String>? ->
      val prefs = context.getSharedPreferences(SearchProvider.PREFS, Context.MODE_PRIVATE).edit()
      if (config == null) prefs.clear()
      else {
        prefs.putString(SearchProvider.BASE_URL, config["baseUrl"])
        prefs.putString(SearchProvider.TOKEN, config["token"])
        prefs.putString(SearchProvider.USER_ID, config["userId"])
      }
      prefs.apply()
    }

    /**
     * Make the Watch Next row match `programs` (the profile's Continue Watching):
     * add new ones, update positions, and drop anything no longer in progress.
     * Titles the viewer removed from the row themselves stay removed.
     */
    AsyncFunction("setWatchNext") { programs: List<Map<String, Any?>> ->
      if (!isSupported(context)) return@AsyncFunction 0
      syncWatchNext(context, programs)
    }
  }

  companion object {
    fun isSupported(context: Context): Boolean {
      if (Build.MANUFACTURER.equals("Amazon", ignoreCase = true)) return false
      return context.packageManager.resolveContentProvider(TvContractCompat.AUTHORITY, 0) != null
    }

    @SuppressLint("RestrictedApi")
    private fun syncWatchNext(context: Context, programs: List<Map<String, Any?>>): Int {
      val resolver = context.contentResolver
      val helper = PreviewChannelHelper(context)

      // Our rows (the provider only returns this app's), keyed by Jellyfin item id.
      val existing = mutableMapOf<String, WatchNextProgram>()
      resolver.query(TvContractCompat.WatchNextPrograms.CONTENT_URI, WatchNextProgram.PROJECTION, null, null, null)?.use { cursor ->
        while (cursor.moveToNext()) {
          val program = WatchNextProgram.fromCursor(cursor)
          program.internalProviderId?.let { existing[it] = program }
        }
      }

      val wanted = programs.mapNotNull { it["id"] as? String }.toSet()
      for ((id, program) in existing) {
        if (id !in wanted) resolver.delete(TvContractCompat.buildWatchNextProgramUri(program.id), null, null)
      }

      var published = 0
      for (p in programs) {
        val id = p["id"] as? String ?: continue
        val current = existing[id]
        // Removed from the row by the viewer: respect that until it drops out of Continue Watching.
        if (current != null && !current.isBrowsable) continue
        val program = build(p, id)
        if (current != null) helper.updateWatchNextProgram(program, current.id) else helper.publishWatchNextProgram(program)
        published++
      }
      return published
    }

    private fun build(p: Map<String, Any?>, id: String): WatchNextProgram {
      val episode = p["type"] == "episode"
      val builder = WatchNextProgram.Builder()
        .setType(if (episode) TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE else TvContractCompat.WatchNextPrograms.TYPE_MOVIE)
        .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
        .setLastEngagementTimeUtcMillis((p["lastEngagementMs"] as? Number)?.toLong() ?: System.currentTimeMillis())
        .setTitle(p["title"] as? String ?: "")
        .setDescription(p["description"] as? String)
        .setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9)
        .setInternalProviderId(id)
        .setIntentUri(Uri.parse("tvandj://item/$id"))
      (p["imageUrl"] as? String)?.let { builder.setPosterArtUri(Uri.parse(it)) }
      (p["durationMs"] as? Number)?.let { builder.setDurationMillis(it.toInt()) }
      (p["positionMs"] as? Number)?.let { builder.setLastPlaybackPositionMillis(it.toInt()) }
      if (episode) {
        (p["episodeTitle"] as? String)?.let { builder.setEpisodeTitle(it) }
        (p["season"] as? Number)?.let { builder.setSeasonNumber(it.toInt()) }
        (p["episode"] as? Number)?.let { builder.setEpisodeNumber(it.toInt()) }
      }
      return builder.build()
    }
  }
}
