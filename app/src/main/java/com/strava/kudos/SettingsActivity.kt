package com.strava.kudos

import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnResetCounter = findViewById<Button>(R.id.btnResetCounter)

        btnBack.setOnClickListener {
            finish()
        }

        btnResetCounter.setOnClickListener {
            val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
            with(sharedPref.edit()) {
                putInt("kudos_count", 0)
                apply()
            }
            Toast.makeText(this, "Счетчик лайков сброшен", Toast.LENGTH_SHORT).show()
        }
    }
}
