package com.strava.kudos

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.CookieManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.drawerlayout.widget.DrawerLayout
import com.google.android.material.navigation.NavigationView
import java.io.BufferedReader
import java.io.InputStreamReader

class MainActivity : AppCompatActivity() {

    private val TAG = "Strakudos"

    private lateinit var webView: WebView
    private lateinit var tvStatus: TextView
    private lateinit var tvStats: TextView
    private val backgroundHandler = Handler(Looper.getMainLooper())
    private var backgroundRunnable: Runnable? = null

    // Handler для периодического пробуждения бота в фоне (обход Chrome throttle)
    private val botWakeHandler = Handler(Looper.getMainLooper())
    private var botWakeRunnable: Runnable? = null
    private lateinit var tvStrategy: TextView
    private lateinit var btnToggle: Button
    private lateinit var touchOverlay: android.view.View
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var navigationView: NavigationView
    private lateinit var btnMenu: android.widget.ImageButton
    private lateinit var btnRefresh: Button

    private var kudosCount = 0
    private var isBotRunning = false
    private var lastBotRestartTime = 0L
    private var pendingBotRestart = false
    private var currentClubName: String = ""
    private var lastRestartedPath: String = ""

    private val serviceStopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.strava.kudos.SERVICE_STOPPED") {
                Log.d(TAG, "Received SERVICE_STOPPED broadcast")
                if (isBotRunning) {
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
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
        val logEntry = "[$timestamp] [СИСТЕМА] $message\n"
        val currentLogs = sharedPref.getString("logs", "") ?: ""
        val newLogs = (logEntry + currentLogs).take(10000)
        with(sharedPref.edit()) {
            putString("logs", newLogs)
            apply()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate called, savedInstanceState=${savedInstanceState != null}")
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

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val savedStrategy = sharedPref.getString("strategy", "smart") ?: "smart"
        kudosCount = sharedPref.getInt("kudos_count", 0)
        isBotRunning = sharedPref.getBoolean("is_bot_running", false)
        Log.d(TAG, "Restored isBotRunning=$isBotRunning")
        tvStats.text = kudosCount.toString()
        updateStrategyText(savedStrategy)

        // Если бот был запущен до уничтожения Activity - восстанавливаем UI
        if (isBotRunning) {
            btnToggle.text = "СТОП"
            btnToggle.setBackgroundResource(R.drawable.btn_secondary_bg)
            btnToggle.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
            tvStatus.text = "РАБОТАЕТ"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
            btnRefresh.isEnabled = false
            btnRefresh.alpha = 0.4f
        }

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.javaScriptCanOpenWindowsAutomatically = true
        // Отключаем кэш чтобы всегда загружать свежий bot.js
        settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE

        // Аппаратное ускорение для WebView
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)

        settings.userAgentString = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Очищаем кэш при запуске
        webView.clearCache(true)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "onPageFinished: url=$url, isBotRunning=$isBotRunning, pendingBotRestart=$pendingBotRestart")

                // Сохраняем текущий URL для восстановления после пересоздания Activity
                if (url != null) {
                    with(sharedPref.edit()) {
                        putString("last_url", url)
                        apply()
                    }
                }

                // Если бот ждёт перезапуска после загрузки страницы — внедряем сейчас
                if (pendingBotRestart && isBotRunning) {
                    Log.d(TAG, "onPageFinished: injecting deferred bot.js")
                    pendingBotRestart = false
                    doInjectBot()
                }

                // Рестарт бота если URL path существенно изменился (навигация бота на новую страницу)
                val currentPath = url?.substringBefore("?")?.substringBefore("#") ?: ""
                val lastPath = lastRestartedPath.substringBefore("?").substringBefore("#")
                if (isBotRunning && currentPath != lastPath && url != null &&
                    (url.contains("strava.com/dashboard") || url.contains("strava.com/clubs/"))) {
                    Log.d(TAG, "onPageFinished: URL path changed from '$lastPath' to '$currentPath', restarting bot")
                saveSystemLog("onPageFinished: смена страницы на $currentPath, рестарт бота")
                    lastRestartedPath = url
                    restartBot()
                }

                if (url != null && (url.contains("strava.com/dashboard") || url.contains("strava.com/clubs/"))) {
                    tvStatus.text = if (isBotRunning) "РАБОТАЕТ" else "ВХОД ВЫПОЛНЕН (ГОТОВ)"
                    tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
                    btnToggle.isEnabled = true
                    btnToggle.alpha = 1.0f
                } else {
                    tvStatus.text = "ОЖИДАНИЕ ВХОДА"
                    tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
                    if (!isBotRunning) {
                        btnToggle.isEnabled = false
                        btnToggle.alpha = 0.4f
                    }
                }
            }
        }

        webView.addJavascriptInterface(BotJavascriptInterface(), "AndroidApp")

        // Если Activity пересоздана системой (смена ориентации, нехватка памяти и т.д.),
        // WebView восстановит свое состояние сама через restoreState в onRestoreInstanceState.
        // В этом случае НЕ загружаем URL заново.
        // Если это первый запуск — загружаем сохраненный URL или страницу входа.
        if (savedInstanceState == null) {
            val savedUrl = sharedPref.getString("last_url", null)
            if (savedUrl != null && savedUrl.contains("strava.com")) {
                webView.loadUrl(savedUrl)
            } else {
                webView.loadUrl("https://www.strava.com/login")
            }
        }
        // Если savedInstanceState != null, WebView восстановит состояние сама

        btnToggle.setOnClickListener {
            if (isBotRunning) {
                stopBot()
            } else {
                startBot()
            }
        }

        btnRefresh.setOnClickListener {
            webView.reload()
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

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val strategy = sharedPref.getString("strategy", "smart") ?: "smart"
        updateStrategyText(strategy)

        // Если бот был запущен и Activity была уничтожена/пересоздана — рестартуем
        // НО только если URL существенно изменился (бот перешёл на новую страницу в фоне)
        if (isBotRunning) {
            val currentUrl = webView.url
            val currentPath = currentUrl?.substringBefore("?")?.substringBefore("#") ?: ""
            val lastPath = lastRestartedPath.substringBefore("?").substringBefore("#")
            Log.d(TAG, "onResume: bot was running, currentPath=$currentPath, lastRestartedPath=$lastPath")
            if (currentPath != lastPath && currentUrl != null &&
                (currentUrl.contains("strava.com/dashboard") || currentUrl.contains("strava.com/clubs/"))) {
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

        // Регистрируем receiver для остановки из уведомления
        registerReceiver(serviceStopReceiver, IntentFilter("com.strava.kudos.SERVICE_STOPPED"),
            Context.RECEIVER_NOT_EXPORTED)

        // Регистрируем receiver для пинга WebView из сервиса
        registerReceiver(webViewPingReceiver, IntentFilter("com.strava.kudos.PING_WEBVIEW"),
            Context.RECEIVER_NOT_EXPORTED)
    }

    override fun onPause() {
        super.onPause()
        Log.d(TAG, "onPause called, isBotRunning=$isBotRunning")
        // НЕ вызываем webView.onPause() — это ЗАМОРАЖИВАЕТ JavaScript!
        // Даже если бот не работает — не замораживаем WebView
        // Chrome в фоне сам замедляет timers, но не полностью останавляет
        if (isBotRunning) {
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

    override fun onBackPressed() {
        Log.d(TAG, "onBackPressed called, moveTaskToBack")
        // Сворачиваем приложение вместо уничтожения Activity
        moveTaskToBack(true)
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

    private fun startBot() {
        val now = System.currentTimeMillis()
        if (now - lastBotRestartTime < 8000) {
            Log.d(TAG, "startBot: debounce, skipping")
            return
        }
        lastBotRestartTime = now
        Log.d(TAG, "startBot called, isBotRunning=$isBotRunning")
        Log.d(TAG, "startBot called")
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val strategy = sharedPref.getString("strategy", "smart") ?: "smart"
        saveSystemLog("startBot: запуск бота, стратегия=$strategy")
        val minMs = sharedPref.getInt("min_delay", 5000)
        val maxMs = sharedPref.getInt("max_delay", 12000)

        // Очищаем кэш WebView чтобы загрузить свежий bot.js
        webView.clearCache(true)
        webView.settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE

        // Встраиваем параметры напрямую в скрипт (надежнее чем window-переменные)
        var botScript = readAssetFile("bot.js")
        Log.d(TAG, "startBot: bot.js length=${botScript.length}")
        if (botScript.isNotEmpty()) {
            val clubsSpeed = sharedPref.getString("clubs_speed", "medium") ?: "medium"
            val consecutiveLimit = sharedPref.getInt("consecutive_liked_limit", 10)
            val useApiV3 = sharedPref.getBoolean("use_api_v3", false)
            botScript = botScript.replace("const STRATEGY = window.kudosStrategy || 'smart';", "const STRATEGY = '$strategy';")
            Log.d(TAG, "startBot: injecting vars strategy=$strategy, useApiV3=$useApiV3")
            webView.evaluateJavascript("window.kudosBotRunning = false; window.kudosBotShouldStop = false; window.kudosMinDelay = $minMs; window.kudosMaxDelay = $maxMs; window.clubsSpeed = '$clubsSpeed'; window.consecutiveLikedLimit = $consecutiveLimit; window.useApiV3 = ${useApiV3};", null)
            Log.d(TAG, "startBot: injecting botScript length=${botScript.length}")
            webView.evaluateJavascript(botScript, null)
            Log.d(TAG, "startBot: injected, checking...")
            webView.evaluateJavascript("console.log('[Android] bot running=' + typeof startLoop);", null)
            isBotRunning = true
            lastRestartedPath = webView.url ?: ""
            with(sharedPref.edit()) {
                putBoolean("is_bot_running", true)
                apply()
            }
            btnToggle.text = "СТОП"
            btnToggle.setBackgroundResource(R.drawable.btn_secondary_bg)
            btnToggle.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
            touchOverlay.visibility = android.view.View.VISIBLE
            tvStatus.text = "РАБОТАЕТ"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
            btnRefresh.isEnabled = false
            btnRefresh.alpha = 0.4f

            // Держим экран включенным чтобы WebView не засыпал
            webView.setKeepScreenOn(true)
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

            // Запускаем Foreground Service для работы в фоне
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                androidx.core.content.ContextCompat.startForegroundService(this, Intent(this, KudosService::class.java))
            } else {
                startService(Intent(this, KudosService::class.java))
            }

            // Запускаем wake loop чтобы бот работал в фоне (Chrome троттлит setTimeout)
            startBotWakeLoop()
        }
    }

    private fun stopBot() {
        Log.d(TAG, "stopBot called")
        saveSystemLog("stopBot: остановка бота")
        webView.evaluateJavascript("window.kudosBotShouldStop = true; window.kudosBotRunning = false;", null)
        lastBotRestartTime = 0L
        isBotRunning = false
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        with(sharedPref.edit()) {
            putBoolean("is_bot_running", false)
            apply()
        }
        btnToggle.text = "СТАРТ"
        btnToggle.setBackgroundResource(R.drawable.btn_primary_bg)
        btnToggle.setTextColor(android.graphics.Color.parseColor("#000000"))
        touchOverlay.visibility = android.view.View.GONE
        tvStatus.text = "ОСТАНОВЛЕН"
        tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
        btnRefresh.isEnabled = true
        btnRefresh.alpha = 1.0f

        // Снимаем keep screen on
        webView.setKeepScreenOn(false)
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Останавливаем сервис
        stopService(Intent(this, KudosService::class.java))

        // Останавливаем wake loop
        stopBotWakeLoop()
    }

    private fun startBotWakeLoop() {
        stopBotWakeLoop() // на всякий случай
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val minMs = sharedPref.getInt("min_delay", 3000)
        val maxMs = sharedPref.getInt("max_delay", 8000)

        botWakeRunnable = object : Runnable {
            override fun run() {
                if (isBotRunning && ::webView.isInitialized) {
                    // Будим бота в фоне — Chrome замораживает setTimeout,
                    // поэтому Android сам триггерит следующий шаг через evaluateJavascript
                    webView.evaluateJavascript("window.__wakeBot && window.__wakeBot();", null)
                }
                if (isBotRunning) {
                    val delay = (minMs..maxMs).random().toLong()
                    botWakeHandler.postDelayed(this, delay)
                }
            }
        }
        botWakeHandler.post(botWakeRunnable!!)
        Log.d(TAG, "Bot wake loop started with delays $minMs-$maxMs ms")
    }

    private fun stopBotWakeLoop() {
        botWakeRunnable?.let { botWakeHandler.removeCallbacks(it) }
        botWakeRunnable = null
        Log.d(TAG, "Bot wake loop stopped")
    }

    private fun restartBot() {
        val now = System.currentTimeMillis()
        if (now - lastBotRestartTime < 2000) {
            Log.d(TAG, "restartBot: debounce, skipping (last restart was ${(now - lastBotRestartTime)/1000}s ago)")
            return
        }
        lastBotRestartTime = now
        Log.d(TAG, "restartBot called")

        // Если WebView ещё грузит страницу — откладываем инъекцию до onPageFinished
        if (webView.progress < 100) {
            Log.d(TAG, "restartBot: WebView still loading (progress=${webView.progress}), deferring to onPageFinished")
            pendingBotRestart = true
            return
        }

        doInjectBot()
    }

    private fun doInjectBot() {
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val minMs = sharedPref.getInt("min_delay", 5000)
        val maxMs = sharedPref.getInt("max_delay", 12000)
        val strategy = sharedPref.getString("strategy", "smart") ?: "smart"

        // Запоминаем URL на котором внедряем бота — чтобы onPageFinished не рестартовал повторно
        lastRestartedPath = webView.url ?: ""

        // Очищаем кэш WebView чтобы загрузить свежий bot.js
        webView.clearCache(true)
        webView.settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE

        // Для страниц клуба даем React время отрендерить DOM
        val delayMs = if (webView.url?.contains("/clubs/") == true) 800L else 300L

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            // Встраиваем параметры напрямую в скрипт (надежнее чем window-переменные)
            var botScript = readAssetFile("bot.js")
            if (botScript.isNotEmpty()) {
                botScript = botScript.replace("const STRATEGY = window.kudosStrategy || 'smart';", "const STRATEGY = '$strategy';")
                val clubsSpeed = sharedPref.getString("clubs_speed", "medium") ?: "medium"
                val consecutiveLimit = sharedPref.getInt("consecutive_liked_limit", 10)
                val useApiV3 = sharedPref.getBoolean("use_api_v3", false)
                webView.evaluateJavascript("window.kudosBotRunning = false; window.kudosBotShouldStop = false; window.kudosMinDelay = $minMs; window.kudosMaxDelay = $maxMs; window.clubsSpeed = '$clubsSpeed'; window.consecutiveLikedLimit = $consecutiveLimit; window.useApiV3 = ${useApiV3};", null)
                webView.evaluateJavascript(botScript, null)
                Log.d(TAG, "doInjectBot: bot.js injected after ${delayMs}ms delay with strategy=$strategy")
            }
        }, delayMs)

        // Восстанавливаем UI и запускаем сервис (на случай если Activity была пересоздана)
        touchOverlay.visibility = android.view.View.VISIBLE
        tvStatus.text = "РАБОТАЕТ"
        tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
        btnToggle.text = "СТОП"
        btnToggle.setBackgroundResource(R.drawable.btn_secondary_bg)
        btnToggle.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
        btnRefresh.isEnabled = false
        btnRefresh.alpha = 0.4f

        // Перезапускаем Foreground Service если он не запущен
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            androidx.core.content.ContextCompat.startForegroundService(this, Intent(this, KudosService::class.java))
        } else {
            startService(Intent(this, KudosService::class.java))
        }

        // Запускаем wake loop чтобы бот работал в фоне (Chrome троттлит setTimeout)
        startBotWakeLoop()
    }

    private fun readAssetFile(fileName: String): String {
        return try {
            val inputStream = assets.open(fileName)
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
            e.printStackTrace()
            ""
        }
    }

    private fun resetLikedData() {
        Log.d(TAG, "resetLikedData: clearing liked activities from WebView localStorage")
        // 1. Останавливаем бота если работает (чтобы не сохранил данные обратно)
        if (isBotRunning) {
            webView.evaluateJavascript("window.kudosBotShouldStop = true;", null)
        }
        // 2. Очищаем через JS (если страница Strava загружена)
        webView.evaluateJavascript("""
            try {
                localStorage.removeItem('strakudos_liked');
                localStorage.removeItem('sk_visited');
                localStorage.removeItem('sk_clubs');
                localStorage.removeItem('sk_index');
                if (window.likedActivities) { window.likedActivities = new Set(); }
                window.kudosBotRunning = false;
                console.log('[KudosBot] Liked data reset complete');
            } catch(e) {
                console.log('[KudosBot] Reset error: ' + e.message);
            }
        """.trimIndent(), null)
        // 3. Перезагружаем страницу чтобы бот стартовал с чистого состояния
        webView.reload()
        // Сбрасываем счётчик в SharedPreferences
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        with(sharedPref.edit()) {
            putInt("kudos_count", 0)
            putBoolean("is_bot_running", false)
            apply()
        }
        isBotRunning = false
        kudosCount = 0
        tvStats.text = "0"
        btnToggle.text = "СТАРТ"
        btnToggle.setBackgroundResource(R.drawable.btn_primary_bg)
        btnToggle.setTextColor(android.graphics.Color.parseColor("#000000"))
        btnRefresh.isEnabled = true
        btnRefresh.alpha = 1.0f
        touchOverlay.visibility = android.view.View.GONE
        tvStatus.text = "СБРОШЕН"
        tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
        Toast.makeText(this, "Список лайков и клубная история сброшены", Toast.LENGTH_SHORT).show()
        saveSystemLog("Сброс списка лайков и клубной истории")
    }

    private fun runApiTest(activityId: String) {
        Toast.makeText(this, "Запускаю API тест...", Toast.LENGTH_SHORT).show()
        saveSystemLog("Запуск API теста для активности $activityId")
        Log.d(TAG, "runApiTest: activityId=$activityId")

        // Собираем результаты тестов
        val testResults = mutableListOf<String>()

        // Простой тест 1: API v3 PUT
        val jsTest1 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('PUT', 'https://www.strava.com/api/v3/activities/$activityId/kudos', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 1 (API v3 PUT): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 1 (API v3 PUT): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 1 (API v3 PUT): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 1 (API v3 PUT): ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 1 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 1: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 1: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 2: API v3 PUT + Api-Key
        val jsTest2 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('PUT', 'https://www.strava.com/api/v3/activities/$activityId/kudos', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('Api-Key', '0aeb41212aef4bddb762dd34c45e941f');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 2 (API v3 + Api-Key): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 2 (API v3 + Api-Key): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 2 (API v3 + Api-Key): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 2 (API v3 + Api-Key): ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 2 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 2: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 2: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 3: Web POST endpoint
        val jsTest3 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/activities/$activityId/kudos', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 3 (Web POST): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 3 (Web POST): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 3 (Web POST): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 3 (Web POST): ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 3 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 3: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 3: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 4: DOM click
        val jsTest4 = """
            (function() {
                try {
                    var btns = document.querySelectorAll('[data-testid="kudos_button"], [data-testid="un-kudos_button"]');
                    if (btns.length > 0) {
                        var btn = btns[0];
                        var rect = btn.getBoundingClientRect();
                        var x = rect.left + rect.width/2;
                        var y = rect.top + rect.height/2;
                        ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(t) {
                            var ev = new MouseEvent(t, {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y});
                            btn.dispatchEvent(ev);
                        });
                        AndroidApp.log('Тест 4 (DOM Click): Клик выполнен на кнопке лайка');
                        AndroidApp.onApiTestResult('Тест 4 (DOM Click): Клик выполнен');
                    } else {
                        AndroidApp.log('Тест 4 (DOM Click): Кнопки лайка не найдены');
                        AndroidApp.onApiTestResult('Тест 4 (DOM Click): Кнопки не найдены');
                    }
                    return 'Тест 4 выполнен';
                } catch(e) {
                    AndroidApp.log('Тест 4: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 4: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 5: GraphQL mutation toggleKudo
        val jsTest5 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/graphql', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 5 (GraphQL toggleKudo): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 150));
                        AndroidApp.onApiTestResult('Тест 5 (GraphQL toggleKudo): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 5 (GraphQL toggleKudo): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 5 (GraphQL): ОШИБКА сети');
                    };
                    xhr.send(JSON.stringify({
                        operationName: 'ToggleKudo',
                        variables: {activityId: '$activityId'},
                        query: 'mutation ToggleKudo($activityId: ID!) { toggleKudo(activityId: $activityId) { id hasKudoed kudosCount } }'
                    }));
                    return 'Тест 5 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 5: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 5: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 6: GraphQL mutation kudosCreate
        val jsTest6 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/graphql', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 6 (GraphQL kudosCreate): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 150));
                        AndroidApp.onApiTestResult('Тест 6 (GraphQL kudosCreate): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 6 (GraphQL kudosCreate): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 6 (GraphQL): ОШИБКА сети');
                    };
                    xhr.send(JSON.stringify({
                        operationName: 'KudosCreate',
                        variables: {activityId: '$activityId'},
                        query: 'mutation KudosCreate($activityId: ID!) { kudosCreate(input: {activityId: $activityId}) { id hasKudoed kudosCount } }'
                    }));
                    return 'Тест 6 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 6: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 6: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 7: Проверка cookies и CSRF
        val jsTest7 = """
            (function() {
                try {
                    var cookies = document.cookie.split(';');
                    var logMsg = 'Тест 7 (Cookies): Найдено ' + cookies.length + ' cookies. ';
                    var csrf = null;
                    var token = null;
                    cookies.forEach(function(c) {
                        var parts = c.trim().split('=');
                        var name = parts[0];
                        var val = parts[1] ? parts[1].substring(0, 30) : '';
                        if (name.indexOf('csrf') !== -1 || name.indexOf('_token') !== -1) {
                            csrf = val;
                            logMsg += name + '=' + val + '; ';
                        }
                        if (name === 'strava_remember_token') {
                            token = val;
                            logMsg += 'token найден; ';
                        }
                    });

                    // Ищем CSRF в meta tags
                    var meta = document.querySelector('meta[name="csrf-token"]');
                    if (meta) {
                        logMsg += 'CSRF meta=' + meta.content.substring(0, 20) + '; ';
                    }

                    // Ищем в HTML
                    var html = document.documentElement.innerHTML;
                    var m = html.match(/csrf[_-]token[\"\']?\s*[:=]\s*[\"\']([^\"\']+)/);
                    if (m) {
                        logMsg += 'CSRF в HTML=' + m[1].substring(0, 20) + '; ';
                    }

                    AndroidApp.log(logMsg);
                    AndroidApp.onApiTestResult('Тест 7 (Cookies): ' + (csrf ? 'CSRF найден' : 'CSRF не найден'));
                    return 'Тест 7 выполнен';
                } catch(e) {
                    AndroidApp.log('Тест 7: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 8: GET /api/v3/activities/{id} (проверка доступности API)
        val jsTest8 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', 'https://www.strava.com/api/v3/activities/$activityId', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 8 (API v3 GET): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 8 (API v3 GET): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 8 (API v3 GET): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 8 (API v3 GET): ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 8 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 8: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 8: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 9: POST /activity/{id}/kudo (без 's')
        val jsTest9 = """
            (function() {
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/activity/$activityId/kudo', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 9 (/activity/kudo): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 9 (/activity/kudo): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 9 (/activity/kudo): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 9 (/activity/kudo): ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 9 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 9: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 9: Исключение - ' + e.message);
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 10: POST с CSRF token из meta tag
        val jsTest10 = """
            (function() {
                try {
                    var csrf = null;
                    var meta = document.querySelector('meta[name="csrf-token"]');
                    if (meta) csrf = meta.content;

                    if (!csrf) {
                        AndroidApp.log('Тест 10 (CSRF POST): CSRF token не найден');
                        AndroidApp.onApiTestResult('Тест 10: CSRF не найден');
                        return 'CSRF не найден';
                    }

                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/activities/$activityId/kudos', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('X-CSRF-Token', csrf);
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 10 (CSRF POST activities/kudos): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 10 (CSRF POST): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 10 (CSRF POST): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 10: ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 10 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 10: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 10: Исключение');
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 11: POST с CSRF token и X-Requested-With
        val jsTest11 = """
            (function() {
                try {
                    var csrf = null;
                    var meta = document.querySelector('meta[name="csrf-token"]');
                    if (meta) csrf = meta.content;

                    if (!csrf) {
                        AndroidApp.log('Тест 11 (CSRF+XRW): CSRF token не найден');
                        AndroidApp.onApiTestResult('Тест 11: CSRF не найден');
                        return 'CSRF не найден';
                    }

                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/activities/$activityId/kudos', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('X-CSRF-Token', csrf);
                    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 11 (CSRF+XRW POST): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 11 (CSRF+XRW): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 11 (CSRF+XRW): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 11: ОШИБКА сети');
                    };
                    xhr.send();
                    return 'Тест 11 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 11: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 11: Исключение');
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // Тест 12: POST /kudos с CSRF
        val jsTest12 = """
            (function() {
                try {
                    var csrf = null;
                    var meta = document.querySelector('meta[name="csrf-token"]');
                    if (meta) csrf = meta.content;

                    if (!csrf) {
                        AndroidApp.log('Тест 12 (/kudos POST): CSRF token не найден');
                        AndroidApp.onApiTestResult('Тест 12: CSRF не найден');
                        return 'CSRF не найден';
                    }

                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://www.strava.com/kudos', true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('X-CSRF-Token', csrf);
                    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        AndroidApp.log('Тест 12 (/kudos POST): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                        AndroidApp.onApiTestResult('Тест 12 (/kudos): HTTP ' + xhr.status);
                    };
                    xhr.onerror = function() {
                        AndroidApp.log('Тест 12 (/kudos POST): ОШИБКА сети');
                        AndroidApp.onApiTestResult('Тест 12: ОШИБКА сети');
                    };
                    xhr.send('activity_id=$activityId');
                    return 'Тест 12 отправлен';
                } catch(e) {
                    AndroidApp.log('Тест 12: Исключение - ' + e.message);
                    AndroidApp.onApiTestResult('Тест 12: Исключение');
                    return 'Ошибка: ' + e.message;
                }
            })();
        """

        // ТЕСТ 13: Перехват реальных AJAX запросов через DOM click!
        val jsTest13 = """
            (function() {
                AndroidApp.log('=== ТЕСТ 13: Перехват network requests ===');

                // Сохраняем оригинальные функции
                var origOpen = XMLHttpRequest.prototype.open;
                var origSend = XMLHttpRequest.prototype.send;
                var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
                var origFetch = window.fetch;

                var capturedRequests = [];

                // Перехватываем XHR
                XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                    this._capturedMethod = method;
                    this._capturedUrl = url;
                    this._capturedHeaders = {};
                    return origOpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
                    if (this._capturedHeaders) {
                        this._capturedHeaders[header] = value;
                    }
                    return origSetHeader.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function(body) {
                    var self = this;
                    var logMsg = 'CAPTURED XHR: ' + this._capturedMethod + ' ' + this._capturedUrl;
                    if (body) logMsg += ' | body=' + body.toString().substring(0, 100);
                    logMsg += ' | headers=' + JSON.stringify(this._capturedHeaders).substring(0, 200);
                    AndroidApp.log(logMsg);
                    capturedRequests.push({type:'xhr', method:this._capturedMethod, url:this._capturedUrl});

                    // Перехватываем onload
                    var origOnload = this.onload;
                    this.onload = function() {
                        AndroidApp.log('CAPTURED XHR RESPONSE: HTTP ' + self.status + ' | ' + self.responseText.substring(0, 200));
                        if (origOnload) origOnload.apply(self, arguments);
                    };

                    return origSend.apply(this, arguments);
                };

                // Перехватываем fetch
                window.fetch = function(url, options) {
                    var method = (options && options.method) || 'GET';
                    var logMsg = 'CAPTURED FETCH: ' + method + ' ' + url;
                    if (options && options.body) logMsg += ' | body=' + options.body.toString().substring(0, 100);
                    AndroidApp.log(logMsg);
                    capturedRequests.push({type:'fetch', method:method, url:url.toString()});
                    return origFetch.apply(this, arguments);
                };

                AndroidApp.log('Network interceptor установлен. Ищу кнопку лайка...');

                // Теперь кликаем на кнопку лайка
                var btns = document.querySelectorAll('[data-testid="kudos_button"], [data-testid="un-kudos_button"]');
                if (btns.length > 0) {
                    var btn = btns[0];
                    AndroidApp.log('Найдено ' + btns.length + ' кнопок. Кликаю на первую...');
                    var rect = btn.getBoundingClientRect();
                    var x = rect.left + rect.width/2;
                    var y = rect.top + rect.height/2;

                    // Клик с задержками чтобы перехватить все запросы
                    setTimeout(function() {
                        btn.dispatchEvent(new MouseEvent('pointerdown', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
                    }, 100);
                    setTimeout(function() {
                        btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
                    }, 150);
                    setTimeout(function() {
                        btn.dispatchEvent(new MouseEvent('pointerup', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
                    }, 200);
                    setTimeout(function() {
                        btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
                    }, 250);
                    setTimeout(function() {
                        btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
                    }, 300);

                    // Ждем 2 секунды и смотрим результаты
                    setTimeout(function() {
                        AndroidApp.log('=== Захвачено ' + capturedRequests.length + ' запросов ===');
                        capturedRequests.forEach(function(req, i) {
                            AndroidApp.log('  [' + i + '] ' + req.type + ': ' + req.method + ' ' + req.url);
                        });

                        // Восстанавливаем оригинальные функции
                        XMLHttpRequest.prototype.open = origOpen;
                        XMLHttpRequest.prototype.send = origSend;
                        XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
                        window.fetch = origFetch;

                        if (capturedRequests.length === 0) {
                            AndroidApp.log('Тест 13: НИ ОДИН запрос не захвачен! Возможно Strava использует другой механизм (React synthetic events, custom fetch, Service Worker, WebSocket)');
                            AndroidApp.onApiTestResult('Тест 13: 0 запросов захвачено');
                        } else {
                            AndroidApp.onApiTestResult('Тест 13: Захвачено ' + capturedRequests.length + ' запросов');
                        }
                    }, 2000);

                    return 'Тест 13: Перехватчик установлен, клик выполнен';
                } else {
                    AndroidApp.log('Тест 13: Кнопки лайка не найдены на странице');
                    AndroidApp.onApiTestResult('Тест 13: Кнопки не найдены');

                    // Восстанавливаем оригинальные функции
                    XMLHttpRequest.prototype.open = origOpen;
                    XMLHttpRequest.prototype.send = origSend;
                    XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
                    window.fetch = origFetch;

                    return 'Тест 13: Кнопки не найдены';
                }
            })();
        """

        // Запускаем все тесты
        webView.evaluateJavascript(jsTest1) { result -> Log.d(TAG, "API Test 1: $result") }

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest2) { result -> Log.d(TAG, "API Test 2: $result") }
        }, 2000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest3) { result -> Log.d(TAG, "API Test 3: $result") }
        }, 4000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest4) { result -> Log.d(TAG, "API Test 4: $result") }
        }, 6000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest5) { result -> Log.d(TAG, "API Test 5: $result") }
        }, 8000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest6) { result -> Log.d(TAG, "API Test 6: $result") }
        }, 10000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest7) { result -> Log.d(TAG, "API Test 7: $result") }
        }, 12000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest8) { result -> Log.d(TAG, "API Test 8: $result") }
        }, 14000)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(jsTest13) { result -> Log.d(TAG, "API Test 13: $result") }
        }, 16000)

        // Показываем результаты через 20 секунд
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            runOnUiThread {
                val logs = getSharedPreferences("strakudos_prefs", MODE_PRIVATE).getString("logs", "")
                val apiResults = logs?.lines()?.filter { it.contains("Тест") || it.contains("CAPTURED") || it.contains("захвачено") }?.takeLast(20)?.joinToString("\n") ?: "Нет результатов"

                AlertDialog.Builder(this)
                    .setTitle("Результаты API теста")
                    .setMessage(apiResults + "\n\nПолные логи в меню → Логи → СКОПИРОВАТЬ")
                    .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
                    .setNeutralButton("Открыть Логи") { _, _ ->
                        startActivity(Intent(this, LogsActivity::class.java))
                    }
                    .show()
            }
        }, 20000)
    }

    inner class BotJavascriptInterface {
        @JavascriptInterface
        fun log(message: String) {
            val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
            val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
            val logEntry = "[$timestamp] $message\n"
            val currentLogs = sharedPref.getString("logs", "") ?: ""
            val newLogs = (logEntry + currentLogs).take(10000) // Лимит 10KB
            with(sharedPref.edit()) {
                putString("logs", newLogs)
                apply()
            }
        }

        @JavascriptInterface
        fun onKudosGiven(athleteName: String) {
            runOnUiThread {
                kudosCount++
        tvStats.text = kudosCount.toString()
                val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
                with(sharedPref.edit()) {
                    putInt("kudos_count", kudosCount)
                    apply()
                }
            }
        }

        @JavascriptInterface
        fun setClubName(clubName: String) {
            runOnUiThread {
                currentClubName = clubName
                Log.d(TAG, "Club name updated: $clubName")
                // Обновляем отображение стратегии с именем клуба
                val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
                val strategy = sharedPref.getString("strategy", "smart") ?: "smart"
                updateStrategyText(strategy, clubName)
            }
        }

        @JavascriptInterface
        fun onApiTestResult(result: String) {
            Log.d(TAG, "API Test Result: $result")
            // Результат уже сохранен в логи через AndroidApp.log()
        }
    }
}
