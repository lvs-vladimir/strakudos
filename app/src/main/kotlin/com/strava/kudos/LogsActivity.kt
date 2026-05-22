package com.strava.kudos

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class LogsActivity : AppCompatActivity() {

    private lateinit var logRepository: LogRepository
    private lateinit var tvLogs: TextView
    private lateinit var scrollLog: ScrollView
    private lateinit var prefs: SharedPreferences

    private val logsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == LogRepository.KEY_LOGS) {
            runOnUiThread { refreshLogs() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_logs)

        logRepository = LogRepository(this)
        prefs = getSharedPreferences(SettingsRepository.PREFS_NAME, Context.MODE_PRIVATE)
        tvLogs = findViewById(R.id.tvLogs)
        scrollLog = findViewById(R.id.scrollLog)
        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnClear = findViewById<Button>(R.id.btnClear)
        val btnShare = findViewById<Button>(R.id.btnShare)

        refreshLogs()

        btnBack.setOnClickListener {
            finish()
        }

        btnClear.setOnClickListener {
            logRepository.clear()
            refreshLogs()
        }

        btnShare.setOnClickListener {
            val logs = tvLogs.text.toString()

            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Strakudos Logs", logs)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(this, "Логи скопированы буфер!", Toast.LENGTH_SHORT).show()

            val sendIntent = Intent().apply {
                action = Intent.ACTION_SEND
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, logs)
                putExtra(Intent.EXTRA_SUBJECT, "Strakudos Logs")
            }

            val shareIntent = Intent.createChooser(sendIntent, "Отправить логи")
            startActivity(shareIntent)
        }
    }

    override fun onResume() {
        super.onResume()
        prefs.registerOnSharedPreferenceChangeListener(logsListener)
        refreshLogs()
    }

    override fun onPause() {
        prefs.unregisterOnSharedPreferenceChangeListener(logsListener)
        super.onPause()
    }

    private fun refreshLogs() {
        tvLogs.text = logRepository.getAll()
        scrollLog.post {
            scrollLog.fullScroll(ScrollView.FOCUS_UP)
        }
    }
}
