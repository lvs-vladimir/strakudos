package com.strava.kudos

import android.os.Bundle
import android.widget.EditText
import android.widget.ImageButton
import android.widget.RadioGroup
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doOnTextChanged

class StrategyActivity : AppCompatActivity() {

    private lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_strategy)

        settingsRepository = SettingsRepository(this)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val radioGroup = findViewById<RadioGroup>(R.id.radioStrategies)
        val tvCurrentSettings = findViewById<TextView>(R.id.tvCurrentSettings)
        val etMinDelay = findViewById<EditText>(R.id.etMinDelay)
        val etMaxDelay = findViewById<EditText>(R.id.etMaxDelay)
        val switchSmartTimer = findViewById<Switch>(R.id.switchSmartTimer)
        val etSmartTimerMinutes = findViewById<EditText>(R.id.etSmartTimerMinutes)

        val settings = settingsRepository.getSettings()
        val currentStrategy = settings.strategy.prefValue
        val kudosCount = settings.kudosCount

        etMinDelay.setText(settings.minDelayMs.toString())
        etMaxDelay.setText(settings.maxDelayMs.toString())
        switchSmartTimer.isChecked = settings.smartCycleTimerEnabled
        etSmartTimerMinutes.setText(settings.smartCycleTimerMinutes.toString())

        when (settings.strategy) {
            BotStrategyType.SMART -> radioGroup.check(R.id.radioSmart)
            BotStrategyType.TOP_ONLY -> radioGroup.check(R.id.radioTopOnly)
            BotStrategyType.AGGRESSIVE -> radioGroup.check(R.id.radioAggressive)
            BotStrategyType.HUMAN -> radioGroup.check(R.id.radioHuman)
            BotStrategyType.CLUBS -> radioGroup.check(R.id.radioClubs)
        }

        radioGroup.setOnCheckedChangeListener { _, checkedId ->
            val strategy = when (checkedId) {
                R.id.radioSmart -> BotStrategyType.SMART
                R.id.radioTopOnly -> BotStrategyType.TOP_ONLY
                R.id.radioAggressive -> BotStrategyType.AGGRESSIVE
                R.id.radioHuman -> BotStrategyType.HUMAN
                R.id.radioClubs -> BotStrategyType.CLUBS
                else -> BotStrategyType.SMART
            }
            settingsRepository.setStrategy(strategy.prefValue)
            updateSettingsText(tvCurrentSettings, strategy.prefValue, etMinDelay, etMaxDelay, switchSmartTimer, etSmartTimerMinutes, kudosCount)
        }

        switchSmartTimer.setOnCheckedChangeListener { _, isChecked ->
            settingsRepository.setSmartCycleTimerEnabled(isChecked)
            updateSettingsText(tvCurrentSettings, settingsRepository.getStrategyValue(), etMinDelay, etMaxDelay, switchSmartTimer, etSmartTimerMinutes, kudosCount)
        }

        etSmartTimerMinutes.doOnTextChanged { _, _, _, _ ->
            saveSmartTimerMinutes(etSmartTimerMinutes)
            updateSettingsText(tvCurrentSettings, settingsRepository.getStrategyValue(), etMinDelay, etMaxDelay, switchSmartTimer, etSmartTimerMinutes, kudosCount)
        }

        etSmartTimerMinutes.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) normalizeSmartTimerMinutes(etSmartTimerMinutes)
        }

        etMinDelay.doOnTextChanged { _, _, _, _ ->
            saveDelay(etMinDelay, etMaxDelay)
            updateSettingsText(tvCurrentSettings, settingsRepository.getStrategyValue(), etMinDelay, etMaxDelay, switchSmartTimer, etSmartTimerMinutes, kudosCount)
        }

        etMaxDelay.doOnTextChanged { _, _, _, _ ->
            saveDelay(etMinDelay, etMaxDelay)
            updateSettingsText(tvCurrentSettings, settingsRepository.getStrategyValue(), etMinDelay, etMaxDelay, switchSmartTimer, etSmartTimerMinutes, kudosCount)
        }

        updateSettingsText(tvCurrentSettings, currentStrategy, etMinDelay, etMaxDelay, switchSmartTimer, etSmartTimerMinutes, kudosCount)

        btnBack.setOnClickListener {
            normalizeSmartTimerMinutes(etSmartTimerMinutes)
            finish()
        }
    }

    private fun saveDelay(etMin: EditText, etMax: EditText) {
        val min = etMin.text.toString().toIntOrNull() ?: 5000
        val max = etMax.text.toString().toIntOrNull() ?: 12000
        settingsRepository.setMinDelayMs(min)
        settingsRepository.setMaxDelayMs(max)
    }

    private fun saveSmartTimerMinutes(etMinutes: EditText) {
        val minutes = etMinutes.text.toString().toIntOrNull() ?: 10
        settingsRepository.setSmartCycleTimerMinutes(minutes)
    }

    private fun normalizeSmartTimerMinutes(etMinutes: EditText) {
        val minutes = (etMinutes.text.toString().toIntOrNull() ?: 10).coerceIn(1, 1440)
        etMinutes.setText(minutes.toString())
        settingsRepository.setSmartCycleTimerMinutes(minutes)
    }

    private fun updateSettingsText(
        tv: TextView,
        strategy: String,
        etMin: EditText,
        etMax: EditText,
        switchSmartTimer: Switch,
        etSmartTimerMinutes: EditText,
        kudosCount: Int
    ) {
        val strategyName = when (BotStrategyType.fromPref(strategy)) {
            BotStrategyType.SMART -> "Умная"
            BotStrategyType.TOP_ONLY -> "Только новые"
            BotStrategyType.AGGRESSIVE -> "Агрессивная"
            BotStrategyType.HUMAN -> "Человечная"
            BotStrategyType.CLUBS -> "Клубы (ротация)"
        }

        val min = etMin.text.toString().toIntOrNull() ?: 5000
        val max = etMax.text.toString().toIntOrNull() ?: 12000
        val timerStatus = if (switchSmartTimer.isChecked) "вкл" else "выкл"
        val timerMinutes = etSmartTimerMinutes.text.toString().toIntOrNull() ?: 10

        tv.text = """
            ТЕКУЩИЕ НАСТРОЙКИ

            Стратегия: $strategyName
            Интервал задержки: $min - $max мс
            Таймер умной стратегии: $timerStatus, $timerMinutes мин
            Всего отправлено лайков: $kudosCount
        """.trimIndent()
    }
}
