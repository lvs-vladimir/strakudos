package com.strava.kudos

import android.util.Log
import android.webkit.JavascriptInterface

class ApiTestJsBridge(
    private val logRepository: LogRepository
) {
    @JavascriptInterface
    fun log(message: String) {
        logRepository.add(message)
        Log.d(TAG, message)
    }

    @JavascriptInterface
    fun onApiTestResult(result: String) {
        logRepository.add(result, system = true)
        Log.d(TAG, "API Test Result: $result")
    }

    companion object {
        private const val TAG = "ApiTestJsBridge"
    }
}
