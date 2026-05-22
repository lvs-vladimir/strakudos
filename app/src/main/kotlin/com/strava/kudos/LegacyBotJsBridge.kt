package com.strava.kudos

import android.util.Log
import android.webkit.JavascriptInterface

class LegacyBotJsBridge(
    private val logRepository: LogRepository,
    private val settingsRepository: SettingsRepository,
    private val botController: BotController,
    private val callbacks: Callbacks
) {
    interface Callbacks {
        fun onKudosCountChanged(kudosCount: Int)
        fun onClubNameChanged(clubName: String)
        fun onPageReloadRequested()
        fun runOnUiThread(action: () -> Unit)
    }

    @JavascriptInterface
    fun log(message: String) {
        logRepository.add(message)
    }

    @JavascriptInterface
    fun onKudosGiven(athleteName: String) {
        callbacks.runOnUiThread {
            val newCount = settingsRepository.getKudosCount() + 1
            settingsRepository.setKudosCount(newCount)
            callbacks.onKudosCountChanged(newCount)
            Log.d(TAG, "Kudos given by legacy bot: $athleteName, count=$newCount")
        }
    }

    @JavascriptInterface
    fun setClubName(clubName: String) {
        callbacks.runOnUiThread {
            Log.d(TAG, "Legacy club name updated: $clubName")
            callbacks.onClubNameChanged(clubName)
        }
    }

    @JavascriptInterface
    fun reloadPage() {
        callbacks.runOnUiThread {
            Log.d(TAG, "Legacy bot requested page reload")
            logRepository.add("Legacy bot requested page reload", system = true)
            botController.requestPageReload()
            callbacks.onPageReloadRequested()
        }
    }

    companion object {
        private const val TAG = "LegacyBotJsBridge"
    }
}
