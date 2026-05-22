package com.strava.kudos

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.RadioGroup
import android.widget.Switch
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {
    private lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        settingsRepository = SettingsRepository(this)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val btnResetCounter = findViewById<Button>(R.id.btnResetCounter)
        val radioClubsSpeed = findViewById<RadioGroup>(R.id.radioClubsSpeed)
        val etConsecutiveLimit = findViewById<EditText>(R.id.etConsecutiveLimit)
        val switchAutostart = findViewById<Switch>(R.id.switchAutostart)

        val currentSpeed = settingsRepository.getClubsSpeed()
        val currentConsecutiveLimit = settingsRepository.getConsecutiveLikedLimit()
        val autostartEnabled = settingsRepository.isAutostartEnabled()

        when (currentSpeed) {
            ClubsSpeed.SLOW -> radioClubsSpeed.check(R.id.radioSlow)
            ClubsSpeed.MEDIUM -> radioClubsSpeed.check(R.id.radioMedium)
            ClubsSpeed.FAST -> radioClubsSpeed.check(R.id.radioFast)
            ClubsSpeed.ULTRA -> radioClubsSpeed.check(R.id.radioUltra)
        }

        etConsecutiveLimit.setText(currentConsecutiveLimit.toString())
        switchAutostart.isChecked = autostartEnabled

        switchAutostart.setOnCheckedChangeListener { _, isChecked ->
            settingsRepository.setAutostartEnabled(isChecked)
            Toast.makeText(
                this,
                if (isChecked) "Автозапуск включен" else "Автозапуск выключен",
                Toast.LENGTH_SHORT
            ).show()
        }

        radioClubsSpeed.setOnCheckedChangeListener { _, checkedId ->
            val speed = when (checkedId) {
                R.id.radioSlow -> ClubsSpeed.SLOW
                R.id.radioMedium -> ClubsSpeed.MEDIUM
                R.id.radioFast -> ClubsSpeed.FAST
                R.id.radioUltra -> ClubsSpeed.ULTRA
                else -> ClubsSpeed.MEDIUM
            }
            settingsRepository.setClubsSpeed(speed.prefValue)
            Toast.makeText(this, "Скорость: ${speed.displayName}", Toast.LENGTH_SHORT).show()
        }

        etConsecutiveLimit.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) saveConsecutiveLimit(etConsecutiveLimit)
        }

        btnBack.setOnClickListener {
            saveConsecutiveLimit(etConsecutiveLimit)
            finish()
        }

        btnResetCounter.setOnClickListener {
            settingsRepository.resetKudosCount()
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("reset_liked_data", true)
            startActivity(intent)
            Toast.makeText(this, "Счетчик список лайков сброшены", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveConsecutiveLimit(etConsecutiveLimit: EditText) {
        val value = etConsecutiveLimit.text.toString().toIntOrNull() ?: 10
        val validValue = value.coerceIn(1, 100)
        etConsecutiveLimit.setText(validValue.toString())
        settingsRepository.setConsecutiveLikedLimit(validValue)
    }
}
