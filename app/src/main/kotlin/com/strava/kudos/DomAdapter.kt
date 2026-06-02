package com.strava.kudos

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader

class DomAdapter(
    private val context: Context,
    private val webViewController: WebViewController
) {
    fun inject(callback: ((Boolean) -> Unit)? = null) {
        val adapterScript = readAssetFile("dom_adapter.js")
        if (adapterScript.isBlank()) {
            callback?.invoke(false)
            return
        }

        val athleteId = readStravaAthleteId()
        Log.d(TAG, "inject: readStravaAthleteId returned $athleteId")
        val injectAthleteId = if (athleteId != null) {
            "window.__stravaAthleteId = '$athleteId';"
        } else {
            "window.__stravaAthleteId = null;"
        }

        webViewController.evaluate("if(window.__StrakudosAndroidApp) window.AndroidApp = window.__StrakudosAndroidApp;", null)
        webViewController.evaluate(injectAthleteId, null)
        webViewController.evaluate(adapterScript)
        webViewController.evaluate("Boolean(window.StrakudosDom && window.StrakudosDom.version >= 6);") { raw ->
            callback?.invoke(raw == "true")
        }
    }

    fun getProfileAthleteId(callback: (String?) -> Unit) {
        webViewController.evaluate(
            """(function(){try{var e=document.querySelector('a[href*="/athletes/"]');if(!e)return null;var m=(e.getAttribute('href')||e.href||'').match(/\/athletes\/(\d+)/);return m?m[1]:null}catch(e){return null}})()""".trimIndent()
        ) { raw ->
            val result = raw?.unquoteJsResult()
            if (result.isNullOrBlank() || result == "null") {
                webViewController.evaluate(
                    """(function(){try{var l=document.querySelectorAll('a[href*="/athletes/"]');if(!l.length)return null;var c={},b=null,t=0;for(var i=0;i<l.length;i++){var m=(l[i].getAttribute('href')||'').match(/\/athletes\/(\d+)/);if(m){c[m[1]]=(c[m[1]]||0)+1;if(c[m[1]]>t){t=c[m[1]];b=m[1]}}}return b}catch(e){return null}})()""".trimIndent()
                ) { raw2 ->
                    val result2 = raw2?.unquoteJsResult()
                    callback(if (result2.isNullOrBlank() || result2 == "null") null else result2)
                }
            } else {
                callback(result)
            }
        }
    }

    private fun readStravaAthleteId(): String? {
        val cookie = CookieManager.getInstance().getCookie("https://www.strava.com") ?: return null
        val match = Regex("""strava_remember_id=(\d+)""").find(cookie)
        if (match != null) return match.groupValues[1]
        val tokenMatch = Regex("""strava_remember_token=[^;]+_(\d+)""").find(cookie)
        return tokenMatch?.groupValues?.get(1)
    }

    fun scanVisibleCards(callback: (FeedScanResult?) -> Unit) {
        evaluateJson("window.StrakudosDom && window.StrakudosDom.scanVisibleCards ? window.StrakudosDom.scanVisibleCards() : null") { raw ->
            callback(parseScanResult(raw))
        }
    }

    fun scanAllCards(callback: (FeedScanResult?) -> Unit) {
        evaluateJson("window.StrakudosDom && window.StrakudosDom.scanAllCards ? window.StrakudosDom.scanAllCards() : null") { raw ->
            callback(parseScanResult(raw))
        }
    }

    fun getPageInfo(callback: (PageInfo?) -> Unit) {
        evaluateJson("window.StrakudosDom && window.StrakudosDom.getPageInfo ? window.StrakudosDom.getPageInfo() : null") { raw ->
            callback(parsePageInfo(raw))
        }
    }

    fun getClubLinks(callback: (List<ClubLink>) -> Unit) {
        evaluateJson("window.StrakudosDom && window.StrakudosDom.getClubLinks ? window.StrakudosDom.getClubLinks() : []") { raw ->
            callback(parseClubLinks(raw))
        }
    }

    fun clickKudos(activityId: String, callback: (Boolean) -> Unit) {
        val safeId = activityId.escapeJsSingleQuoted()
        webViewController.evaluate(
            "window.StrakudosDom && window.StrakudosDom.clickKudos ? window.StrakudosDom.clickKudos('$safeId') : false;"
        ) { raw -> callback(raw == "true") }
    }

    fun scrollBy(px: Int, callback: ((Int?) -> Unit)? = null) {
        webViewController.evaluate(
            "window.StrakudosDom && window.StrakudosDom.scrollBy ? window.StrakudosDom.scrollBy($px) : window.scrollY;"
        ) { raw -> callback?.invoke(raw?.toIntOrNull()) }
    }

    fun scrollToTop(callback: ((Boolean) -> Unit)? = null) {
        webViewController.evaluate(
            "window.StrakudosDom && window.StrakudosDom.scrollToTop ? window.StrakudosDom.scrollToTop() : false;"
        ) { raw -> callback?.invoke(raw == "true") }
    }

    fun reloadPage(callback: ((Boolean) -> Unit)? = null) {
        webViewController.evaluate(
            "window.StrakudosDom && window.StrakudosDom.reloadPage ? window.StrakudosDom.reloadPage() : (window.location.reload(), true);"
        ) { raw -> callback?.invoke(raw == "true") }
    }

    fun goToUrl(url: String, callback: ((Boolean) -> Unit)? = null) {
        val safeUrl = url.escapeJsSingleQuoted()
        webViewController.evaluate(
            "window.StrakudosDom && window.StrakudosDom.goToUrl ? window.StrakudosDom.goToUrl('$safeUrl') : false;"
        ) { raw -> callback?.invoke(raw == "true") }
    }

    fun openClubActivityTab(callback: ((Boolean) -> Unit)? = null) {
        webViewController.evaluate(
            "window.StrakudosDom && window.StrakudosDom.openClubActivityTab ? window.StrakudosDom.openClubActivityTab() : false;"
        ) { raw -> callback?.invoke(raw == "true") }
    }

    private fun evaluateJson(expression: String, callback: (String?) -> Unit) {
        webViewController.evaluate("JSON.stringify($expression);") { raw ->
            callback(raw?.unquoteJsResult())
        }
    }

    private fun parseScanResult(raw: String?): FeedScanResult? {
        if (raw.isNullOrBlank() || raw == "null") return null
        return try {
            val root = JSONObject(raw)
            val cardsJson = root.optJSONArray("cards")
            val cards = mutableListOf<FeedCard>()
            if (cardsJson != null) {
                for (i in 0 until cardsJson.length()) {
                    val item = cardsJson.getJSONObject(i)
                    cards.add(
                        FeedCard(
                            activityId = item.optString("activityId").ifBlank { null },
                            ownerId = item.optString("ownerId").ifBlank { null },
                            athleteName = item.optString("athleteName"),
                            activityTitle = item.optString("activityTitle", ""),
                            hasKudosButton = item.optBoolean("hasKudosButton"),
                            isLiked = item.optBoolean("isLiked"),
                            isOwn = item.optBoolean("isOwn"),
                            isRecent = item.optBoolean("isRecent", true),
                            top = item.optInt("top"),
                            bottom = item.optInt("bottom")
                        )
                    )
                }
            }

            FeedScanResult(
                cards = cards,
                scrollY = root.optInt("scrollY"),
                scrollHeight = root.optInt("scrollHeight"),
                innerHeight = root.optInt("innerHeight"),
                isEnd = root.optBoolean("isEnd"),
                url = root.optString("url")
            )
        } catch (e: Exception) {
            Log.e(TAG, "parseScanResult failed", e)
            null
        }
    }

    private fun parsePageInfo(raw: String?): PageInfo? {
        if (raw.isNullOrBlank() || raw == "null") return null
        return try {
            val root = JSONObject(raw)
            PageInfo(
                url = root.optString("url"),
                path = root.optString("path"),
                scrollY = root.optInt("scrollY"),
                scrollHeight = root.optInt("scrollHeight"),
                innerHeight = root.optInt("innerHeight"),
                isEnd = root.optBoolean("isEnd")
            )
        } catch (e: Exception) {
            Log.e(TAG, "parsePageInfo failed", e)
            null
        }
    }

    private fun parseClubLinks(raw: String?): List<ClubLink> {
        if (raw.isNullOrBlank() || raw == "null") return emptyList()
        return try {
            val json = JSONArray(raw)
            buildList {
                for (i in 0 until json.length()) {
                    val item = json.getJSONObject(i)
                    val url = item.optString("url")
                    if (url.isNotBlank()) {
                        add(ClubLink(url = url, name = item.optString("name", url)))
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "parseClubLinks failed", e)
            emptyList()
        }
    }

    private fun readAssetFile(fileName: String): String {
        return try {
            val inputStream = context.assets.open(fileName)
            val reader = BufferedReader(InputStreamReader(inputStream))
            val sb = StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line).append("\n")
            }
            reader.close()
            inputStream.close()
            sb.toString()
        } catch (e: Exception) {
            Log.e(TAG, "readAssetFile failed: $fileName", e)
            ""
        }
    }

    private fun String.unquoteJsResult(): String {
        if (!startsWith('"') || !endsWith('"')) return this
        return substring(1, length - 1)
            .replace("\\\\", "\\")
            .replace("\\\"", "\"")
            .replace("\\n", "\n")
            .replace("\\t", "\t")
    }

    private fun String.escapeJsSingleQuoted(): String {
        return replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
    }

    companion object {
        private const val TAG = "DomAdapter"
    }
}
