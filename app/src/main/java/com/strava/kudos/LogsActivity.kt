package com.strava.kudos

import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class LogsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_logs)

        val tvLogs = findViewById<TextView>(R.id.tvLogs)
        val scrollLog = findViewById<ScrollView>(R.id.scrollLog)
        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnClear = findViewById<Button>(R.id.btnClear)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val savedLogs = sharedPref.getString("logs", "[СИСТЕМА] Логи пусты\n")
        tvLogs.text = savedLogs

        btnBack.setOnClickListener {
            finish()
        }

        btnClear.setOnClickListener {
            with(sharedPref.edit()) {
                putString("logs", "")
                apply()
            }
            tvLogs.text = "[СИСТЕМА] Логи очищены\n"
        }
    }
}
