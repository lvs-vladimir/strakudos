package com.strava.kudos

import android.content.Context
import android.util.Log
import android.webkit.WebSettings
import android.webkit.WebView
import java.io.BufferedReader
import java.io.InputStreamReader

class BotScriptInjector(
    private val context: Context,
    private val webView: WebView,
    private val logRepository: LogRepository
) {
    fun inject(settings: BotSettings, logPrefix: String = "inject") {
        webView.clearCache(true)
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE

        var botScript = readAssetFile("old_bot_backup.js").ifBlank { readAssetFile("bot.js") }
        Log.d(TAG, "$logPrefix: legacy script length=${botScript.length}")
        if (botScript.isEmpty()) {
            logRepository.add("$logPrefix: legacy bot script пустой", system = true)
            return
        }

        botScript = botScript.replace(
            "const STRATEGY = window.kudosStrategy || 'smart';",
            "const STRATEGY = '${settings.strategy.prefValue}';"
        )

        val clubsSpeed = settings.clubsSpeed.prefValue
        val consecutiveLimit = settings.consecutiveLikedLimit
        val useApiV3 = settings.useApiV3
        val minMs = settings.minDelayMs
        val maxMs = settings.maxDelayMs

        val varsScript = """
            window.kudosBotRunning = false;
            window.kudosBotShouldStop = false;
            window.kudosMinDelay = $minMs;
            window.kudosMaxDelay = $maxMs;
            window.clubsSpeed = '$clubsSpeed';
            window.consecutiveLikedLimit = $consecutiveLimit;
            window.useApiV3 = $useApiV3;
            if (!window.__StrakudosAndroidApp && window.AndroidApp) window.__StrakudosAndroidApp = window.AndroidApp;
            if (window.LegacyAndroidApp) window.AndroidApp = window.LegacyAndroidApp;
        """.trimIndent()

        Log.d(TAG, "$logPrefix: injecting legacy strategy=${settings.strategy.prefValue}, useApiV3=$useApiV3")
        webView.evaluateJavascript(varsScript, null)
        webView.evaluateJavascript(botScript, null)
        webView.evaluateJavascript("console.log('[Android] legacy bot injected, strategy=${settings.strategy.prefValue}');", null)
        logRepository.add("$logPrefix: legacy bot injected strategy=${settings.strategy.prefValue}", system = true)
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
            logRepository.add("Ошибка чтения $fileName: ${e.message}", system = true)
            ""
        }
    }

    companion object {
        private const val TAG = "BotScriptInjector"
    }
}
