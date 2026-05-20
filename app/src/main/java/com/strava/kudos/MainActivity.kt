package com.strava.kudos

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.CookieManager
import android.widget.Button
import android.widget.TextView
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
    private lateinit var tvStrategy: TextView
    private lateinit var btnToggle: Button
    private lateinit var touchOverlay: android.view.View
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var navigationView: NavigationView
    private lateinit var btnMenu: android.widget.ImageButton

    private var kudosCount = 0
    private var isBotRunning = false

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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate called, savedInstanceState=${savedInstanceState != null}")
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        tvStatus = findViewById(R.id.tvStatus)
        tvStats = findViewById(R.id.tvStats)
        tvStrategy = findViewById(R.id.tvStrategy)
        btnToggle = findViewById(R.id.btnToggle)
        touchOverlay = findViewById(R.id.touchOverlay)
        drawerLayout = findViewById(R.id.drawerLayout)
        navigationView = findViewById(R.id.navigationView)
        btnMenu = findViewById(R.id.btnMenu)

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
        }

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.javaScriptCanOpenWindowsAutomatically = true
        
        settings.userAgentString = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "onPageFinished: url=$url, isBotRunning=$isBotRunning")
                
                // Сохраняем текущий URL для восстановления после пересоздания Activity
                if (url != null) {
                    with(sharedPref.edit()) {
                        putString("last_url", url)
                        apply()
                    }
                }
                
                if (url != null && url.contains("strava.com/dashboard")) {
                    tvStatus.text = if (isBotRunning) "РАБОТАЕТ" else "ВХОД ВЫПОЛНЕН (ГОТОВ)"
                    tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
                    btnToggle.isEnabled = true
                    btnToggle.alpha = 1.0f
                    if (isBotRunning) {
                        Log.d(TAG, "Dashboard loaded, bot was running, will restart in 2s...")
                        // Даем React-приложению время отрендерить контент перед запуском бота
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            if (isBotRunning) {
                                restartBot()
                            }
                        }, 2000)
                    }
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

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume called")
        webView.onResume()
        webView.resumeTimers()
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val strategy = sharedPref.getString("strategy", "smart") ?: "smart"
        updateStrategyText(strategy)

        // Регистрируем receiver для остановки из уведомления
        registerReceiver(serviceStopReceiver, IntentFilter("com.strava.kudos.SERVICE_STOPPED"),
            Context.RECEIVER_NOT_EXPORTED)
    }

    override fun onPause() {
        super.onPause()
        Log.d(TAG, "onPause called, isBotRunning=$isBotRunning")
        // Если бот работает, НЕ останавливаем WebView — он должен работать в фоне
        if (!isBotRunning) {
            webView.onPause()
            webView.pauseTimers()
        }
    }

    override fun onStop() {
        super.onStop()
        Log.d(TAG, "onStop called")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy called")
        try {
            unregisterReceiver(serviceStopReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver may not be registered
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        Log.d(TAG, "onSaveInstanceState called")
        // Сохраняем URL на случай если система уничтожит Activity
        outState.putString("last_url", webView.url)
        // Сохраняем состояние WebView (история, скролл и т.д.)
        webView.saveState(outState)
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

    private fun updateStrategyText(strategy: String) {
        val strategyName = when (strategy) {
            "smart" -> "УМНАЯ"
            "top_only" -> "ТОЛЬКО НОВЫЕ"
            "aggressive" -> "АГРЕССИВНАЯ"
            "human" -> "ЧЕЛОВЕЧНАЯ"
            else -> "УМНАЯ"
        }
        tvStrategy.text = strategyName
    }

    private fun startBot() {
        Log.d(TAG, "startBot called")
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val minMs = sharedPref.getInt("min_delay", 5000)
        val maxMs = sharedPref.getInt("max_delay", 12000)
        val strategy = sharedPref.getString("strategy", "smart") ?: "smart"
        
        webView.evaluateJavascript("window.kudosMinDelay = $minMs; window.kudosMaxDelay = $maxMs; window.kudosStrategy = '$strategy';", null)

        val botScript = readAssetFile("bot.js")
        if (botScript.isNotEmpty()) {
            webView.evaluateJavascript(botScript, null)
            isBotRunning = true
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
            
            // Запускаем Foreground Service для работы в фоне
            startService(Intent(this, KudosService::class.java))
        }
    }

    private fun stopBot() {
        Log.d(TAG, "stopBot called")
        webView.evaluateJavascript("window.kudosBotShouldStop = true;", null)
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
        
        // Останавливаем сервис
        stopService(Intent(this, KudosService::class.java))
    }

    private fun restartBot() {
        Log.d(TAG, "restartBot called")
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val minMs = sharedPref.getInt("min_delay", 5000)
        val maxMs = sharedPref.getInt("max_delay", 12000)
        val strategy = sharedPref.getString("strategy", "smart") ?: "smart"
        webView.evaluateJavascript("window.kudosMinDelay = $minMs; window.kudosMaxDelay = $maxMs; window.kudosStrategy = '$strategy';", null)
        
        val botScript = readAssetFile("bot.js")
        if (botScript.isNotEmpty()) {
            webView.evaluateJavascript(botScript, null)
        }
        
        // Восстанавливаем UI и запускаем сервис (на случай если Activity была пересоздана)
        touchOverlay.visibility = android.view.View.VISIBLE
        tvStatus.text = "РАБОТАЕТ"
        tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
        btnToggle.text = "СТОП"
        btnToggle.setBackgroundResource(R.drawable.btn_secondary_bg)
        btnToggle.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
        
        // Перезапускаем Foreground Service если он не запущен
        startService(Intent(this, KudosService::class.java))
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

    inner class BotJavascriptInterface {
        @JavascriptInterface
        fun log(message: String) {
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
    }
}
