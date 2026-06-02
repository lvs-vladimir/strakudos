package com.strava.kudos

enum class BotStrategyType(val prefValue: String, val displayName: String) {
    SMART("smart", "УМНАЯ"),
    TOP_ONLY("top_only", "ТОЛЬКО НОВЫЕ"),
    AGGRESSIVE("aggressive", "АГРЕССИВНАЯ"),
    HUMAN("human", "ЧЕЛОВЕЧНАЯ"),
    CLUBS("clubs", "КЛУБЫ");

    companion object {
        fun fromPref(value: String?): BotStrategyType {
            return entries.firstOrNull { it.prefValue == value } ?: SMART
        }
    }
}

enum class ClubsSpeed(val prefValue: String, val displayName: String, val minDelayMs: Int, val maxDelayMs: Int) {
    SLOW("slow", "Медленно", 2000, 5000),
    MEDIUM("medium", "Средне", 1000, 2500),
    FAST("fast", "Быстро", 500, 1200),
    ULTRA("ultra", "Очень быстро", 300, 500);

    companion object {
        fun fromPref(value: String?): ClubsSpeed {
            return entries.firstOrNull { it.prefValue == value } ?: MEDIUM
        }
    }
}

data class BotSettings(
    val strategy: BotStrategyType = BotStrategyType.SMART,
    val minDelayMs: Int = 5000,
    val maxDelayMs: Int = 12000,
    val clubsSpeed: ClubsSpeed = ClubsSpeed.MEDIUM,
    val consecutiveLikedLimit: Int = 10,
    val smartCycleTimerEnabled: Boolean = false,
    val smartCycleTimerMinutes: Int = 10,
    val kotlinStrategiesEnabled: Boolean = true,
    val autostartEnabled: Boolean = false,
    val isBotRunning: Boolean = false,
    val kudosCount: Int = 0,
    val lastUrl: String? = null,
    val generateGpxQrEnabled: Boolean = false,
    val gpxUploadPassword: String = "",
    val gpxQrMinDistanceKm: Int = 0
)
