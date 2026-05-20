package com.strava.kudos

import android.os.Bundle
import android.widget.EditText
import android.widget.ImageButton
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doOnTextChanged

class StrategyActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_strategy)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val radioGroup = findViewById<RadioGroup>(R.id.radioStrategies)
        val tvCurrentSettings = findViewById<TextView>(R.id.tvCurrentSettings)
        val etMinDelay = findViewById<EditText>(R.id.etMinDelay)
        val etMaxDelay = findViewById<EditText>(R.id.etMaxDelay)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val currentStrategy = sharedPref.getString("strategy", "smart") ?: "smart"
        val kudosCount = sharedPref.getInt("kudos_count", 0)
        val savedMinDelay = sharedPref.getInt("min_delay", 5000)
        val savedMaxDelay = sharedPref.getInt("max_delay", 12000)

        etMinDelay.setText(savedMinDelay.toString())
        etMaxDelay.setText(savedMaxDelay.toString())

        when (currentStrategy) {
            "smart" -> radioGroup.check(R.id.radioSmart)
            "top_only" -> radioGroup.check(R.id.radioTopOnly)
            "aggressive" -> radioGroup.check(R.id.radioAggressive)
            "human" -> radioGroup.check(R.id.radioHuman)
        }

        radioGroup.setOnCheckedChangeListener { _, checkedId ->
            val strategy = when (checkedId) {
                R.id.radioSmart -> "smart"
                R.id.radioTopOnly -> "top_only"
                R.id.radioAggressive -> "aggressive"
                R.id.radioHuman -> "human"
                else -> "smart"
            }
            with(sharedPref.edit()) {
                putString("strategy", strategy)
                apply()
            }
            updateSettingsText(tvCurrentSettings, strategy, etMinDelay, etMaxDelay, kudosCount)
        }

        etMinDelay.doOnTextChanged { _, _, _, _ ->
            val min = etMinDelay.text.toString().toIntOrNull() ?: 5000
            val max = etMaxDelay.text.toString().toIntOrNull() ?: 12000
            with(sharedPref.edit()) {
                putInt("min_delay", min)
                putInt("max_delay", max)
                apply()
            }
            updateSettingsText(tvCurrentSettings, sharedPref.getString("strategy", "smart") ?: "smart", etMinDelay, etMaxDelay, kudosCount)
        }

        etMaxDelay.doOnTextChanged { _, _, _, _ ->
            val min = etMinDelay.text.toString().toIntOrNull() ?: 5000
            val max = etMaxDelay.text.toString().toIntOrNull() ?: 12000
            with(sharedPref.edit()) {
                putInt("min_delay", min)
                putInt("max_delay", max)
                apply()
            }
            updateSettingsText(tvCurrentSettings, sharedPref.getString("strategy", "smart") ?: "smart", etMinDelay, etMaxDelay, kudosCount)
        }

        updateSettingsText(tvCurrentSettings, currentStrategy, etMinDelay, etMaxDelay, kudosCount)

        btnBack.setOnClickListener {
            finish()
        }
    }

    private fun updateSettingsText(tv: TextView, strategy: String, etMin: EditText, etMax: EditText, kudosCount: Int) {
        val strategyName = when (strategy) {
            "smart" -> "Умная"
            "top_only" -> "Только новые"
            "aggressive" -> "Агрессивная"
            "human" -> "Человечная"
            else -> "Умная"
        }

        val min = etMin.text.toString().toIntOrNull() ?: 5000
        val max = etMax.text.toString().toIntOrNull() ?: 12000

        tv.text = """
            ТЕКУЩИЕ НАСТРОЙКИ
            
            Стратегия: $strategyName
            Интервал задержки: $min - $max мс
            Всего отправлено лайков: $kudosCount
        """.trimIndent()
    }
}
