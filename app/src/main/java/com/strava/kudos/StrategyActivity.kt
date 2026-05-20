package com.strava.kudos

import android.os.Bundle
import android.widget.ImageButton
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class StrategyActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_strategy)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val radioGroup = findViewById<RadioGroup>(R.id.radioStrategies)
        val tvCurrentSettings = findViewById<TextView>(R.id.tvCurrentSettings)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val currentStrategy = sharedPref.getString("strategy", "smart") ?: "smart"
        val kudosCount = sharedPref.getInt("kudos_count", 0)
        val minDelay = sharedPref.getInt("min_delay", 5000)
        val maxDelay = sharedPref.getInt("max_delay", 12000)

        // Set current selection
        when (currentStrategy) {
            "smart" -> radioGroup.check(R.id.radioSmart)
            "top_only" -> radioGroup.check(R.id.radioTopOnly)
            "aggressive" -> radioGroup.check(R.id.radioAggressive)
            "human" -> radioGroup.check(R.id.radioHuman)
        }

        // Save on change
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
            updateSettingsText(tvCurrentSettings, strategy, minDelay, maxDelay, kudosCount)
        }

        updateSettingsText(tvCurrentSettings, currentStrategy, minDelay, maxDelay, kudosCount)

        btnBack.setOnClickListener {
            finish()
        }
    }

    private fun updateSettingsText(tv: TextView, strategy: String, minDelay: Int, maxDelay: Int, kudosCount: Int) {
        val strategyName = when (strategy) {
            "smart" -> "Умная"
            "top_only" -> "Только новые"
            "aggressive" -> "Агрессивная"
            "human" -> "Человечная"
            else -> "Умная"
        }

        tv.text = """
            ТЕКУЩИЕ НАСТРОЙКИ
            
            Стратегия: $strategyName
            Интервал задержки: $minDelay - $maxDelay мс
            Всего отправлено лайков: $kudosCount
        """.trimIndent()
    }
}
