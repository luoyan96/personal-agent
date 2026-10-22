package expo.modules.acceptcattransport

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import okhttp3.Call
import okhttp3.Callback
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Isolated HTTP: no RN/browser cookie jar, redirects, cache, body logging or disk state. */
class AcceptCatTransportModule : Module() {
  private val calls = ConcurrentHashMap<String, Call>()
  private val client = OkHttpClient.Builder()
    .cookieJar(CookieJar.NO_COOKIES)
    .followRedirects(false).followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .callTimeout(30, TimeUnit.SECONDS)
    .build()

  override fun definition() = ModuleDefinition {
    Name("AcceptCatTransport")
    AsyncFunction("request") { input: Map<String, Any?>, promise: Promise ->
      try {
        val id = input["id"] as String
        val url = (input["url"] as String).toHttpUrl()
        require(url.isHttps && url.username.isEmpty() && url.password.isEmpty() && url.encodedPath.startsWith("/api/v1/"))
        val method = input["method"] as String
        require(method == "GET" || method == "POST" || method == "PATCH")
        val builder = Request.Builder().url(url)
        @Suppress("UNCHECKED_CAST")
        val headers = input["headers"] as Map<String, String>
        require(headers["Origin"] == "${url.scheme}://${url.host}" + (if (url.port == 443) "" else ":${url.port}"))
        headers.forEach { (name, value) -> builder.header(name, value) }
        val body = if (method == "GET") null else ((input["body"] as? String) ?: "{}").toRequestBody("application/json; charset=utf-8".toMediaType())
        val call = client.newCall(builder.method(method, body).build())
        require(calls.putIfAbsent(id, call) == null)
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, e: IOException) {
            calls.remove(id, call)
            promise.reject("NETWORK_ERROR", "Network request did not complete", null)
          }
          override fun onResponse(call: Call, response: Response) {
            try {
              response.use {
                val source = it.body?.source()
                val limit = 8L * 1024 * 1024
                if (source != null && source.request(limit + 1)) throw IOException("Response limit")
                val text = source?.readUtf8() ?: ""
                promise.resolve(mapOf("status" to it.code, "body" to text, "cookies" to it.headers.values("Set-Cookie")))
              }
            } catch (_: Exception) { promise.reject("NETWORK_ERROR", "Network response did not complete", null) }
            finally { calls.remove(id, call) }
          }
        })
      } catch (_: Exception) { promise.reject("REQUEST_ERROR", "Invalid network request", null) }
    }
    AsyncFunction("cancel") { id: String -> calls.remove(id)?.cancel(); Unit }
    OnDestroy { calls.values.forEach { it.cancel() }; calls.clear() }
  }
}
