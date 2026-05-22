package com.strava.kudos

import android.util.Log
import android.webkit.JavascriptInterface

class BotJsBridge(
    private val logRepository: LogRepository
) {
    @JavascriptInterface
    fun log(message: String) {
        logRepository.add(message)
    }

    @JavascriptInterface
    fun reportError(error: String) {
        logRepository.add("JS error: $error", system = true)
        Log.e(TAG, "JS error: $error")
    }

    companion object {
        private const val TAG = "BotJsBridge"
    }
}
