package com.strava.kudos

import android.os.Bundle
import android.content.Intent
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.RadioGroup
import android.widget.Switch
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnResetCounter = findViewById<Button>(R.id.btnResetCounter)
        val radioClubsSpeed = findViewById<RadioGroup>(R.id.radioClubsSpeed)
        val etConsecutiveLimit = findViewById<EditText>(R.id.etConsecutiveLimit)
        val switchApiV3 = findViewById<Switch>(R.id.switchApiV3)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val currentSpeed = sharedPref.getString("clubs_speed", "medium") ?: "medium"
        val currentConsecutiveLimit = sharedPref.getInt("consecutive_liked_limit", 10)
        val useApiV3 = sharedPref.getBoolean("use_api_v3", false)

        // Устанавливаем текущее значение
        when (currentSpeed) {
            "slow" -> radioClubsSpeed.check(R.id.radioSlow)
            "medium" -> radioClubsSpeed.check(R.id.radioMedium)
            "fast" -> radioClubsSpeed.check(R.id.radioFast)
            "ultra" -> radioClubsSpeed.check(R.id.radioUltra)
        }

        // Устанавливаем лимит подряд уже-лайкнутых
        etConsecutiveLimit.setText(currentConsecutiveLimit.toString())
        switchApiV3.isChecked = useApiV3

        switchApiV3.setOnCheckedChangeListener { _, isChecked ->
            with(sharedPref.edit()) {
                putBoolean("use_api_v3", isChecked)
                apply()
            }
            Toast.makeText(this, if (isChecked) "API v3 включен" else "API v3 выключен", Toast.LENGTH_SHORT).show()
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

        // Сохраняем лимит при изменении
        etConsecutiveLimit.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                val value = etConsecutiveLimit.text.toString().toIntOrNull() ?: 10
                val validValue = value.coerceIn(1, 100)
                etConsecutiveLimit.setText(validValue.toString())
                with(sharedPref.edit()) {
                    putInt("consecutive_liked_limit", validValue)
                    apply()
                }
            }
        }

        btnBack.setOnClickListener {
            // Сохраняем при выходе тоже
            val value = etConsecutiveLimit.text.toString().toIntOrNull() ?: 10
            val validValue = value.coerceIn(1, 100)
            with(sharedPref.edit()) {
                putInt("consecutive_liked_limit", validValue)
                apply()
            }
            finish()
        }

        btnResetCounter.setOnClickListener {
            with(sharedPref.edit()) {
                putInt("kudos_count", 0)
                apply()
            }
            // Отправляем Intent в MainActivity для очистки localStorage WebView
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("reset_liked_data", true)
            startActivity(intent)
            Toast.makeText(this, "Счетчик и список лайков сброшены", Toast.LENGTH_SHORT).show()
        }

        // Кнопка тестирования API
        val btnTestApi = findViewById<Button>(R.id.btnTestApi)
        val etTestActivityId = findViewById<EditText>(R.id.etTestActivityId)
        btnTestApi.setOnClickListener {
            val activityId = etTestActivityId.text.toString().trim()
            if (activityId.isEmpty()) {
                Toast.makeText(this, "Введи ID активности для теста", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("run_api_test", true)
            intent.putExtra("test_activity_id", activityId)
            startActivity(intent)
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
