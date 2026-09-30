package dev.chrisdmacrae.tvandj.discovery

import android.app.Activity
import android.app.SearchManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * Where the system sends searches for this app: a picked result (VIEW with
 * tvandj://item/<id>) or a plain query (SEARCH). Hands either to the app as a
 * deep link and gets out of the way.
 */
class SearchActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val target: Uri? = when (intent?.action) {
      Intent.ACTION_VIEW -> intent.data
      Intent.ACTION_SEARCH -> intent.getStringExtra(SearchManager.QUERY)?.let {
        Uri.parse("tvandj://search").buildUpon().appendQueryParameter("q", it).build()
      }
      else -> null
    }
    if (target != null) {
      startActivity(Intent(Intent.ACTION_VIEW, target).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    finish()
  }
}
