package com.strava.kudos

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.CookieManager
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.drawerlayout.widget.DrawerLayout
import com.google.android.material.navigation.NavigationView
import java.io.BufferedReader
import java.io.InputStreamReader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var tvStatus: TextView
    private lateinit var tvStats: TextView
    private lateinit var tvLogs: TextView
    private lateinit var scrollLog: ScrollView
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button
    private lateinit var btnClear: Button
    private lateinit var etMinDelay: android.widget.EditText
    private lateinit var etMaxDelay: android.widget.EditText
    private lateinit var touchOverlay: android.view.View
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var navigationView: NavigationView
    private lateinit var btnMenu: android.widget.ImageButton

    private var kudosCount = 0
    private var isBotRunning = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        tvStatus = findViewById(R.id.tvStatus)
        tvStats = findViewById(R.id.tvStats)
        tvLogs = findViewById(R.id.tvLogs)
        scrollLog = findViewById(R.id.scrollLog)
        btnStart = findViewById(R.id.btnStart)
        btnStop = findViewById(R.id.btnStop)
        btnClear = findViewById(R.id.btnClear)
        etMinDelay = findViewById(R.id.etMinDelay)
        etMaxDelay = findViewById(R.id.etMaxDelay)
        touchOverlay = findViewById(R.id.touchOverlay)
        drawerLayout = findViewById(R.id.drawerLayout)
        navigationView = findViewById(R.id.navigationView)
        btnMenu = findViewById(R.id.btnMenu)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val savedMin = sharedPref.getInt("min_delay", 5000)
        val savedMax = sharedPref.getInt("max_delay", 12000)
        kudosCount = sharedPref.getInt("kudos_count", 0)
        etMinDelay.setText(savedMin.toString())
        etMaxDelay.setText(savedMax.toString())
        tvStats.text = "ЛАЙКОВ ОТПРАВЛЕНО: $kudosCount"

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
                appendLog("Страница загружена: $url")
                
                if (url != null && url.contains("strava.com/dashboard")) {
                    tvStatus.text = "ВХОД ВЫПОЛНЕН (ГОТОВ)"
                    tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
                } else if (url != null && url.contains("login")) {
                    tvStatus.text = "ОЖИДАНИЕ ВХОДА"
                    tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
                }
            }
        }

        webView.addJavascriptInterface(BotJavascriptInterface(), "AndroidApp")

        webView.loadUrl("https://www.strava.com/login")

        btnStart.setOnClickListener {
            startBot()
        }

        btnStop.setOnClickListener {
            stopBot()
        }

        btnClear.setOnClickListener {
            tvLogs.text = ""
        }

        btnMenu.setOnClickListener {
            drawerLayout.openDrawer(androidx.core.view.GravityCompat.START)
        }

        navigationView.setNavigationItemSelectedListener { menuItem ->
            drawerLayout.closeDrawers()
            when (menuItem.itemId) {
                R.id.nav_strategy -> showStrategyDialog()
                R.id.nav_settings -> showSettingsDialog()
                R.id.nav_about -> showAboutDialog()
            }
            true
        }
    }

    private fun showStrategyDialog() {
        AlertDialog.Builder(this, androidx.appcompat.R.style.ThemeOverlay_AppCompat_Dialog_Alert)
            .setTitle("Стратегия работы бота")
            .setMessage(
                "Текущая стратегия:\n\n" +
                "1. Бот сканирует видимую часть ленты и ставит лайки\n" +
                "2. Если нет тренировок - скроллит вниз небольшими шагами\n" +
                "3. При достижении предела - возвращается в начало ленты\n" +
                "4. Обновляет страницу для получения новых тренировок\n\n" +
                "Интервал задержки:\n" +
                "Мин: ${etMinDelay.text} мс\n" +
                "Макс: ${etMaxDelay.text} мс\n\n" +
                "Всего отправлено лайков: $kudosCount"
            )
            .setPositiveButton("OK", null)
            .show()
            .apply {
                window?.setBackgroundDrawableResource(android.R.color.black)
            }
    }

    private fun showSettingsDialog() {
        val builder = AlertDialog.Builder(this, androidx.appcompat.R.style.ThemeOverlay_AppCompat_Dialog_Alert)
        builder.setTitle("Настройки")
        
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(40, 20, 40, 20)
        }
        
        val resetCountBtn = Button(this).apply {
            text = "Сбросить счетчик лайков"
            setBackgroundColor(android.graphics.Color.parseColor("#00F0FF"))
            setTextColor(android.graphics.Color.BLACK)
        }
        
        resetCountBtn.setOnClickListener {
            kudosCount = 0
            val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
            with(sharedPref.edit()) {
                putInt("kudos_count", 0)
                apply()
            }
            tvStats.text = "ЛАЙКОВ ОТПРАВЛЕНО: 0"
            appendLog("Счетчик лайков сброшен")
        }
        
        layout.addView(resetCountBtn)
        
        builder.setView(layout)
        builder.setPositiveButton("OK", null)
        builder.show()
            .apply {
                window?.setBackgroundDrawableResource(android.R.color.black)
            }
    }

    private fun showAboutDialog() {
        AlertDialog.Builder(this, androidx.appcompat.R.style.ThemeOverlay_AppCompat_Dialog_Alert)
            .setTitle("О приложении")
            .setMessage(
                "Strakudos v1.0.0\n\n" +
                "Автоматизация лайков для Strava\n\n" +
                "Особенности:\n" +
                "- Автоматические лайки друзьям\n" +
                "- Настраиваемый интервал задержки\n" +
                "- Блокировка экрана во время работы\n" +
                "- Сохранение настроек и статистики\n" +
                "- Умная стратегия прокрутки\n\n" +
                "Дизайн: Vision Framework\n" +
                "Язык: Русский"
            )
            .setPositiveButton("OK", null)
            .show()
            .apply {
                window?.setBackgroundDrawableResource(android.R.color.black)
            }
    }

    private fun startBot() {
        val minMs = etMinDelay.text.toString().toIntOrNull() ?: 5000
        val maxMs = etMaxDelay.text.toString().toIntOrNull() ?: 12000
        
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        with(sharedPref.edit()) {
            putInt("min_delay", minMs)
            putInt("max_delay", maxMs)
            apply()
        }

        appendLog("Установлен интервал случайной задержки: $minMs - $maxMs мс.")
        webView.evaluateJavascript("window.kudosMinDelay = $minMs; window.kudosMaxDelay = $maxMs;", null)

        appendLog("Запуск скрипта автоматизации...")
        val botScript = readAssetFile("bot.js")
        if (botScript.isNotEmpty()) {
            webView.evaluateJavascript(botScript, null)
            isBotRunning = true
            btnStart.isEnabled = false
            btnStop.isEnabled = true
            touchOverlay.visibility = android.view.View.VISIBLE
            tvStatus.text = "РАБОТАЕТ"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#00F0FF"))
        } else {
            appendLog("Ошибка: Не удалось загрузить bot.js!")
        }
    }

    private fun stopBot() {
        appendLog("Остановка скрипта автоматизации...")
        webView.evaluateJavascript("window.kudosBotShouldStop = true;", null)
        isBotRunning = false
        btnStart.isEnabled = true
        btnStop.isEnabled = false
        touchOverlay.visibility = android.view.View.GONE
        tvStatus.text = "ОСТАНОВЛЕН"
        tvStatus.setTextColor(android.graphics.Color.parseColor("#FFFFFF"))
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

    private fun appendLog(message: String) {
        runOnUiThread {
            tvLogs.append("[$currentTimestamp] $message\n")
            scrollLog.post {
                scrollLog.fullScroll(ScrollView.FOCUS_DOWN)
            }
        }
    }

    private val currentTimestamp: String
        get() {
            val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
            return sdf.format(java.util.Date())
        }

    inner class BotJavascriptInterface {
        @JavascriptInterface
        fun log(message: String) {
            appendLog(message)
        }

        @JavascriptInterface
        fun onKudosGiven(athleteName: String) {
            runOnUiThread {
                kudosCount++
                tvStats.text = "ЛАЙКОВ ОТПРАВЛЕНО: $kudosCount"
                val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
                with(sharedPref.edit()) {
                    putInt("kudos_count", kudosCount)
                    apply()
                }
                appendLog("🔥 Успешно отправлен лайк спортсмену $athleteName!")
            }
        }
    }
}
