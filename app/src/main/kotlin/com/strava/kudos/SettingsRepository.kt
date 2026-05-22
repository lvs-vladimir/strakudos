package com.strava.kudos

import android.content.Context
import android.content.SharedPreferences

class SettingsRepository(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getSettings(): BotSettings {
        return BotSettings(
            strategy = BotStrategyType.fromPref(getStrategyValue()),
            minDelayMs = getMinDelayMs(),
            maxDelayMs = getMaxDelayMs(),
            clubsSpeed = ClubsSpeed.fromPref(getClubsSpeedValue()),
            consecutiveLikedLimit = getConsecutiveLikedLimit(),
            smartCycleTimerEnabled = isSmartCycleTimerEnabled(),
            smartCycleTimerMinutes = getSmartCycleTimerMinutes(),
            kotlinStrategiesEnabled = areKotlinStrategiesEnabled(),
            autostartEnabled = isAutostartEnabled(),
            isBotRunning = isBotRunning(),
            kudosCount = getKudosCount(),
            lastUrl = getLastUrl()
        )
    }

    fun getStrategyValue(): String = prefs.getString(KEY_STRATEGY, BotStrategyType.SMART.prefValue) ?: BotStrategyType.SMART.prefValue
    fun setStrategy(value: String) = prefs.edit().putString(KEY_STRATEGY, value).apply()
    fun getStrategyType(): BotStrategyType = BotStrategyType.fromPref(getStrategyValue())

    fun getMinDelayMs(): Int = prefs.getInt(KEY_MIN_DELAY, 5000)
    fun setMinDelayMs(value: Int) = prefs.edit().putInt(KEY_MIN_DELAY, value).apply()

    fun getMaxDelayMs(): Int = prefs.getInt(KEY_MAX_DELAY, 12000)
    fun setMaxDelayMs(value: Int) = prefs.edit().putInt(KEY_MAX_DELAY, value).apply()

    fun getClubsSpeedValue(): String = prefs.getString(KEY_CLUBS_SPEED, ClubsSpeed.MEDIUM.prefValue) ?: ClubsSpeed.MEDIUM.prefValue
    fun setClubsSpeed(value: String) = prefs.edit().putString(KEY_CLUBS_SPEED, value).apply()
    fun getClubsSpeed(): ClubsSpeed = ClubsSpeed.fromPref(getClubsSpeedValue())

    fun getConsecutiveLikedLimit(): Int = prefs.getInt(KEY_CONSECUTIVE_LIMIT, 10)
    fun setConsecutiveLikedLimit(value: Int) = prefs.edit().putInt(KEY_CONSECUTIVE_LIMIT, value.coerceIn(1, 100)).apply()

    fun isSmartCycleTimerEnabled(): Boolean = prefs.getBoolean(KEY_SMART_CYCLE_TIMER_ENABLED, false)
    fun setSmartCycleTimerEnabled(value: Boolean) = prefs.edit().putBoolean(KEY_SMART_CYCLE_TIMER_ENABLED, value).apply()

    fun getSmartCycleTimerMinutes(): Int = prefs.getInt(KEY_SMART_CYCLE_TIMER_MINUTES, 10)
    fun setSmartCycleTimerMinutes(value: Int) = prefs.edit().putInt(KEY_SMART_CYCLE_TIMER_MINUTES, value.coerceIn(1, 1440)).apply()

    fun isAutostartEnabled(): Boolean = prefs.getBoolean(KEY_AUTOSTART, false)
    fun setAutostartEnabled(value: Boolean) = prefs.edit().putBoolean(KEY_AUTOSTART, value).apply()

    fun areKotlinStrategiesEnabled(): Boolean = prefs.getBoolean(KEY_KOTLIN_STRATEGIES, true)
    fun setKotlinStrategiesEnabled(value: Boolean) = prefs.edit().putBoolean(KEY_KOTLIN_STRATEGIES, value).apply()

    fun isBotRunning(): Boolean = prefs.getBoolean(KEY_IS_BOT_RUNNING, false)
    fun setBotRunning(value: Boolean) = prefs.edit().putBoolean(KEY_IS_BOT_RUNNING, value).apply()

    fun getKudosCount(): Int = prefs.getInt(KEY_KUDOS_COUNT, 0)
    fun setKudosCount(value: Int) = prefs.edit().putInt(KEY_KUDOS_COUNT, value).apply()
    fun resetKudosCount() = setKudosCount(0)

    fun getLastUrl(): String? = prefs.getString(KEY_LAST_URL, null)
    fun setLastUrl(value: String?) = prefs.edit().putString(KEY_LAST_URL, value).apply()

    companion object {
        const val PREFS_NAME = "strakudos_prefs"
        const val KEY_STRATEGY = "strategy"
        const val KEY_MIN_DELAY = "min_delay"
        const val KEY_MAX_DELAY = "max_delay"
        const val KEY_CLUBS_SPEED = "clubs_speed"
        const val KEY_CONSECUTIVE_LIMIT = "consecutive_liked_limit"
        const val KEY_SMART_CYCLE_TIMER_ENABLED = "smart_cycle_timer_enabled"
        const val KEY_SMART_CYCLE_TIMER_MINUTES = "smart_cycle_timer_minutes"
        const val KEY_AUTOSTART = "autostart_enabled"
        const val KEY_KOTLIN_STRATEGIES = "kotlin_strategies_enabled"
        const val KEY_IS_BOT_RUNNING = "is_bot_running"
        const val KEY_KUDOS_COUNT = "kudos_count"
        const val KEY_LAST_URL = "last_url"
    }
}
