package dev.chrisdmacrae.tvandj.discovery

import android.app.SearchManager
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.BaseColumns
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Answers Android TV's system search with titles from the Jellyfin library of
 * whoever last watched on this TV. Results open the title in the app
 * (tvandj://item/<id>, see res/xml/searchable.xml). Knows the server from
 * [AndroidTvHomeModule.setSearchConfig]; with none, it finds nothing.
 */
class SearchProvider : ContentProvider() {
  companion object {
    const val PREFS = "tvandj.search"
    const val BASE_URL = "baseUrl"
    const val TOKEN = "token"
    const val USER_ID = "userId"
    private const val LIMIT = 15
    private const val TIMEOUT_MS = 4000

    private val COLUMNS = arrayOf(
      BaseColumns._ID,
      SearchManager.SUGGEST_COLUMN_TEXT_1,
      SearchManager.SUGGEST_COLUMN_TEXT_2,
      SearchManager.SUGGEST_COLUMN_RESULT_CARD_IMAGE,
      SearchManager.SUGGEST_COLUMN_CONTENT_TYPE,
      SearchManager.SUGGEST_COLUMN_IS_LIVE,
      SearchManager.SUGGEST_COLUMN_PRODUCTION_YEAR,
      SearchManager.SUGGEST_COLUMN_DURATION,
      SearchManager.SUGGEST_COLUMN_INTENT_DATA_ID,
    )
  }

  override fun onCreate() = true

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
    val cursor = MatrixCursor(COLUMNS)
    val query = (selectionArgs?.firstOrNull() ?: uri.lastPathSegment)?.trim()
    if (query.isNullOrEmpty() || query == SearchManager.SUGGEST_URI_PATH_QUERY) return cursor

    val prefs = context?.getSharedPreferences(PREFS, Context.MODE_PRIVATE) ?: return cursor
    val base = prefs.getString(BASE_URL, null) ?: return cursor
    val token = prefs.getString(TOKEN, null) ?: return cursor
    val userId = prefs.getString(USER_ID, null) ?: return cursor

    try {
      val url = URL(
        "$base/Items?userId=$userId&searchTerm=${URLEncoder.encode(query, "UTF-8")}" +
          "&IncludeItemTypes=Movie,Series&Recursive=true&Limit=$LIMIT&Fields=ProductionYear&ApiKey=$token",
      )
      val connection = (url.openConnection() as HttpURLConnection).apply {
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
      }
      val body = connection.inputStream.bufferedReader().use { it.readText() }
      val items = JSONObject(body).optJSONArray("Items") ?: return cursor
      for (i in 0 until items.length()) {
        val item = items.getJSONObject(i)
        val id = item.optString("Id")
        if (id.isEmpty()) continue
        val year = item.optInt("ProductionYear", 0)
        val ticks = item.optLong("RunTimeTicks", 0)
        cursor.addRow(
          arrayOf<Any?>(
            i,
            item.optString("Name"),
            if (item.optString("Type") == "Series") "Show${if (year > 0) " · $year" else ""}" else if (year > 0) "$year" else null,
            "$base/Items/$id/Images/Primary?maxWidth=300",
            "video/*",
            0,
            if (year > 0) year else null,
            if (ticks > 0) ticks / 10_000 else null,
            id,
          ),
        )
      }
    } catch (e: Exception) {
      // Server unreachable or signed out: no results rather than an error in the system UI.
    }
    return cursor
  }

  override fun getType(uri: Uri): String = SearchManager.SUGGEST_MIME_TYPE
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
