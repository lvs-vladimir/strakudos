package com.strava.kudos

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LogRepository(context: Context) {
    private val prefs = context.getSharedPreferences(SettingsRepository.PREFS_NAME, Context.MODE_PRIVATE)
    private val formatter = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    fun add(message: String, system: Boolean = false) {
        val prefix = if (system) "[СИСТЕМА] " else ""
        val logEntry = "[${formatter.format(Date())}] $prefix$message\n"
        val currentLogs = prefs.getString(KEY_LOGS, "") ?: ""
        val newLogs = (logEntry + currentLogs).take(MAX_LOG_SIZE)
        prefs.edit().putString(KEY_LOGS, newLogs).apply()
    }

    fun getAll(defaultValue: String = "[СИСТЕМА] Логи пусты\n"): String {
        return prefs.getString(KEY_LOGS, defaultValue) ?: defaultValue
    }

    fun clear() {
        prefs.edit().putString(KEY_LOGS, "").apply()
    }

    fun export(): String {
        return getAll("")
    }

    companion object {
        const val KEY_LOGS = "logs"
        private const val MAX_LOG_SIZE = 10_000
    }
}
