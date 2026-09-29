package dev.chrisdmacrae.tvandj.discovery

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException

/**
 * LAN service discovery by UDP broadcast: send a question to a port on every
 * subnet and collect whatever answers within the timeout. Jellyfin listens on
 * 7359 for "who is JellyfinServer?"; downloadarr on 7360 for "who is Downloadarr?".
 * Parsing the replies is left to JS so new services need no native changes.
 */
class JellyfinDiscoveryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JellyfinDiscovery")

    AsyncFunction("broadcast") Coroutine { message: String, port: Int, timeoutMs: Int ->
      withContext(Dispatchers.IO) { broadcast(message, port, timeoutMs) }
    }
  }

  /** Each reply as { payload, address }, where address is the responder's IP. */
  private fun broadcast(message: String, port: Int, timeoutMs: Int): List<Map<String, String>> {
    val wifi = appContext.reactContext?.applicationContext
      ?.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    // Some Wi-Fi drivers drop broadcast replies unless a multicast lock is held.
    val lock = wifi?.createMulticastLock("tv-and-j-discovery")?.apply {
      setReferenceCounted(false)
      acquire()
    }
    val replies = mutableListOf<Map<String, String>>()

    try {
      DatagramSocket().use { socket ->
        socket.broadcast = true
        val bytes = message.toByteArray()
        for (address in broadcastAddresses()) {
          runCatching { socket.send(DatagramPacket(bytes, bytes.size, address, port)) }
        }

        val deadline = System.currentTimeMillis() + timeoutMs
        val buffer = ByteArray(4096)
        while (true) {
          val remaining = deadline - System.currentTimeMillis()
          if (remaining <= 0) break
          socket.soTimeout = remaining.toInt()

          val packet = DatagramPacket(buffer, buffer.size)
          try {
            socket.receive(packet)
          } catch (e: SocketTimeoutException) {
            break
          }
          replies += mapOf(
            "payload" to String(packet.data, 0, packet.length),
            "address" to (packet.address?.hostAddress ?: ""),
          )
        }
      }
    } finally {
      lock?.release()
    }

    return replies
  }

  /** The global broadcast address plus each interface's subnet broadcast. */
  private fun broadcastAddresses(): Set<InetAddress> {
    val addresses = mutableSetOf(InetAddress.getByName("255.255.255.255"))
    NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
      .filter { it.isUp && !it.isLoopback }
      .forEach { iface -> iface.interfaceAddresses.mapNotNullTo(addresses) { it.broadcast } }
    return addresses
  }
}
