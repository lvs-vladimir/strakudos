package com.strava.kudos

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView

class WebViewController(
    private val context: Context,
    private val webView: WebView,
    private val settingsRepository: SettingsRepository,
    private val logRepository: LogRepository
) {
    fun configureDefaultSettings() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        settings.userAgentString = DESKTOP_MOBILE_USER_AGENT

        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.clearCache(true)
    }

    fun loadInitialStravaPage() {
        val savedUrl = settingsRepository.getLastUrl()
        if (savedUrl != null && savedUrl.contains("strava.com")) {
            webView.loadUrl(savedUrl)
        } else {
            webView.loadUrl("https://www.strava.com/login")
        }
    }

    fun saveLastUrl(url: String?) {
        if (url != null) settingsRepository.setLastUrl(url)
    }

    fun evaluate(script: String, callback: ((String?) -> Unit)? = null) {
        try {
            webView.evaluateJavascript(script) { result -> callback?.invoke(result) }
        } catch (e: Exception) {
            Log.e(TAG, "evaluateJavascript failed", e)
            logRepository.add("JS evaluate error: ${e.message}", system = true)
            callback?.invoke(null)
        }
    }

    fun reload() {
        webView.scrollTo(0, 0)
        webView.reload()
    }

    fun isOnStravaFeed(): Boolean {
        val url = webView.url ?: return false
        return url.contains("strava.com/dashboard") || url.contains("strava.com/clubs/")
    }

    fun scrollToTop() {
        webView.scrollTo(0, 0)
        evaluate("window.scrollTo({ top: 0, behavior: 'auto' });", null)
    }

    fun clearBotState() {
        clearRuntimeBotFlags()
    }

    fun clearRuntimeBotFlags() {
        evaluate("window.kudosBotRunning = false; window.kudosBotShouldStop = false;", null)
    }

    fun stopRuntimeBot() {
        evaluate("window.kudosBotShouldStop = true; window.kudosBotRunning = false;", null)
    }

    companion object {
        private const val TAG = "WebViewController"
        private const val DESKTOP_MOBILE_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 10; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}
