package com.strava.kudos

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class LogsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_logs)

        val logRepository = LogRepository(this)
        val tvLogs = findViewById<TextView>(R.id.tvLogs)
        val scrollLog = findViewById<ScrollView>(R.id.scrollLog)
        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnClear = findViewById<Button>(R.id.btnClear)
        val btnShare = findViewById<Button>(R.id.btnShare)

        tvLogs.text = logRepository.getAll()
        scrollLog.post { scrollLog.fullScroll(ScrollView.FOCUS_UP) }

        btnBack.setOnClickListener {
            finish()
        }

        btnClear.setOnClickListener {
            logRepository.clear()
            tvLogs.text = "[СИСТЕМА] Логи очищены\n"
        }

        btnShare.setOnClickListener {
            val logs = tvLogs.text.toString()

            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Strakudos Logs", logs)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(this, "Логи скопированы в буфер!", Toast.LENGTH_SHORT).show()

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
}
