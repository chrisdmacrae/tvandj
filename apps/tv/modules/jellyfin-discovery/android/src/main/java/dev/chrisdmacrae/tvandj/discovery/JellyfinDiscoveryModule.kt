package dev.chrisdmacrae.tvandj.discovery

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException

/**
 * Jellyfin's LAN discovery protocol: broadcast "who is JellyfinServer?" to
 * UDP 7359 and every server on the subnet replies with a JSON payload of
 * { Address, Id, Name, EndpointAddress }.
 */
class JellyfinDiscoveryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JellyfinDiscovery")

    AsyncFunction("discover") Coroutine { timeoutMs: Int ->
      withContext(Dispatchers.IO) { discover(timeoutMs) }
    }
  }

  private fun discover(timeoutMs: Int): List<Map<String, String>> {
    val wifi = appContext.reactContext?.applicationContext
      ?.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    val lock = wifi?.createMulticastLock("tv-and-j-discovery")?.apply {
      setReferenceCounted(false)
      acquire()
    }
    val servers = LinkedHashMap<String, Map<String, String>>()

    try {
      DatagramSocket().use { socket ->
        socket.broadcast = true
        val message = MESSAGE.toByteArray()
        for (address in broadcastAddresses()) {
          runCatching { socket.send(DatagramPacket(message, message.size, address, PORT)) }
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

          val json = runCatching { JSONObject(String(packet.data, 0, packet.length)) }.getOrNull()
          val id = json?.optString("Id").orEmpty()
          val address = json?.optString("Address").orEmpty()
          if (id.isEmpty() || address.isEmpty()) continue

          servers[id] = mapOf(
            "id" to id,
            "name" to json!!.optString("Name"),
            "address" to address,
          )
        }
      }
    } finally {
      lock?.release()
    }

    return servers.values.toList()
  }

  /** The global broadcast address plus each interface's subnet broadcast. */
  private fun broadcastAddresses(): Set<InetAddress> {
    val addresses = mutableSetOf(InetAddress.getByName("255.255.255.255"))
    NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
      .filter { it.isUp && !it.isLoopback }
      .forEach { iface -> iface.interfaceAddresses.mapNotNullTo(addresses) { it.broadcast } }
    return addresses
  }

  companion object {
    private const val PORT = 7359
    private const val MESSAGE = "who is JellyfinServer?"
  }
}
