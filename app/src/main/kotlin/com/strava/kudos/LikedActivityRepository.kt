package com.strava.kudos

import android.content.Context

class LikedActivityRepository(context: Context) {
    private val prefs = context.getSharedPreferences(SettingsRepository.PREFS_NAME, Context.MODE_PRIVATE)

    fun isLiked(activityId: String): Boolean = getLikedSet().contains(activityId)

    fun markLiked(activityId: String) {
        if (activityId.isBlank()) return
        val updated = getLikedSet().toMutableSet()
        updated.add(activityId)
        save(updated)
    }

    fun reset() {
        prefs.edit().remove(KEY_LIKED_ACTIVITIES).apply()
    }

    fun count(): Int = getLikedSet().size

    private fun getLikedSet(): Set<String> {
        return prefs.getStringSet(KEY_LIKED_ACTIVITIES, emptySet()) ?: emptySet()
    }

    private fun save(values: Set<String>) {
        prefs.edit().putStringSet(KEY_LIKED_ACTIVITIES, values).apply()
    }

    companion object {
        private const val KEY_LIKED_ACTIVITIES = "liked_activities"
    }
}
