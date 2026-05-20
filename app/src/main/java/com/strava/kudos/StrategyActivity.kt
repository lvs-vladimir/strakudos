package com.strava.kudos

import android.os.Bundle
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class StrategyActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_strategy)

        val tvStrategy = findViewById<TextView>(R.id.tvStrategy)
        val btnBack = findViewById<ImageButton>(R.id.btnBack)

        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val kudosCount = sharedPref.getInt("kudos_count", 0)
        val minDelay = sharedPref.getInt("min_delay", 5000)
        val maxDelay = sharedPref.getInt("max_delay", 12000)

        tvStrategy.text = """
            Текущая стратегия работы бота:
            
            1. Бот сканирует видимую часть ленты и ставит лайки
            
            2. Если нет тренировок - скроллит вниз небольшими шагами
            
            3. При достижении предела - возвращается в начало ленты
            
            4. Обновляет страницу для получения новых тренировок
            
            Интервал задержки:
            Минимум: $minDelay мс
            Максимум: $maxDelay мс
            
            Всего отправлено лайков: $kudosCount
        """.trimIndent()

        btnBack.setOnClickListener {
            finish()
        }
    }
}
