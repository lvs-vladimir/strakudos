package com.strava.kudos

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.drawerlayout.widget.DrawerLayout
import com.google.android.material.navigation.NavigationView

class MainActivity : AppCompatActivity() {

    private val TAG = "Strakudos"

    private lateinit var webView: WebView
    private lateinit var tvStatus: TextView
    private lateinit var tvStats: TextView
    private lateinit var tvStrategy: TextView
    private lateinit var btnToggle: Button
    private lateinit var touchOverlay: android.view.View
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var navigationView: NavigationView
    private lateinit var btnMenu: android.widget.ImageButton
    private lateinit var btnRefresh: Button

    private var kudosCount = 0
    private var currentClubName: String = ""
    private var pendingStartAfterPageLoad = false

    private lateinit var settingsRepository: SettingsRepository
    private lateinit var logRepository: LogRepository
    private lateinit var likedActivityRepository: LikedActivityRepository
    private lateinit var clubRotationRepository: ClubRotationRepository
    private lateinit var webViewController: WebViewController
    private lateinit var botController: BotController
    private lateinit var botScriptInjector: BotScriptInjector

    private val serviceStopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.strava.kudos.SERVICE_STOPPED") {
                Log.d(TAG, "Received SERVICE_STOPPED broadcast")
                if (botController.isRunning) {
                    stopBot()
                }
            }
        }
    }

    // Пинг от Service чтобы WebView не засыпал в фоне
    private val webViewPingReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.strava.kudos.PING_WEBVIEW") {
                // Будим WebView таймеры чтобы Chrome не троттлил setTimeout
                if (::webView.isInitialized) {
                    webView.resumeTimers()
                    // Но-оп JavaScript чтобы поддерживать JS execution context
                    webView.evaluateJavascript("if(window.__ping)window.__ping++;", null)
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun saveSystemLog(message: String) {
        if (::logRepository.isInitialized) {
            logRepository.add(message, system = true)
        } else {
            Log.d(TAG, "[SYSTEM] $message")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate called, savedInstanceState=${savedInstanceState != null}")
        settingsRepository = SettingsRepository(this)
        logRepository = LogRepository(this)
        likedActivityRepository = LikedActivityRepository(this)
        clubRotationRepository = ClubRotationRepository(this)
        saveSystemLog("onCreate: приложение запущено")
        setContentView(R.layout.activity_main)

        // Запрашиваем разрешение на уведомления для Android 13+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 100)
            }
        }

        webView = findViewById(R.id.webView)
        tvStatus = findViewById(R.id.tvStatus)
        tvStats = findViewById(R.id.tvStats)
        tvStrategy = findViewById(R.id.tvStrategy)
        btnToggle = findViewById(R.id.btnToggle)
        touchOverlay = findViewById(R.id.touchOverlay)
        drawerLayout = findViewById(R.id.drawerLayout)
        navigationView = findViewById(R.id.navigationView)
        btnMenu = findViewById(R.id.btnMenu)
        btnRefresh = findViewById(R.id.btnRefresh)
        webViewController = WebViewController(this, webView, settingsRepository, logRepository)
        botScriptInjector = BotScriptInjector(this, webView, logRepository)
        botController = BotController(
            context = this,
            webView = webView,
            settingsRepository = settingsRepository,
            logRepository = logRepository,
            webViewController = webViewController,
            botScriptInjector = botScriptInjector,
            likedActivityRepository = likedActivityRepository,
            clubRotationRepository = clubRotationRepository,
            onKudosGiven = { athleteName -> onKudosGivenFromKotlin(athleteName) },
            onClubNameChanged = { clubName -> onClubNameChangedFromKotlin(clubName) }
        )

        val savedStrategy = settingsRepository.getStrategyValue()
        kudosCount = settingsRepository.getKudosCount()
        Log.d(TAG, "Restored botState=${botController.state}")
        tvStats.text = kudosCount.toString()
        updateStrategyText(savedStrategy)
        updateBotUi(botController.isRunning)

        webViewController.configureDefaultSettings()

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "onPageFinished: url=$url, botState=${botController.state}, pendingBotRestart=${botController.pendingRestart}")

                // Сохраняем текущий URL для восстановления после пересоздания Activity
                webViewController.saveLastUrl(url)

                // Если бот был запущен до перезапуска Activity/Android, стартуем после загрузки Strava.
                if (pendingStartAfterPageLoad && (url?.contains("strava.com/dashboard") == true || url?.contains("strava.com/clubs/") == true)) {
                    pendingStartAfterPageLoad = false
                    Log.d(TAG, "onPageFinished: pending autostart/restored bot start")
                    saveSystemLog("onPageFinished: восстановление запущенного бота")
                    startBot(force = true)
                }

                // Если бот ждёт перезапуска после загрузки страницы внедряем сейчас
                if (botController.consumePendingRestart()) {
                    Log.d(TAG, "onPageFinished: injecting deferred bot.js")
                    botController.injectAfterPageReady()
                }

                // Рестарт бота если URL path существенно изменился (навигация бота новую страницу)
                if (botController.shouldRestartForUrl(url)) {
                    val currentPath = url?.substringBefore("?")?.substringBefore("#")
                    Log.d(TAG, "onPageFinished: URL path changed to '$currentPath', restarting bot")
                    saveSystemLog("onPageFinished: смена страницы $currentPath, рестарт бота")
                    botController.rememberInjectedUrl(url)
                    restartBot()
                }

                updatePageLoginUi(url)


            }
        }

        webView.addJavascriptInterface(createBotJsBridge(), "AndroidApp")
        webView.addJavascriptInterface(createLegacyBotJsBridge(), "LegacyAndroidApp")
        webView.addJavascriptInterface(createApiTestJsBridge(), "ApiTestAndroidApp")

        val shouldResumeBot = settingsRepository.isBotRunning()
        pendingStartAfterPageLoad = shouldResumeBot
        if (shouldResumeBot) {
            botController.prepareRestoredRunningState()
            saveSystemLog("onCreate: бот был запущен ранее, ожидаю загрузку Strava")
        }


        // Если Activity пересоздана системой (смена ориентации, нехватка памяти и т.д.),
        // WebView восстановит свое состояние сама через restoreState в onRestoreInstanceState.
        // В этом случае НЕ загружаем URL заново.
        // Если это первый запуск — загружаем сохраненный URL или страницу входа.
        if (savedInstanceState == null) {
            webViewController.loadInitialStravaPage()
        }
        // Если savedInstanceState != null, WebView восстановит состояние сама

        btnToggle.setOnClickListener {
            if (botController.isRunning) {
                stopBot()
            } else {
                startBot()
            }
        }

        btnRefresh.setOnClickListener {
            webViewController.reload()
            Toast.makeText(this, "Страница обновлена", Toast.LENGTH_SHORT).show()
        }

        btnMenu.setOnClickListener {
            drawerLayout.openDrawer(androidx.core.view.GravityCompat.START)
        }

        navigationView.setNavigationItemSelectedListener { menuItem ->
            drawerLayout.closeDrawers()
            when (menuItem.itemId) {
                R.id.nav_strategy -> {
                    startActivity(Intent(this, StrategyActivity::class.java))
                    // Обновим текст стратегии при возврате
                }
                R.id.nav_settings -> startActivity(Intent(this, SettingsActivity::class.java))
                R.id.nav_logs -> startActivity(Intent(this, LogsActivity::class.java))
                R.id.nav_about -> startActivity(Intent(this, AboutActivity::class.java))
            }
            true
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        Log.d(TAG, "onNewIntent called")
        if (intent != null) {
            setIntent(intent)
            // Если пришел intent с тестом API — запускаем сразу
            if (intent.getBooleanExtra("run_api_test", false)) {
                val activityId = intent.getStringExtra("test_activity_id") ?: ""
                Log.d(TAG, "onNewIntent: API test requested for activity $activityId")
                if (webView.url?.contains("strava.com") == true) {
                    runApiTest(activityId)
                } else {
                    Toast.makeText(this, "Сначала залогинься в Strava!", Toast.LENGTH_LONG).show()
                }
            }
            // Сброс списка лайкнутых
            if (intent.getBooleanExtra("reset_liked_data", false)) {
                Log.d(TAG, "onNewIntent: reset liked data requested")
                resetLikedData()
                intent.removeExtra("reset_liked_data")
            }
        }
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume called")
        // НЕ вызываем webView.onResume() — WebView не был в onPause()
        // Останавливаем фоновый wake (мы снова на переднем плане)
        stopBackgroundWebViewWake()

        val strategy = settingsRepository.getStrategyValue()
        updateStrategyText(strategy)

        // Если бот был запущен и Activity была уничтожена/пересоздана — рестартуем
        // только если URL существенно изменился (бот перешёл на новую страницу в фоне)
        if (botController.isRunning) {
            val currentUrl = webView.url
            Log.d(TAG, "onResume: bot running, currentUrl=$currentUrl, lastRestartedPath=${botController.lastRestartedPath}")
            if (botController.shouldRestartForUrl(currentUrl)) {
                Log.d(TAG, "onResume: URL path changed, restarting bot")
                restartBot()
            } else {
                Log.d(TAG, "onResume: same page, NOT restarting bot (bot state preserved)")
            }
        }

        // Проверяем, нужно ли запустить тест API (для случая когда Activity создается заново)
        if (intent.getBooleanExtra("run_api_test", false)) {
            val activityId = intent.getStringExtra("test_activity_id") ?: ""
            Log.d(TAG, "onResume: API test requested for activity $activityId")
            if (webView.url?.contains("strava.com") == true) {
                runApiTest(activityId)
            } else {
                Toast.makeText(this, "Сначала залогинься в Strava!", Toast.LENGTH_LONG).show()
            }
        }

        // Сброс списка лайкнутых (для случая когда Activity создается заново)
        if (intent.getBooleanExtra("reset_liked_data", false)) {
            Log.d(TAG, "onResume: reset liked data requested")
            resetLikedData()
            intent.removeExtra("reset_liked_data")
        }

        // Регистрируем receiver для остановки уведомления
        ContextCompat.registerReceiver(
            this,
            serviceStopReceiver,
            IntentFilter("com.strava.kudos.SERVICE_STOPPED"),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        // Регистрируем receiver для пинга WebView сервиса
        ContextCompat.registerReceiver(
            this,
            webViewPingReceiver,
            IntentFilter("com.strava.kudos.PING_WEBVIEW"),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    override fun onPause() {
        super.onPause()
        Log.d(TAG, "onPause called, botState=${botController.state}")
        // НЕ вызываем webView.onPause() — это ЗАМОРАЖИВАЕТ JavaScript!
        // Даже если бот не работает — не замораживаем WebView
        // Chrome в фоне сам замедляет timers, но не полностью останавляет
        if (botController.isRunning) {
            Log.d(TAG, "onPause: bot running, NOT pausing WebView")
        }
    }

    override fun onStop() {
        super.onStop()
        Log.d(TAG, "onStop called")
        // НЕ вызываем webView.onPause() здесь!
    }

    // Background wake больше не нужен — мы не вызываем webView.onPause()
    private fun startBackgroundWebViewWake() {
        Log.d(TAG, "Background wake: not needed (no webView.onPause)")
    }

    private fun stopBackgroundWebViewWake() {
        Log.d(TAG, "Background wake: nothing to stop")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy called")
        try {
            unregisterReceiver(serviceStopReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver may not be registered
        }
        try {
            unregisterReceiver(webViewPingReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver may not be registered
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        Log.d(TAG, "onSaveInstanceState called")
        // Сохраняем URL на случай если система уничтожит Activity
        outState.putString("last_url", webView.url)
        // НЕ сохраняем состояние WebView — это может вызывать проблемы в фоне
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        Log.d(TAG, "onRestoreInstanceState called")
        // Восстанавливаем состояние WebView
        webView.restoreState(savedInstanceState)
    }

    @Suppress("MissingSuperCall")
    override fun onBackPressed() {
        Log.d(TAG, "onBackPressed called, moveTaskToBack")
        // Сворачиваем приложение вместо уничтожения Activity
        moveTaskToBack(true)
    }

    private fun onKudosGivenFromKotlin(athleteName: String) {
        kudosCount = settingsRepository.getKudosCount() + 1
        settingsRepository.setKudosCount(kudosCount)
        tvStats.text = kudosCount.toString()
        Log.d(TAG, "Kotlin strategy kudos: $athleteName count=$kudosCount")
    }

    private fun onClubNameChangedFromKotlin(clubName: String) {
        currentClubName = clubName
        Log.d(TAG, "Kotlin strategy club name: $clubName")
        updateStrategyText(settingsRepository.getStrategyValue(), clubName)
    }

    private fun createBotJsBridge(): BotJsBridge {
        return BotJsBridge(logRepository = logRepository)
    }

    private fun createLegacyBotJsBridge(): LegacyBotJsBridge {
        return LegacyBotJsBridge(
            logRepository = logRepository,
            settingsRepository = settingsRepository,
            botController = botController,
            callbacks = object : LegacyBotJsBridge.Callbacks {
                override fun onKudosCountChanged(kudosCount: Int) {
                    this@MainActivity.kudosCount = kudosCount
                    tvStats.text = kudosCount.toString()
                }

                override fun onClubNameChanged(clubName: String) {
                    currentClubName = clubName
                    val strategy = settingsRepository.getStrategyValue()
                    updateStrategyText(strategy, clubName)
                }

                override fun onPageReloadRequested() {
                    updateBotUi(true)
                }

                override fun runOnUiThread(action: () -> Unit) {
                    this@MainActivity.runOnUiThread(action)
                }
            }
        )
    }

    private fun createApiTestJsBridge(): ApiTestJsBridge {
        return ApiTestJsBridge(logRepository = logRepository)
    }

    private fun updateStrategyText(strategy: String, clubName: String = currentClubName) {
        val strategyName = when (strategy) {
            "smart" -> "УМНАЯ"
            "top_only" -> "ТОЛЬКО НОВЫЕ"
            "aggressive" -> "АГРЕССИВНАЯ"
            "human" -> "ЧЕЛОВЕЧНАЯ"
            "clubs" -> if (clubName.isNotEmpty()) "КЛУБЫ ($clubName)" else "КЛУБЫ"
            else -> "УМНАЯ"
        }
        tvStrategy.text = strategyName
    }

    private fun updateBotUi(running: Boolean, stoppedLabel: String = "ОСТАНОВЛЕН") {
        if (running) {
            btnToggle.text = "СТОП"
            btnToggle.setBackgroundResource(R.drawable.btn_secondary_bg)
            btnToggle.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
            touchOverlay.visibility = android.view.View.VISIBLE
            tvStatus.text = "РАБОТАЕТ"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
            btnRefresh.isEnabled = false
            btnRefresh.alpha = 0.4f
            webView.setKeepScreenOn(true)
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            btnToggle.text = "СТАРТ"
            btnToggle.setBackgroundResource(R.drawable.btn_primary_bg)
            btnToggle.setTextColor(android.graphics.Color.parseColor("#000000"))
            touchOverlay.visibility = android.view.View.GONE
            tvStatus.text = stoppedLabel
            tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
            btnRefresh.isEnabled = true
            btnRefresh.alpha = 1.0f
            webView.setKeepScreenOn(false)
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private fun updatePageLoginUi(url: String?) {
        if (url != null && (url.contains("strava.com/dashboard") || url.contains("strava.com/clubs/"))) {
            if (botController.isRunning) {
                updateBotUi(true)
            } else {
                tvStatus.text = "ВХОД ВЫПОЛНЕН (ГОТОВ)"
                tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
                btnToggle.isEnabled = true
                btnToggle.alpha = 1.0f
            }
        } else {
            tvStatus.text = "ОЖИДАНИЕ ВХОДА"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
            if (!botController.isRunning) {
                btnToggle.isEnabled = false
                btnToggle.alpha = 0.4f
            }
        }
    }

    private fun startBot(force: Boolean = false) {
        Log.d(TAG, "startBot called, botState=${botController.state}, force=$force")
        if (botController.start(force = force)) {
            updateBotUi(true)
        }
    }

    private fun stopBot() {
        botController.stop()
        updateBotUi(false)
    }

    private fun restartBot() {
        if (botController.restartOrDefer()) {
            updateBotUi(true)
        }
    }

    private fun doInjectBot() {
        if (botController.injectAfterPageReady()) {
            updateBotUi(true)
        }
    }

    private fun resetLikedData() {
        Log.d(TAG, "resetLikedData: clearing liked activities WebView localStorage")

        if (botController.isRunning) {
            botController.stop()
        } else {
            webViewController.stopRuntimeBot()
        }

        webViewController.evaluate("""
            try {
                localStorage.removeItem('strakudos_liked');
                localStorage.removeItem('sk_visited');
                localStorage.removeItem('sk_clubs');
                localStorage.removeItem('sk_index');
                if (window.likedActivities) window.likedActivities = new Set();
                window.kudosBotRunning = false;
                window.kudosBotShouldStop = false;
                console.log('[KudosBot] Liked data reset complete');
            } catch(e) {
                console.log('[KudosBot] Reset error:', e.message);
            }
        """.trimIndent(), null)

        settingsRepository.resetKudosCount()
        likedActivityRepository.reset()
        clubRotationRepository.reset()
        kudosCount = 0
        tvStats.text = "0"
        updateBotUi(false, stoppedLabel = "СБРОШЕН")
        webViewController.reload()
        Toast.makeText(this, "Список лайков клубная история сброшены", Toast.LENGTH_SHORT).show()
        saveSystemLog("Сброс списка лайков клубной истории")
    }
    private fun runApiTest(activityId: String) {
        ApiTestRunner(this, webView, logRepository).run(activityId)
    }
}
