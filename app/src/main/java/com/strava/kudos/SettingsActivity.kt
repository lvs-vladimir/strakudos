package com.strava.kudos

import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.RadioGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnResetCounter = findViewById<Button>(R.id.btnResetCounter)
        val radioClubsSpeed = findViewById<RadioGroup>(R.id.radioClubsSpeed)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val currentSpeed = sharedPref.getString("clubs_speed", "medium") ?: "medium"

        // Устанавливаем текущее значение
        when (currentSpeed) {
            "slow" -> radioClubsSpeed.check(R.id.radioSlow)
            "medium" -> radioClubsSpeed.check(R.id.radioMedium)
            "fast" -> radioClubsSpeed.check(R.id.radioFast)
            "ultra" -> radioClubsSpeed.check(R.id.radioUltra)
        }

        // Слушаем изменения
        radioClubsSpeed.setOnCheckedChangeListener { _, checkedId ->
            val speed = when (checkedId) {
                R.id.radioSlow -> "slow"
                R.id.radioMedium -> "medium"
                R.id.radioFast -> "fast"
                R.id.radioUltra -> "ultra"
                else -> "medium"
            }
            with(sharedPref.edit()) {
                putString("clubs_speed", speed)
                apply()
            }
            Toast.makeText(this, "Скорость: ${getSpeedName(speed)}", Toast.LENGTH_SHORT).show()
        }

        btnBack.setOnClickListener {
            finish()
        }

        btnResetCounter.setOnClickListener {
            with(sharedPref.edit()) {
                putInt("kudos_count", 0)
                apply()
            }
            Toast.makeText(this, "Счетчик лайков сброшен", Toast.LENGTH_SHORT).show()
        }
    }

    private fun getSpeedName(speed: String): String {
        return when (speed) {
            "slow" -> "Медленно"
            "medium" -> "Средне"
            "fast" -> "Быстро"
            "ultra" -> "Очень быстро"
            else -> "Средне"
        }
    }
}
