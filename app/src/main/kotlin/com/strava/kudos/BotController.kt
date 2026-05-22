package com.strava.kudos

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import androidx.core.content.ContextCompat

class BotController(
    private val context: Context,
    private val webView: WebView,
    private val settingsRepository: SettingsRepository,
    private val logRepository: LogRepository,
    private val webViewController: WebViewController,
    private val botScriptInjector: BotScriptInjector,
    private val likedActivityRepository: LikedActivityRepository,
    private val clubRotationRepository: ClubRotationRepository,
    private val onKudosGiven: (String) -> Unit,
    private val onClubNameChanged: (String) -> Unit,
    private val mainHandler: Handler = Handler(Looper.getMainLooper()),
    private val wakeHandler: Handler = Handler(Looper.getMainLooper())
) {
    var state: BotState = if (settingsRepository.isBotRunning()) BotState.RUNNING else BotState.STOPPED
        private set

    val isRunning: Boolean
        get() = state == BotState.STARTING || state == BotState.RUNNING || state == BotState.RELOADING

    var pendingRestart: Boolean = false
        private set

    var lastRestartedPath: String = ""
        private set

    private var lastActionTime = 0L
    private var wakeRunnable: Runnable? = null
    private var kotlinStrategy: BotStrategy? = null
    private val domAdapter by lazy { DomAdapter(context, webViewController) }

    fun start(force: Boolean = false): Boolean {
        val now = System.currentTimeMillis()
        if (!force && now - lastActionTime < START_DEBOUNCE_MS) {
            Log.d(TAG, "start: debounce, skipping")
            return false
        }

        lastActionTime = now
        markStarting()

        val settings = settingsRepository.getSettings()
        logRepository.add("startBot: запуск бота, стратегия=${settings.strategy.prefValue}", system = true)
        startStrategyOrInjectLegacy(settings, logPrefix = "startBot")

        lastRestartedPath = webView.url ?: ""
        markRunning()
        startForegroundService()
        startWakeLoop()
        return true
    }

    fun stop() {
        Log.d(TAG, "stop called")
        logRepository.add("stopBot: остановка бота", system = true)
        lastActionTime = 0L
        pendingRestart = false
        kotlinStrategy?.stop()
        kotlinStrategy = null
        markStopped()
        stopForegroundService()
        stopWakeLoop()
    }

    fun restartOrDefer(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastActionTime < RESTART_DEBOUNCE_MS) {
            Log.d(TAG, "restart: debounce, skipping (last restart ${(now - lastActionTime) / 1000}s ago)")
            return false
        }

        lastActionTime = now
        Log.d(TAG, "restart called")

        if (webView.progress < 100) {
            Log.d(TAG, "restart: WebView loading (progress=${webView.progress}), deferring onPageFinished")
            pendingRestart = true
            return false
        }

        injectAfterPageReady()
        return true
    }

    fun consumePendingRestart(): Boolean {
        if (pendingRestart && isRunning) {
            pendingRestart = false
            return true
        }
        return false
    }

    fun injectAfterPageReady(): Boolean {
        if (!isRunning) {
            Log.d(TAG, "injectAfterPageReady: bot not running, skip")
            return false
        }

        val settings = settingsRepository.getSettings()
        val strategy = settings.strategy.prefValue
        lastRestartedPath = webView.url ?: ""

        val delayMs = if (webView.url?.contains("/clubs/") == true) 800L else 300L
        mainHandler.postDelayed({
            startStrategyOrInjectLegacy(settings, logPrefix = "doInjectBot")
            Log.d(TAG, "injectAfterPageReady: bot started after ${delayMs}ms delay strategy=$strategy")
        }, delayMs)

        markRunning()
        startForegroundService()
        startWakeLoop()
        return true
    }

    fun shouldRestartForUrl(url: String?): Boolean {
        if (!isRunning || url == null) return false
        if (!url.contains("strava.com/dashboard") && !url.contains("strava.com/clubs/")) return false

        val currentPath = url.substringBefore("?").substringBefore("#")
        val lastPath = lastRestartedPath.substringBefore("?").substringBefore("#")
        return currentPath != lastPath
    }

    fun rememberInjectedUrl(url: String?) {
        lastRestartedPath = url ?: ""
    }

    fun requestPageReload() {
        pendingRestart = true
        markReloading()
        webViewController.reload()
    }

    fun prepareRestoredRunningState() {
        state = BotState.STOPPED
        pendingRestart = false
        kotlinStrategy?.stop()
        kotlinStrategy = null
        lastActionTime = 0L
        stopWakeLoop()
        Log.d(TAG, "prepared restored running state")
    }

    fun markStarting() {
        state = BotState.STARTING
        logRepository.add("BotController: STARTING", system = true)
        Log.d(TAG, "state=STARTING")
    }

    fun markRunning() {
        state = BotState.RUNNING
        settingsRepository.setBotRunning(true)
        logRepository.add("BotController: RUNNING", system = true)
        Log.d(TAG, "state=RUNNING")
    }

    fun markStopped() {
        state = BotState.STOPPED
        settingsRepository.setBotRunning(false)
        webViewController.stopRuntimeBot()
        logRepository.add("BotController: STOPPED", system = true)
        Log.d(TAG, "state=STOPPED")
    }

    fun markReloading() {
        state = BotState.RELOADING
        logRepository.add("BotController: RELOADING", system = true)
        Log.d(TAG, "state=RELOADING")
    }

    fun markError(message: String) {
        state = BotState.ERROR
        settingsRepository.setBotRunning(false)
        logRepository.add("BotController error: $message", system = true)
        Log.e(TAG, message)
    }

    private fun startStrategyOrInjectLegacy(settings: BotSettings, logPrefix: String) {
        kotlinStrategy?.stop()
        kotlinStrategy = null

        if (settings.kotlinStrategiesEnabled) {
            val engine = StrategyEngine(
                BotContext(
                    webViewController = webViewController,
                    domAdapter = domAdapter,
                    settingsRepository = settingsRepository,
                    likedActivityRepository = likedActivityRepository,
                    logRepository = logRepository,
                    clubRotationRepository = clubRotationRepository,
                    shouldStop = { !isRunning },
                    onKudosGiven = onKudosGiven,
                    onClubNameChanged = onClubNameChanged
                )
            )
            kotlinStrategy = engine.create(settings.strategy)
            kotlinStrategy?.start()
            logRepository.add("$logPrefix: Kotlin strategy started ${settings.strategy.prefValue}", system = true)
            return
        }

        injectNow(settings, logPrefix)
    }

    private fun injectNow(settings: BotSettings, logPrefix: String) {
        try {
            botScriptInjector.inject(settings, logPrefix = logPrefix)
        } catch (e: Exception) {
            markError("$logPrefix: inject failed: ${e.message}")
        }
    }

    private fun startForegroundService() {
        val intent = Intent(context, KudosService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent)
        } else {
            context.startService(intent)
        }
    }

    private fun stopForegroundService() {
        context.stopService(Intent(context, KudosService::class.java))
    }

    private fun startWakeLoop() {
        stopWakeLoop()

        val minMs = settingsRepository.getMinDelayMs().takeIf { it > 0 } ?: 3000
        val maxMs = settingsRepository.getMaxDelayMs().takeIf { it >= minMs } ?: maxOf(minMs, 8000)

        wakeRunnable = object : Runnable {
            override fun run() {
                if (isRunning) {
                    webViewController.evaluate("window.__wakeBot && window.__wakeBot();", null)
                }

                if (isRunning) {
                    val delay = (minMs..maxMs).random().toLong()
                    wakeHandler.postDelayed(this, delay)
                }
            }
        }

        wakeHandler.post(wakeRunnable!!)
        Log.d(TAG, "Bot wake loop started delays $minMs-$maxMs ms")
    }

    private fun stopWakeLoop() {
        wakeRunnable?.let { wakeHandler.removeCallbacks(it) }
        wakeRunnable = null
        Log.d(TAG, "Bot wake loop stopped")
    }

    companion object {
        private const val TAG = "BotController"
        private const val START_DEBOUNCE_MS = 8_000L
        private const val RESTART_DEBOUNCE_MS = 2_000L
    }
}
